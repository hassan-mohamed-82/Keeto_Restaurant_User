import { Request, Response } from "express";
import { db } from "../../models/connection";
import {
    weightRequests,
    cartItems,
    food,
    variationOptions,
    foodVariations,
    addons,
    restaurants,
    restaurantSettings,
    users,
    branches,
} from "../../models/schema";
import { eq, and, inArray, desc, sql, count } from "drizzle-orm";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { UnauthorizedError } from "../../Errors";
import { SuccessResponse } from "../../utils/response";
import { v4 as uuidv4 } from "uuid";
import {
    computeWeightedLineTotal,
    calcMaxAllowedWeight,
    validateOptionPriceMode,
    validateWeightInput,
    isWeightWithinLimit,
    isSaneWeight,
    parseBooleanInput,
} from "../../helpers/weightPricing.helper";
import {
    ACTIVE_WEIGHT_REQUEST_STATUSES,
    CART_OWNING_STATUSES,
    DEFAULT_WEIGHT_CUSTOMER_TIMEOUT_MIN,
    DEFAULT_WEIGHT_MAX_INCREASE_PERCENT,
    planConfirmation,
    resolveRestaurantItemPricingContext,
    buildRestaurantItemPrice,
    priceChangeLogEntry,
    isWeighedRow,
    parseAddonSnapshot,
    parseVariationSnapshot,
    parseWeighingLog,
} from "../../helpers/weightRequest.helper";
import { notifyUser } from "../../services/socket/socketService";
import { priceWeightRequestRows } from "../../services/weightRequestPricing.service";
import { calculateCalculatedPrice } from "../../helpers/pricing.helper";
import { sendPushNotification } from "../../utils/notifications";

const getStaffRestaurantId = (req: Request | any): string => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");
    return restaurantId;
};

/**
 * Helper to fetch a weight request and verify restaurant & branch authorization.
 */
const fetchAuthorizedWeightRequest = async (requestId: string, req: Request | any, forUpdate = false) => {
    const restaurantId = getStaffRestaurantId(req);
    const branchId = req.user?.branchId;

    const query = db
        .select()
        .from(weightRequests)
        .where(and(eq(weightRequests.id, requestId), eq(weightRequests.restaurantId, restaurantId)))
        .limit(1);

    const [request] = await query;
    if (!request) {
        throw new NotFound("Weight request not found for this restaurant");
    }

    if (branchId && request.branchId && request.branchId !== branchId) {
        throw new BadRequest("You are not authorized to access requests for this branch");
    }

    return request;
};

/**
 * Helper to format all items and calculate live totals for a weight request.
 */
const formatRequestDetails = async (requestId: string) => {
    const [request] = await db
        .select()
        .from(weightRequests)
        .where(eq(weightRequests.id, requestId))
        .limit(1);

    if (!request) return null;

    // While the request is active, show the restaurant the WHOLE cart of this customer for this
    // restaurant (weighted, restaurant-added and normal rows). Once it is finished, only the rows
    // still tagged with it (usually none: the cart is cleared / unlocked).
    // checking_out (Visa payment in progress) still owns the cart, so show the whole cart too.
    const isActive = CART_OWNING_STATUSES.includes(request.status as any);
    const items = await db
        .select({
            cartItemId: cartItems.id,
            foodId: cartItems.foodId,
            foodName: food.name,
            foodNameAr: food.nameAr,
            foodImage: food.image,
            basePrice: food.price,
            sold_by: food.sold_by,
            foodWeightUnit: food.weight_unit,
            quantity: cartItems.quantity,
            orderedWeight: cartItems.weight,
            finalWeight: cartItems.finalWeight,
            weightUnit: cartItems.weightUnit,
            unitPrice: cartItems.unitPrice,
            totalPrice: cartItems.totalPrice,
            variations: cartItems.variations,
            addons: cartItems.addons,
            note: cartItems.note,
            isUnavailable: cartItems.isUnavailable,
            addedBy: cartItems.addedBy,
            addedByAdminId: cartItems.addedByAdminId,
            weightRequestId: cartItems.weightRequestId,
            discountId: food.discountId,
            discountType: food.discount_type,
            discountValue: food.discount_value,
        })
        .from(cartItems)
        .leftJoin(food, eq(cartItems.foodId, food.id))
        .where(
            isActive
                ? and(eq(cartItems.userId, request.userId), eq(cartItems.restaurantId, request.restaurantId))
                : eq(cartItems.weightRequestId, requestId)
        );

    // Same price snapshot + product discount + line formula as the customer's getCart (shared service).
    // Normal (unit) rows are priced from their stored snapshot: an estimate, priced live at checkout.
    const priced = await priceWeightRequestRows(
        items.map((item) => ({
            foodId: item.foodId,
            isWeighted: item.sold_by === "weight" || item.orderedWeight != null,
            orderedWeight: item.orderedWeight,
            finalWeight: item.finalWeight,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            variations: item.variations,
            addons: item.addons,
            isUnavailable: item.isUnavailable,
            discountId: item.discountId,
            discountType: item.discountType,
            discountValue: item.discountValue,
        })),
        request.restaurantId
    );
    const r2 = (n: number) => Math.round(n * 100) / 100;
    let weighedSubtotal = 0;
    let normalItemsSubtotal = 0;

    const formattedItems = items.map((item, index) => {
        const isWeighted = item.sold_by === "weight" || item.orderedWeight != null;
        const line = priced.lines[index];
        const orderedW = item.orderedWeight ? Number(item.orderedWeight) : null;
        const finalW = item.finalWeight ? Number(item.finalWeight) : null;
        const weightChanged = finalW != null && orderedW != null && Math.abs(finalW - orderedW) > 0.0001;

        const parsedVars: any[] = parseVariationSnapshot(item.variations);
        const parsedAddons: any[] = parseAddonSnapshot(item.addons);

        if (!item.isUnavailable) {
            if (isWeighted || item.addedBy === "restaurant") weighedSubtotal += line.finalTotal;
            else normalItemsSubtotal += line.finalTotal;
        }

        return {
            requiresWeighing: isWeighted,
            locked: Boolean(item.weightRequestId),
            cartItemId: item.cartItemId,
            foodId: item.foodId,
            name: item.foodName,
            nameAr: item.foodNameAr,
            image: item.foodImage,
            sold_by: item.sold_by || "unit",
            quantity: item.quantity,
            orderedWeight: item.orderedWeight ? String(item.orderedWeight) : null,
            finalWeight: item.finalWeight ? String(item.finalWeight) : null,
            weightUnit: item.weightUnit || item.foodWeightUnit || null,
            unitPrice: item.unitPrice,
            // per unit (or per weight unit for weighted items), before and after the product discount
            originalUnitPrice: r2(line.originalUnitPrice),
            discountedUnitPrice: r2(line.finalUnitPrice),
            originalTotalPrice: line.originalTotal.toFixed(2),
            discountAmount: line.discountTotal.toFixed(2),
            totalPrice: line.finalTotal.toFixed(2),
            appliedDiscount: line.appliedDiscount,
            isEstimated: !isWeighted && item.addedBy !== "restaurant",
            variations: parsedVars,
            addons: parsedAddons,
            note: item.note,
            isUnavailable: Boolean(item.isUnavailable),
            addedBy: item.addedBy || "customer",
            addedByAdminId: item.addedByAdminId,
            weightChanged,
        };
    });

    const isExpired = new Date(request.expiresAt) <= new Date();

    return {
        request: {
            id: request.id,
            userId: request.userId,
            restaurantId: request.restaurantId,
            branchId: request.branchId,
            status: request.status,
            expiresAt: request.expiresAt,
            weighedAt: request.weighedAt,
            weighedBy: request.weighedBy,
            cancelReason: request.cancelReason,
            orderId: request.orderId,
            weighingLog: parseWeighingLog(request.weighingLog),
            createdAt: request.createdAt,
            isExpired,
        },
        items: formattedItems,
        totals: {
            originalSubtotal: priced.totals.originalSubtotal,
            discountTotal: priced.totals.discountTotal,
            subtotal: priced.totals.subtotal,
            weighedSubtotal: r2(weighedSubtotal),
            normalItemsSubtotal: r2(normalItemsSubtotal),
            isEstimated: true,
            totalItems: formattedItems.length,
            availableItems: formattedItems.filter((i) => !i.isUnavailable).length,
        },
    };
};

/**
 * 🟢 1. GET /admin/weight-requests (Paginated list)
 */
export const getWeightRequests = async (req: Request | any, res: Response) => {
    const restaurantId = getStaffRestaurantId(req);
    const branchId = req.user?.branchId || (req.query.branchId as string);
    const status = req.query.status as string | undefined;
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const offset = (page - 1) * limit;

    const conditions: any[] = [eq(weightRequests.restaurantId, restaurantId)];

    if (status) {
        conditions.push(eq(weightRequests.status, status as any));
    }
    if (branchId) {
        conditions.push(eq(weightRequests.branchId, branchId));
    }

    const [totalRow] = await db
        .select({ count: count() })
        .from(weightRequests)
        .where(and(...conditions));

    const total = totalRow?.count ?? 0;

    const rows = await db
        .select({
            id: weightRequests.id,
            userId: weightRequests.userId,
            userName: users.name,
            userPhone: users.phone,
            branchId: weightRequests.branchId,
            branchName: branches.name,
            branchNameAr: branches.nameAr,
            status: weightRequests.status,
            expiresAt: weightRequests.expiresAt,
            weighedAt: weightRequests.weighedAt,
            orderId: weightRequests.orderId,
            cancelReason: weightRequests.cancelReason,
            createdAt: weightRequests.createdAt,
        })
        .from(weightRequests)
        .leftJoin(users, eq(weightRequests.userId, users.id))
        .leftJoin(branches, eq(weightRequests.branchId, branches.id))
        .where(and(...conditions))
        .orderBy(desc(weightRequests.createdAt))
        .limit(limit)
        .offset(offset);

    const now = new Date();
    const data = rows.map((r) => ({
        ...r,
        isExpired: new Date(r.expiresAt) <= now,
    }));

    return SuccessResponse(res, {
        message: "Weight requests fetched successfully",
        data: {
            items: data,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        },
    });
};

/**
 * 🟢 2. GET /admin/weight-requests/:id
 */
export const getWeightRequestById = async (req: Request | any, res: Response) => {
    const { id } = req.params;
    await fetchAuthorizedWeightRequest(id, req);

    const details = await formatRequestDetails(id);
    if (!details) throw new NotFound("Weight request not found");

    return SuccessResponse(res, {
        message: "Weight request details fetched successfully",
        data: details,
    });
};

/**
 * 🟢 3. PATCH /admin/weight-requests/:id/items/:cartItemId
 * Modifies finalWeight or marks unavailable for an item belonging to the CUSTOMER.
 */
export const patchCustomerItemWeight = async (req: Request | any, res: Response) => {
    const { id, cartItemId } = req.params;
    const { finalWeight, unitPrice, unavailable, reason } = req.body;
    const staffId = req.user?.id;

    const request = await fetchAuthorizedWeightRequest(id, req);

    if (request.status !== "awaiting_weighing") {
        throw new BadRequest(`Item edits are only allowed while request is awaiting weighing. Current status: ${request.status}`);
    }

    const [item] = await db
        .select({
            id: cartItems.id,
            foodId: cartItems.foodId,
            orderedWeight: cartItems.weight,
            finalWeight: cartItems.finalWeight,
            weightUnit: cartItems.weightUnit,
            unitPrice: cartItems.unitPrice,
            variations: cartItems.variations,
            addons: cartItems.addons,
            addedBy: cartItems.addedBy,
            isUnavailable: cartItems.isUnavailable,
            soldBy: food.sold_by,
            foodWeightUnit: food.weight_unit,
        })
        .from(cartItems)
        .leftJoin(food, eq(cartItems.foodId, food.id))
        .where(and(eq(cartItems.id, cartItemId), eq(cartItems.weightRequestId, id)))
        .limit(1);

    if (!item) {
        throw new NotFound("Cart item not found in this weight request (normal items cannot be weighed)");
    }

    if (item.addedBy !== "customer") {
        throw new BadRequest("This endpoint can only modify items added by the customer. Use PUT /items for restaurant-added items.");
    }

    // Only weighted customer rows are weighed; normal (unit) rows are priced at checkout.
    if (!isWeighedRow({ weight: item.orderedWeight }, item.soldBy)) {
        throw new BadRequest("Only weight-based items can be weighed or marked unavailable.");
    }

    const now = new Date();
    const updateData: any = { updatedAt: now };

    if (unavailable !== undefined) {
        updateData.isUnavailable = Boolean(unavailable);
    }

    if (unitPrice !== undefined && req.user?.type !== "owner") {
        throw new BadRequest("Only the restaurant owner can set a custom price.");
    }
    if (unitPrice !== undefined) {
        const numUnitPrice = Number(unitPrice);
        if (numUnitPrice <= 0) {
            throw new BadRequest("Unit price must be greater than 0");
        }
        updateData.unitPrice = numUnitPrice.toFixed(2);
    }

    if (finalWeight !== undefined) {
        const numFinalWeight = validateWeightInput(
            { sold_by: "weight", weight_unit: item.weightUnit || item.foodWeightUnit },
            finalWeight
        )!;

        // Fetch settings for max increase percent
        const [settings] = await db
            .select({
                weightMaxIncreasePercent: restaurantSettings.weightMaxIncreasePercent,
            })
            .from(restaurantSettings)
            .where(eq(restaurantSettings.restaurantId, request.restaurantId))
            .limit(1);

        const maxIncreasePercent = settings?.weightMaxIncreasePercent ?? DEFAULT_WEIGHT_MAX_INCREASE_PERCENT;
        const orderedW = Number(item.orderedWeight || 0);

        if (orderedW > 0) {
            const maxAllowed = calcMaxAllowedWeight(orderedW, maxIncreasePercent);
            if (numFinalWeight > maxAllowed) {
                throw new BadRequest(
                    `Final weight (${numFinalWeight}) exceeds the maximum allowed increase of ${maxIncreasePercent}% (max: ${maxAllowed})`
                );
            }
        }

        updateData.finalWeight = numFinalWeight.toFixed(3);
    }

    // Recompute line total if either finalWeight or unitPrice changed
    if (finalWeight !== undefined || unitPrice !== undefined) {
        const effectiveWeight = finalWeight !== undefined
            ? Number(finalWeight)
            : Number(item.finalWeight || item.orderedWeight || 0);

        const baseP = unitPrice !== undefined
            ? Number(unitPrice)
            : parseFloat(item.unitPrice as string || "0");

        // Customer rows store {variations:[...]}, so parse through the snapshot helper.
        const parsedVars = parseVariationSnapshot(item.variations);
        const parsedAddons = parseAddonSnapshot(item.addons);

        const optExtras = [
            ...parsedVars.map((v: any) => ({
                price: v.price ?? v.additionalPrice ?? 0,
                priceMode: v.priceMode || "fixed",
            })),
            ...parsedAddons.map((a: any) => ({
                price: a.price || 0,
                priceMode: "fixed",
            })),
        ];

        const recomputedTotal = computeWeightedLineTotal(effectiveWeight, baseP, optExtras);
        updateData.totalPrice = recomputedTotal;
    }

    // Write under a lock on the request so a concurrent confirm / reject / cancel cannot interleave.
    await db.transaction(async (tx) => {
        const [locked] = await tx
            .select({ status: weightRequests.status, weighingLog: weightRequests.weighingLog })
            .from(weightRequests)
            .where(eq(weightRequests.id, id))
            .for("update");
        if (!locked || locked.status !== "awaiting_weighing") {
            throw new BadRequest(`Item edits are only allowed while request is awaiting weighing. Current status: ${locked?.status}`);
        }
        await tx.update(cartItems).set(updateData)
            .where(and(eq(cartItems.id, cartItemId), eq(cartItems.weightRequestId, id)));

        // Owner price override: old and new price kept in weighing_log.
        if (updateData.unitPrice !== undefined && Number(updateData.unitPrice) !== Number(item.unitPrice ?? 0)) {
            await tx.update(weightRequests)
                .set({
                    weighingLog: [
                        ...parseWeighingLog(locked.weighingLog),
                        priceChangeLogEntry({ cartItemId, foodId: item.foodId, oldPrice: item.unitPrice, newPrice: updateData.unitPrice, by: staffId, now }),
                    ],
                    updatedAt: now,
                })
                .where(eq(weightRequests.id, id));
        }
    });

    const updatedDetails = await formatRequestDetails(id);
    return SuccessResponse(res, {
        message: "Customer item updated successfully",
        data: updatedDetails,
    });
};

/**
 * 🟢 4. PUT /admin/weight-requests/:id/items
 * Replaces the entire set of items added by the restaurant.
 * - Items without cartItemId are inserted.
 * - Items with cartItemId are updated.
 * - Existing restaurant-added items omitted from the array are DELETED.
 * - Empty array deletes all restaurant-added items.
 * - Customer-added items are NEVER touched.
 */
export const replaceRestaurantItems = async (req: Request | any, res: Response) => {
    const { id } = req.params;
    const { items: incomingItems } = req.body;
    const staffId = req.user?.id;
    const restaurantId = getStaffRestaurantId(req);

    const request = await fetchAuthorizedWeightRequest(id, req);

    if (request.status !== "awaiting_weighing") {
        throw new BadRequest(`Item edits are only allowed while request is awaiting weighing. Current status: ${request.status}`);
    }

    const now = new Date();

    // "The restaurant never sends a price": unitPrice is accepted from the restaurant OWNER only.
    const isOwner = req.user?.type === "owner";
    if (!isOwner && Array.isArray(incomingItems) && incomingItems.some((it: any) => it?.unitPrice !== undefined)) {
        throw new BadRequest("Only the restaurant owner can set a custom price. Remove unitPrice to use the menu price.");
    }

    await db.transaction(async (tx) => {
        const [lockedReq] = await tx
            .select({ status: weightRequests.status, weighingLog: weightRequests.weighingLog })
            .from(weightRequests)
            .where(eq(weightRequests.id, id))
            .for("update");
        if (!lockedReq || lockedReq.status !== "awaiting_weighing") {
            throw new BadRequest(`Item edits are only allowed while request is awaiting weighing. Current status: ${lockedReq?.status}`);
        }

        // Same branch / channel pricing as the customer's cart (see resolveRestaurantItemPricingContext).
        const customerPricingRows = await tx
            .select({ branchId: cartItems.branchId, serviceModule: cartItems.serviceModule })
            .from(cartItems)
            .where(and(eq(cartItems.userId, request.userId), eq(cartItems.restaurantId, restaurantId), eq(cartItems.addedBy, "customer")));
        const activeBranches = request.branchId
            ? []
            : await tx.select({ id: branches.id }).from(branches).where(and(eq(branches.restaurantId, restaurantId), eq(branches.status, "active")));
        const pricingContext = resolveRestaurantItemPricingContext({
            requestBranchId: request.branchId,
            customerRows: customerPricingRows,
            activeBranchIds: activeBranches.map((b: any) => b.id),
        });
        const priceLog: any[] = [];

        // Fetch existing restaurant-added items of this request
        const existingRestItems = await tx
            .select()
            .from(cartItems)
            .where(and(eq(cartItems.weightRequestId, id), eq(cartItems.addedBy, "restaurant")))
            .for("update");

        const existingRestItemMap = new Map(existingRestItems.map((i) => [i.id, i]));
        const retainedIds = new Set<string>();

        // Process each incoming item
        for (let i = 0; i < incomingItems.length; i++) {
            const itemInput = incomingItems[i];

            // If cartItemId is provided, it MUST exist in existing restaurant-added items of this request
            if (itemInput.cartItemId) {
                if (!existingRestItemMap.has(itemInput.cartItemId)) {
                    throw new BadRequest(
                        `Item at index ${i}: Invalid cartItemId (${itemInput.cartItemId}). It does not exist or belongs to the customer.`
                    );
                }
                retainedIds.add(itemInput.cartItemId);
            }

            // Validate food ownership and status
            const [targetFood] = await tx
                .select()
                .from(food)
                .where(and(eq(food.id, itemInput.foodId), eq(food.restaurantid, restaurantId)))
                .limit(1);

            if (!targetFood) {
                throw new BadRequest(`Item at index ${i}: Food not found or does not belong to this restaurant.`);
            }

            if (targetFood.status === "inactive" || targetFood.isOutOfStock) {
                throw new BadRequest(`Item at index ${i}: Food "${targetFood.name}" is inactive or out of stock.`);
            }

            const isWeighted = targetFood.sold_by === "weight";

            // Validate variations and addons from DB
            const rawVars = Array.isArray(itemInput.variations) ? itemInput.variations : [];
            const rawAddons = Array.isArray(itemInput.addons) ? itemInput.addons : [];

            const optionIds = rawVars.map((v: any) => v.optionId || v.id).filter(Boolean);
            const addonIds = rawAddons.map((a: any) => a.addonId || a.id).filter(Boolean);

            const dbOptions = optionIds.length > 0
                ? await tx
                    .select({
                        id: variationOptions.id,
                        optionName: variationOptions.optionName,
                        optionNameAr: variationOptions.optionNameAr,
                        additionalPrice: variationOptions.additionalPrice,
                        priceMode: variationOptions.priceMode,
                        variationId: foodVariations.id,
                        variationName: foodVariations.name,
                        variationNameAr: foodVariations.nameAr,
                        isRequired: foodVariations.isRequired,
                        selectionType: foodVariations.selectionType,
                        isWeightGroup: foodVariations.isWeightGroup,
                        weightValue: variationOptions.weightValue,
                        variationFoodId: foodVariations.foodId,
                    })
                    .from(variationOptions)
                    .leftJoin(foodVariations, eq(variationOptions.variationId, foodVariations.id))
                    .where(inArray(variationOptions.id, optionIds))
                : [];

            const dbAddons = addonIds.length > 0
                ? await tx.select().from(addons).where(inArray(addons.id, addonIds))
                : [];

            if (dbOptions.length !== new Set(optionIds).size || dbOptions.some((o) => o.variationFoodId !== targetFood.id)) {
                throw new BadRequest(`Item at index ${i}: one or more options do not belong to "${targetFood.name}".`);
            }

            // Same weight rules as the customer cart: decimals, minimum, sane maximum, and the
            // weight-group / allow_custom_weight rules for the selected options.
            try {
                const normalised = validateWeightInput(
                    targetFood,
                    itemInput.weight,
                    dbOptions.map((o) => ({ isWeightGroup: o.isWeightGroup, weightValue: o.weightValue }))
                );
                if (isWeighted) itemInput.weight = normalised;
            } catch (err: any) {
                throw new BadRequest(`Item at index ${i}: ${err.message}`);
            }

            // Validate price_mode on options
            for (const opt of dbOptions) {
                validateOptionPriceMode(targetFood.sold_by, opt.priceMode, opt.additionalPrice);
            }

            // Channel-resolved prices for the food and its options (calculateCalculatedPrice, as in the cart).
            const priceResult = await calculateCalculatedPrice(
                targetFood.id,
                dbOptions.map((o) => o.id),
                pricingContext.branchId,
                pricingContext.serviceModule
            );
            if (!priceResult.isAvailable) {
                throw new BadRequest(`Item at index ${i}: "${targetFood.name}" or one of its options is not available on this branch / channel.`);
            }
            const resolvedOptionPrice = new Map(priceResult.variants.map((v) => [v.variantOptionId, v.price]));

            // Build detailed variations snapshot (channel-resolved option prices)
            const detailedVars = dbOptions.map((opt) => {
                const optionPrice = Number(resolvedOptionPrice.get(opt.id) ?? opt.additionalPrice ?? 0).toFixed(2);
                return {
                    variationId: opt.variationId,
                    variationName: opt.variationName,
                    variationNameAr: opt.variationNameAr,
                    optionId: opt.id,
                    optionName: opt.optionName,
                    optionNameAr: opt.optionNameAr,
                    price: optionPrice,
                    additionalPrice: optionPrice,
                    priceMode: opt.priceMode || "fixed",
                };
            });

            // Build detailed addons snapshot
            const detailedAddons = dbAddons.map((a) => ({
                addonId: a.id,
                name: a.name,
                nameAr: a.nameAr,
                price: (a.price as string) || "0.00",
            }));

            const quantity = itemInput.quantity || 1;
            const ownerUnitPrice = isOwner && itemInput.unitPrice !== undefined ? Number(itemInput.unitPrice) : undefined;
            const built = buildRestaurantItemPrice({
                isWeighted,
                weight: isWeighted ? Number(itemInput.weight) : null,
                quantity,
                resolvedBasePrice: priceResult.basePrice,
                options: detailedVars.map((v) => ({ price: Number(v.price), priceMode: v.priceMode })),
                addonPrices: detailedAddons.map((a) => Number(a.price || 0)),
                ownerUnitPrice,
            }, (w, base, extras) => computeWeightedLineTotal(w, base, extras));
            const unitPriceStr = built.unitPrice;
            const totalPriceStr = built.totalPrice;
            if (ownerUnitPrice !== undefined && Math.abs(ownerUnitPrice - priceResult.basePrice) > 0.001) {
                priceLog.push(priceChangeLogEntry({
                    cartItemId: itemInput.cartItemId ?? null, foodId: targetFood.id, foodName: targetFood.name,
                    oldPrice: priceResult.basePrice, newPrice: ownerUnitPrice, by: staffId, now,
                }));
            }

            if (itemInput.cartItemId) {
                // Update existing restaurant row
                await tx
                    .update(cartItems)
                    .set({
                        foodId: itemInput.foodId,
                        quantity,
                        weight: isWeighted ? Number(itemInput.weight).toFixed(3) : null,
                        finalWeight: isWeighted ? Number(itemInput.weight).toFixed(3) : null,
                        weightUnit: isWeighted ? targetFood.weight_unit : null,
                        unitPrice: unitPriceStr,
                        totalPrice: totalPriceStr,
                        variations: JSON.stringify(detailedVars),
                        addons: JSON.stringify(detailedAddons),
                        note: itemInput.note || null,
                        updatedAt: now,
                    })
                    .where(eq(cartItems.id, itemInput.cartItemId));
            } else {
                // Insert new restaurant row
                const newCartItemId = uuidv4();
                await tx.insert(cartItems).values({
                    id: newCartItemId,
                    userId: request.userId,
                    restaurantId,
                    foodId: itemInput.foodId,
                    quantity,
                    weight: isWeighted ? Number(itemInput.weight).toFixed(3) : null,
                    finalWeight: isWeighted ? Number(itemInput.weight).toFixed(3) : null,
                    weightUnit: isWeighted ? targetFood.weight_unit : null,
                    unitPrice: unitPriceStr,
                    totalPrice: totalPriceStr,
                    variations: JSON.stringify(detailedVars),
                    addons: JSON.stringify(detailedAddons),
                    note: itemInput.note || null,
                    branchId: pricingContext.branchId || null,
                    serviceModule: pricingContext.serviceModule ?? null,
                    weightRequestId: id,
                    addedBy: "restaurant",
                    addedByAdminId: staffId,
                    isUnavailable: false,
                    createdAt: now,
                    updatedAt: now,
                });
                retainedIds.add(newCartItemId);
            }
        }

        // Delete omitted restaurant-added items
        for (const existingItem of existingRestItems) {
            if (!retainedIds.has(existingItem.id)) {
                await tx.delete(cartItems).where(eq(cartItems.id, existingItem.id));
            }
        }

        // Owner price overrides: old (menu) and new price kept in weighing_log.
        if (priceLog.length > 0) {
            await tx.update(weightRequests)
                .set({ weighingLog: [...parseWeighingLog(lockedReq.weighingLog), ...priceLog], updatedAt: now })
                .where(eq(weightRequests.id, id));
        }
    });

    const updatedDetails = await formatRequestDetails(id);
    return SuccessResponse(res, {
        message: "Restaurant items replaced successfully",
        data: updatedDetails,
    });
};

/**
 * 🟢 5. POST /admin/weight-requests/:id/confirm
 * Sends the request to the customer. ONE time only.
 * By default, weighted customer rows that were not weighed (no final_weight, not unavailable) are
 * confirmed AT THE ORDERED WEIGHT. Optional body { strict: true } restores the old rule (reject them).
 * Validates every weighted row, writes weighing_log, sets the customer timeout, notifies the customer.
 */
export const confirmWeightRequest = async (req: Request | any, res: Response) => {
    const { id } = req.params;
    const staffId = req.user?.id;
    const restaurantId = getStaffRestaurantId(req);
    const strict = parseBooleanInput(req.body?.strict) === true;

    // Same restaurant + branch check as the other routes: staff of another branch cannot confirm.
    await fetchAuthorizedWeightRequest(id, req);

    const now = new Date();

    const result = await db.transaction(async (tx) => {
        const [request] = await tx
            .select()
            .from(weightRequests)
            .where(and(eq(weightRequests.id, id), eq(weightRequests.restaurantId, restaurantId)))
            .for("update");

        if (!request) throw new NotFound("Weight request not found");

        if (request.status !== "awaiting_weighing") {
            throw new BadRequest(`Only requests in 'awaiting_weighing' status can be confirmed. Current status: ${request.status}`);
        }

        const items = await tx
            .select({
                id: cartItems.id,
                foodId: cartItems.foodId,
                foodName: food.name,
                orderedWeight: cartItems.weight,
                finalWeight: cartItems.finalWeight,
                weightUnit: cartItems.weightUnit,
                foodWeightUnit: food.weight_unit,
                isUnavailable: cartItems.isUnavailable,
                addedBy: cartItems.addedBy,
                sold_by: food.sold_by,
                unitPrice: cartItems.unitPrice,
                variations: cartItems.variations,
                addons: cartItems.addons,
            })
            .from(cartItems)
            .leftJoin(food, eq(cartItems.foodId, food.id))
            .where(eq(cartItems.weightRequestId, id))
            .for("update");

        const [settings] = await tx
            .select({
                weightCustomerTimeoutMin: restaurantSettings.weightCustomerTimeoutMin,
                weightMaxIncreasePercent: restaurantSettings.weightMaxIncreasePercent,
            })
            .from(restaurantSettings)
            .where(eq(restaurantSettings.restaurantId, restaurantId))
            .limit(1);

        const plan = planConfirmation(
            items,
            { strict, maxIncreasePercent: settings?.weightMaxIncreasePercent ?? DEFAULT_WEIGHT_MAX_INCREASE_PERCENT },
            (w, price, extras) => computeWeightedLineTotal(w, price, extras),
            { isWeightWithinLimit, isSaneWeight }
        );

        if (plan.kind === "reject") throw new BadRequest(plan.message);

        // Every weighted customer row unavailable and nothing added by the restaurant:
        // nothing left to weigh → cancel with the normal cleanup and tell the customer.
        if (plan.kind === "cancel") {
            await tx
                .update(weightRequests)
                .set({
                    status: "cancelled",
                    cancelReason: "All weighed items are unavailable.",
                    updatedAt: now,
                })
                .where(eq(weightRequests.id, id));

            await tx
                .update(cartItems)
                .set({ weightRequestId: null, finalWeight: null, isUnavailable: false, updatedAt: now })
                .where(and(eq(cartItems.weightRequestId, id), eq(cartItems.addedBy, "customer")));

            return {
                status: "cancelled" as const,
                userId: request.userId,
                restaurantId: request.restaurantId,
                branchId: request.branchId || null,
                expiresAt: null
            };
        }

        // Rows confirmed at the ordered weight (the line total is unchanged; stored again for consistency).
        for (const d of plan.defaults) {
            await tx
                .update(cartItems)
                .set({ finalWeight: d.finalWeight, totalPrice: d.totalPrice, updatedAt: now })
                .where(and(eq(cartItems.id, d.id), eq(cartItems.weightRequestId, id)));
        }

        const earlierPriceChanges = parseWeighingLog(request.weighingLog).filter((e: any) => e?.action === "price_changed");
        const weighingLog: any[] = [...earlierPriceChanges, ...plan.log.map(({ item, action, finalWeight }) => ({
            cartItemId: item.id,
            foodId: item.foodId,
            foodName: item.foodName,
            addedBy: item.addedBy,
            orderedWeight: item.orderedWeight,
            finalWeight,
            weightUnit: item.weightUnit,
            isUnavailable: Boolean(item.isUnavailable),
            action,
            weighedBy: staffId,
            timestamp: now.toISOString(),
        }))];

        const customerTimeoutMin = settings?.weightCustomerTimeoutMin ?? DEFAULT_WEIGHT_CUSTOMER_TIMEOUT_MIN;
        const expiresAt = new Date(now.getTime() + customerTimeoutMin * 60 * 1000);

        await tx
            .update(weightRequests)
            .set({
                status: "awaiting_customer_approval",
                weighedBy: staffId,
                weighedAt: now,
                expiresAt,
                weighingLog: weighingLog,
                updatedAt: now,
            })
            .where(and(eq(weightRequests.id, id), eq(weightRequests.status, "awaiting_weighing")));

        return {
            status: "awaiting_customer_approval" as const,
            userId: request.userId,
            restaurantId: request.restaurantId,
            branchId: request.branchId || null,
            expiresAt
        };
    });

    // Notify the customer AFTER the transaction committed (never inside it); a notification
    // failure must not fail the request.
    try {
        if (result.status === "cancelled") {
            notifyUser(result.userId, "weight_request_rejected", {
                weightRequestId: id,
                restaurantId: result.restaurantId,
                branchId: result.branchId,
                reason: "All weighed items are unavailable.",
            });
            await sendPushNotification({
                recipientType: "user",
                recipientId: result.userId,
                restaurantId: result.restaurantId,
                branchId: result.branchId,
                title: "تم إلغاء طلب الوزن ❌",
                body: "الأصناف المطلوب وزنها غير متوفرة حالياً لدى المطعم.",
                data: {
                    type: "weight_request_rejected",
                    weightRequestId: id,
                    restaurantId: result.restaurantId,
                    branchId: result.branchId,
                },
            });
        } else {
            notifyUser(result.userId, "weight_request_confirmed", {
                weightRequestId: id,
                restaurantId: result.restaurantId,
                branchId: result.branchId,
                expiresAt: result.expiresAt,
            });
            await sendPushNotification({
                recipientType: "user",
                recipientId: result.userId,
                restaurantId: result.restaurantId,
                branchId: result.branchId,
                title: "تم وزن طلبك! ⚖️",
                body: "قام المطعم بوزن طلبك، يرجى مراجعة الأوزان وتأكيد الطلب.",
                data: {
                    type: "weight_request_confirmed",
                    weightRequestId: id,
                    restaurantId: result.restaurantId,
                    branchId: result.branchId,
                },
            });
        }
    } catch (notifyErr) {
        console.warn("[confirmWeightRequest] Notification warning:", notifyErr);
    }

    const updatedDetails = await formatRequestDetails(id);
    return SuccessResponse(res, {
        message: result.status === "cancelled"
            ? "All weighed items are unavailable: the request was cancelled and the customer notified"
            : "Weight request confirmed and sent to customer",
        data: updatedDetails,
    });
};

/**
 * 🟢 6. POST /admin/weight-requests/:id/reject
 * Cancels the whole request, unlocks customer items, deletes restaurant items, notifies customer.
 */
export const rejectWeightRequest = async (req: Request | any, res: Response) => {
    const { id } = req.params;
    const { reason } = req.body;
    const restaurantId = getStaffRestaurantId(req);

    const now = new Date();

    const request = await fetchAuthorizedWeightRequest(id, req);

    if (!["awaiting_weighing", "awaiting_customer_approval"].includes(request.status)) {
        throw new BadRequest(`Cannot reject a request with status: ${request.status}`);
    }

    await db.transaction(async (tx) => {
        // Re-check the status under lock (a checkout / cancel / cron may have won the race).
        const [locked] = await tx
            .select({ status: weightRequests.status })
            .from(weightRequests)
            .where(eq(weightRequests.id, id))
            .for("update");
        if (!locked || !ACTIVE_WEIGHT_REQUEST_STATUSES.includes(locked.status as any)) {
            throw new BadRequest(`Cannot reject a request with status: ${locked?.status}`);
        }

        await tx
            .update(weightRequests)
            .set({
                status: "cancelled",
                cancelReason: reason || "Rejected by restaurant",
                updatedAt: now,
            })
            .where(eq(weightRequests.id, id));

        // Delete restaurant-added items
        await tx
            .delete(cartItems)
            .where(and(eq(cartItems.weightRequestId, id), eq(cartItems.addedBy, "restaurant")));

        // Unlock and reset customer-added items
        await tx
            .update(cartItems)
            .set({
                weightRequestId: null,
                finalWeight: null,
                isUnavailable: false,
                updatedAt: now,
            })
            .where(and(eq(cartItems.weightRequestId, id), eq(cartItems.addedBy, "customer")));
    });

    // Notify customer
    try {
        notifyUser(request.userId, "weight_request_rejected", {
            weightRequestId: id,
            restaurantId: request.restaurantId,
            branchId: request.branchId || null,
            reason: reason || "Rejected by restaurant",
        });

        await sendPushNotification({
            recipientType: "user",
            recipientId: request.userId,
            restaurantId: request.restaurantId,
            branchId: request.branchId || null,
            title: "تم إلغاء طلب الوزن ❌",
            body: reason || "قام المطعم بإلغاء طلب الوزن الخاص بك.",
            data: {
                type: "weight_request_rejected",
                weightRequestId: id,
                restaurantId: request.restaurantId,
                branchId: request.branchId || null,
            },
        });
    } catch (notifyErr) {
        console.warn("[rejectWeightRequest] Notification warning:", notifyErr);
    }

    return SuccessResponse(res, {
        message: "Weight request rejected successfully",
        data: { id, status: "cancelled" },
    });
};
