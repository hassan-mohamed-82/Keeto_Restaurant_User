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
    isSaneWeight,
    validateOptionPriceMode,
} from "../../helpers/weightPricing.helper";
import { notifyUser } from "../../services/socket/socketService";
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
        })
        .from(cartItems)
        .leftJoin(food, eq(cartItems.foodId, food.id))
        .where(eq(cartItems.weightRequestId, requestId));

    let subtotal = 0;
    const formattedItems = items.map((item) => {
        const isWeighted = item.sold_by === "weight" || item.orderedWeight != null;
        const orderedW = item.orderedWeight ? Number(item.orderedWeight) : null;
        const finalW = item.finalWeight ? Number(item.finalWeight) : null;
        const weightChanged = finalW != null && orderedW != null && Math.abs(finalW - orderedW) > 0.0001;

        let parsedVars: any[] = [];
        try {
            parsedVars = typeof item.variations === "string" ? JSON.parse(item.variations) : item.variations || [];
        } catch {
            parsedVars = [];
        }

        let parsedAddons: any[] = [];
        try {
            parsedAddons = typeof item.addons === "string" ? JSON.parse(item.addons) : item.addons || [];
        } catch {
            parsedAddons = [];
        }

        let lineTotal = parseFloat(item.totalPrice as string || "0");
        if (isWeighted) {
            const effectiveWeight = finalW ?? orderedW ?? 0;
            const optExtras = [
                ...parsedVars.map((v: any) => ({
                    price: v.additionalPrice || v.price || 0,
                    priceMode: v.priceMode || "fixed",
                })),
                ...parsedAddons.map((a: any) => ({
                    price: a.price || 0,
                    priceMode: "fixed",
                })),
            ];
            const baseP = parseFloat(item.basePrice as string || "0");
            lineTotal = parseFloat(computeWeightedLineTotal(effectiveWeight, baseP, optExtras));
        }

        if (!item.isUnavailable) {
            subtotal += lineTotal;
        }

        return {
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
            totalPrice: lineTotal.toFixed(2),
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
            weighingLog: request.weighingLog || [],
            createdAt: request.createdAt,
            isExpired,
        },
        items: formattedItems,
        totals: {
            subtotal: parseFloat(subtotal.toFixed(2)),
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
        })
        .from(cartItems)
        .where(and(eq(cartItems.id, cartItemId), eq(cartItems.weightRequestId, id)))
        .limit(1);

    if (!item) {
        throw new NotFound("Cart item not found in this weight request");
    }

    if (item.addedBy !== "customer") {
        throw new BadRequest("This endpoint can only modify items added by the customer. Use PUT /items for restaurant-added items.");
    }

    const now = new Date();
    const updateData: any = { updatedAt: now };

    if (unavailable !== undefined) {
        updateData.isUnavailable = Boolean(unavailable);
    }

    if (unitPrice !== undefined) {
        const numUnitPrice = Number(unitPrice);
        if (numUnitPrice <= 0) {
            throw new BadRequest("Unit price must be greater than 0");
        }
        updateData.unitPrice = numUnitPrice.toFixed(2);
    }

    if (finalWeight !== undefined) {
        const numFinalWeight = Number(finalWeight);
        if (numFinalWeight <= 0) {
            throw new BadRequest("Final weight must be greater than 0");
        }

        // Fetch settings for max increase percent
        const [settings] = await db
            .select({
                weightMaxIncreasePercent: restaurantSettings.weightMaxIncreasePercent,
            })
            .from(restaurantSettings)
            .where(eq(restaurantSettings.restaurantId, request.restaurantId))
            .limit(1);

        const maxIncreasePercent = settings?.weightMaxIncreasePercent ?? 20;
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

        let parsedVars: any[] = [];
        try {
            parsedVars = typeof item.variations === "string" ? JSON.parse(item.variations) : item.variations || [];
        } catch {
            parsedVars = [];
        }

        let parsedAddons: any[] = [];
        try {
            parsedAddons = typeof item.addons === "string" ? JSON.parse(item.addons) : item.addons || [];
        } catch {
            parsedAddons = [];
        }

        const optExtras = [
            ...parsedVars.map((v: any) => ({
                price: v.additionalPrice || v.price || 0,
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

    await db.update(cartItems).set(updateData).where(eq(cartItems.id, cartItemId));

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

    await db.transaction(async (tx) => {
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

            if (isWeighted) {
                if (!itemInput.weight || itemInput.weight <= 0) {
                    throw new BadRequest(`Item at index ${i}: Weight is required and must be > 0 for weight-based food.`);
                }
                if (!isSaneWeight(itemInput.weight, targetFood.weight_unit)) {
                    throw new BadRequest(`Item at index ${i}: Weight exceeds the sane maximum limit for ${targetFood.weight_unit}.`);
                }
            }

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
                    })
                    .from(variationOptions)
                    .leftJoin(foodVariations, eq(variationOptions.variationId, foodVariations.id))
                    .where(inArray(variationOptions.id, optionIds))
                : [];

            const dbAddons = addonIds.length > 0
                ? await tx.select().from(addons).where(inArray(addons.id, addonIds))
                : [];

            // Validate price_mode on options
            for (const opt of dbOptions) {
                validateOptionPriceMode(targetFood.sold_by, opt.priceMode, opt.additionalPrice);
            }

            // Build detailed variations snapshot
            const detailedVars = dbOptions.map((opt) => ({
                variationId: opt.variationId,
                variationName: opt.variationName,
                variationNameAr: opt.variationNameAr,
                optionId: opt.id,
                optionName: opt.optionName,
                optionNameAr: opt.optionNameAr,
                price: opt.additionalPrice || "0.00",
                additionalPrice: opt.additionalPrice || "0.00",
                priceMode: opt.priceMode || "fixed",
            }));

            // Build detailed addons snapshot
            const detailedAddons = dbAddons.map((a) => ({
                addonId: a.id,
                name: a.name,
                nameAr: a.nameAr,
                price: (a.price as string) || "0.00",
            }));

            const basePriceNum = itemInput.unitPrice !== undefined
                ? Number(itemInput.unitPrice)
                : parseFloat(targetFood.price as string || "0");
            const quantity = itemInput.quantity || 1;

            let unitPriceStr: string;
            let totalPriceStr: string;

            if (isWeighted) {
                const optExtras = [
                    ...detailedVars.map((v) => ({
                        price: v.additionalPrice || "0",
                        priceMode: v.priceMode || "fixed",
                    })),
                    ...detailedAddons.map((a) => ({
                        price: a.price || "0",
                        priceMode: "fixed" as const,
                    })),
                ];
                unitPriceStr = basePriceNum.toFixed(2);
                totalPriceStr = computeWeightedLineTotal(itemInput.weight, basePriceNum, optExtras);
            } else {
                const varSum = detailedVars.reduce((s, v) => s + parseFloat(v.additionalPrice || "0"), 0);
                const addonSum = detailedAddons.reduce((s, a) => s + parseFloat(a.price || "0"), 0);
                const singleUnit = basePriceNum + varSum + addonSum;
                unitPriceStr = singleUnit.toFixed(2);
                totalPriceStr = (singleUnit * quantity).toFixed(2);
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
 * Validates all customer items are weighed or unavailable.
 * Writes weighing_log JSON, updates status to awaiting_customer_approval, sets customer timeout, notifies customer.
 */
export const confirmWeightRequest = async (req: Request | any, res: Response) => {
    const { id } = req.params;
    const staffId = req.user?.id;
    const restaurantId = getStaffRestaurantId(req);

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
                isUnavailable: cartItems.isUnavailable,
                addedBy: cartItems.addedBy,
                sold_by: food.sold_by,
            })
            .from(cartItems)
            .leftJoin(food, eq(cartItems.foodId, food.id))
            .where(eq(cartItems.weightRequestId, id));

        // Validation: All customer weighted items must have final_weight or be marked unavailable
        for (const item of items) {
            if (item.addedBy === "customer" && item.sold_by === "weight" && !item.isUnavailable) {
                if (!item.finalWeight || Number(item.finalWeight) <= 0) {
                    throw new BadRequest(
                        `Item "${item.foodName}" has not been weighed yet. Please set its final weight or mark it as unavailable.`
                    );
                }
            }
        }

        // Check if EVERY item is unavailable
        const allUnavailable = items.length > 0 && items.every((i) => i.isUnavailable);
        if (allUnavailable) {
            await tx
                .update(weightRequests)
                .set({
                    status: "cancelled",
                    cancelReason: "All items in the request are unavailable.",
                    updatedAt: now,
                })
                .where(eq(weightRequests.id, id));

            return { status: "cancelled", message: "All items unavailable, request cancelled." };
        }

        // Build weighing_log
        const weighingLog: any[] = items.map((item) => ({
            cartItemId: item.id,
            foodId: item.foodId,
            foodName: item.foodName,
            addedBy: item.addedBy,
            orderedWeight: item.orderedWeight,
            finalWeight: item.finalWeight,
            weightUnit: item.weightUnit,
            isUnavailable: Boolean(item.isUnavailable),
            action: item.isUnavailable
                ? "marked_unavailable"
                : item.addedBy === "restaurant"
                    ? "added_by_restaurant"
                    : "weighed",
            weighedBy: staffId,
            timestamp: now.toISOString(),
        }));

        // Customer timeout from restaurant settings
        const [settings] = await tx
            .select({
                weightCustomerTimeoutMin: restaurantSettings.weightCustomerTimeoutMin,
            })
            .from(restaurantSettings)
            .where(eq(restaurantSettings.restaurantId, restaurantId))
            .limit(1);

        const customerTimeoutMin = settings?.weightCustomerTimeoutMin ?? 30;
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
            .where(eq(weightRequests.id, id));

        // Notify customer via Socket and FCM
        try {
            notifyUser(request.userId, "weight_request_confirmed", {
                weightRequestId: id,
                expiresAt,
            });

            await sendPushNotification({
                recipientType: "user",
                recipientId: request.userId,
                title: "تم وزن طلبك! ⚖️",
                body: "قام المطعم بوزن طلبك، يرجى مراجعة الأوزان وتأكيد الطلب.",
                data: {
                    type: "weight_request_confirmed",
                    weightRequestId: id,
                },
            });
        } catch (notifyErr) {
            console.warn("[confirmWeightRequest] Notification warning:", notifyErr);
        }

        return { status: "awaiting_customer_approval", expiresAt };
    });

    const updatedDetails = await formatRequestDetails(id);
    return SuccessResponse(res, {
        message: "Weight request confirmed and sent to customer",
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
            reason: reason || "Rejected by restaurant",
        });

        await sendPushNotification({
            recipientType: "user",
            recipientId: request.userId,
            title: "تم إلغاء طلب الوزن ❌",
            body: reason || "قام المطعم بإلغاء طلب الوزن الخاص بك.",
            data: {
                type: "weight_request_rejected",
                weightRequestId: id,
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
