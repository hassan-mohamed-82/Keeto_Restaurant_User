"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectWeightRequest = exports.confirmWeightRequest = exports.replaceRestaurantItems = exports.patchCustomerItemWeight = exports.getWeightRequestById = exports.getWeightRequests = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const BadRequest_1 = require("../../Errors/BadRequest");
const NotFound_1 = require("../../Errors/NotFound");
const response_1 = require("../../utils/response");
const uuid_1 = require("uuid");
const weightPricing_helper_1 = require("../../helpers/weightPricing.helper");
const weightRequest_helper_1 = require("../../helpers/weightRequest.helper");
const socketService_1 = require("../../services/socket/socketService");
const weightRequestPricing_service_1 = require("../../services/weightRequestPricing.service");
const pricing_helper_1 = require("../../helpers/pricing.helper");
const notifications_1 = require("../../utils/notifications");
const getStaffRestaurantId = (req) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    return restaurantId;
};
/**
 * Helper to fetch a weight request and verify restaurant & branch authorization.
 */
const fetchAuthorizedWeightRequest = async (requestId, req, forUpdate = false) => {
    const restaurantId = getStaffRestaurantId(req);
    const branchId = req.user?.branchId;
    const query = connection_1.db
        .select()
        .from(schema_1.weightRequests)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.weightRequests.id, requestId), (0, drizzle_orm_1.eq)(schema_1.weightRequests.restaurantId, restaurantId)))
        .limit(1);
    const [request] = await query;
    if (!request) {
        throw new NotFound_1.NotFound("Weight request not found for this restaurant");
    }
    if (branchId && request.branchId && request.branchId !== branchId) {
        throw new BadRequest_1.BadRequest("You are not authorized to access requests for this branch");
    }
    return request;
};
/**
 * Helper to format all items and calculate live totals for a weight request.
 */
const formatRequestDetails = async (requestId) => {
    const [request] = await connection_1.db
        .select()
        .from(schema_1.weightRequests)
        .where((0, drizzle_orm_1.eq)(schema_1.weightRequests.id, requestId))
        .limit(1);
    if (!request)
        return null;
    // While the request is active, show the restaurant the WHOLE cart of this customer for this
    // restaurant (weighted, restaurant-added and normal rows). Once it is finished, only the rows
    // still tagged with it (usually none: the cart is cleared / unlocked).
    // checking_out (Visa payment in progress) still owns the cart, so show the whole cart too.
    const isActive = weightRequest_helper_1.CART_OWNING_STATUSES.includes(request.status);
    const items = await connection_1.db
        .select({
        cartItemId: schema_1.cartItems.id,
        foodId: schema_1.cartItems.foodId,
        foodName: schema_1.food.name,
        foodNameAr: schema_1.food.nameAr,
        foodImage: schema_1.food.image,
        basePrice: schema_1.food.price,
        sold_by: schema_1.food.sold_by,
        foodWeightUnit: schema_1.food.weight_unit,
        allow_custom_weight: schema_1.food.allow_custom_weight,
        quantity: schema_1.cartItems.quantity,
        orderedWeight: schema_1.cartItems.weight,
        finalWeight: schema_1.cartItems.finalWeight,
        weightUnit: schema_1.cartItems.weightUnit,
        unitPrice: schema_1.cartItems.unitPrice,
        totalPrice: schema_1.cartItems.totalPrice,
        variations: schema_1.cartItems.variations,
        addons: schema_1.cartItems.addons,
        note: schema_1.cartItems.note,
        isUnavailable: schema_1.cartItems.isUnavailable,
        addedBy: schema_1.cartItems.addedBy,
        addedByAdminId: schema_1.cartItems.addedByAdminId,
        weightRequestId: schema_1.cartItems.weightRequestId,
        discountId: schema_1.food.discountId,
        discountType: schema_1.food.discount_type,
        discountValue: schema_1.food.discount_value,
    })
        .from(schema_1.cartItems)
        .leftJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.cartItems.foodId, schema_1.food.id))
        .where(isActive
        ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cartItems.userId, request.userId), (0, drizzle_orm_1.eq)(schema_1.cartItems.restaurantId, request.restaurantId))
        : (0, drizzle_orm_1.eq)(schema_1.cartItems.weightRequestId, requestId));
    // Same price snapshot + product discount + line formula as the customer's getCart (shared service).
    // Normal (unit) rows are priced from their stored snapshot: an estimate, priced live at checkout.
    const priced = await (0, weightRequestPricing_service_1.priceWeightRequestRows)(items.map((item) => ({
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
    })), request.restaurantId);
    const r2 = (n) => Math.round(n * 100) / 100;
    let weighedSubtotal = 0;
    let normalItemsSubtotal = 0;
    const formattedItems = items.map((item, index) => {
        const isWeighted = item.sold_by === "weight" || item.orderedWeight != null;
        const line = priced.lines[index];
        const orderedW = item.orderedWeight ? Number(item.orderedWeight) : null;
        const finalW = item.finalWeight ? Number(item.finalWeight) : null;
        const weightChanged = finalW != null && orderedW != null && Math.abs(finalW - orderedW) > 0.0001;
        const parsedVars = (0, weightRequest_helper_1.parseVariationSnapshot)(item.variations);
        const parsedAddons = (0, weightRequest_helper_1.parseAddonSnapshot)(item.addons);
        if (!item.isUnavailable) {
            if (isWeighted || item.addedBy === "restaurant")
                weighedSubtotal += line.finalTotal;
            else
                normalItemsSubtotal += line.finalTotal;
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
            allowCustomWeight: Boolean(item.allow_custom_weight ?? true),
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
            weighingLog: (0, weightRequest_helper_1.parseWeighingLog)(request.weighingLog),
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
const getWeightRequests = async (req, res) => {
    const restaurantId = getStaffRestaurantId(req);
    const branchId = req.user?.branchId || req.query.branchId;
    const status = req.query.status;
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const offset = (page - 1) * limit;
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.weightRequests.restaurantId, restaurantId)];
    if (status) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.weightRequests.status, status));
    }
    if (branchId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.weightRequests.branchId, branchId));
    }
    const [totalRow] = await connection_1.db
        .select({ count: (0, drizzle_orm_1.count)() })
        .from(schema_1.weightRequests)
        .where((0, drizzle_orm_1.and)(...conditions));
    const total = totalRow?.count ?? 0;
    const rows = await connection_1.db
        .select({
        id: schema_1.weightRequests.id,
        userId: schema_1.weightRequests.userId,
        userName: schema_1.users.name,
        userPhone: schema_1.users.phone,
        branchId: schema_1.weightRequests.branchId,
        branchName: schema_1.branches.name,
        branchNameAr: schema_1.branches.nameAr,
        status: schema_1.weightRequests.status,
        expiresAt: schema_1.weightRequests.expiresAt,
        weighedAt: schema_1.weightRequests.weighedAt,
        orderId: schema_1.weightRequests.orderId,
        cancelReason: schema_1.weightRequests.cancelReason,
        createdAt: schema_1.weightRequests.createdAt,
    })
        .from(schema_1.weightRequests)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.weightRequests.userId, schema_1.users.id))
        .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.weightRequests.branchId, schema_1.branches.id))
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.weightRequests.createdAt))
        .limit(limit)
        .offset(offset);
    const now = new Date();
    const data = rows.map((r) => ({
        ...r,
        isExpired: new Date(r.expiresAt) <= now,
    }));
    return (0, response_1.SuccessResponse)(res, {
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
exports.getWeightRequests = getWeightRequests;
/**
 * 🟢 2. GET /admin/weight-requests/:id
 */
const getWeightRequestById = async (req, res) => {
    const { id } = req.params;
    await fetchAuthorizedWeightRequest(id, req);
    const details = await formatRequestDetails(id);
    if (!details)
        throw new NotFound_1.NotFound("Weight request not found");
    return (0, response_1.SuccessResponse)(res, {
        message: "Weight request details fetched successfully",
        data: details,
    });
};
exports.getWeightRequestById = getWeightRequestById;
/**
 * 🟢 3. PATCH /admin/weight-requests/:id/items/:cartItemId
 * Modifies finalWeight or marks unavailable for an item belonging to the CUSTOMER.
 */
const patchCustomerItemWeight = async (req, res) => {
    const { id, cartItemId } = req.params;
    const { finalWeight, unitPrice, unavailable, reason } = req.body;
    const staffId = req.user?.id;
    const request = await fetchAuthorizedWeightRequest(id, req);
    if (request.status !== "awaiting_weighing") {
        throw new BadRequest_1.BadRequest(`Item edits are only allowed while request is awaiting weighing. Current status: ${request.status}`);
    }
    const [item] = await connection_1.db
        .select({
        id: schema_1.cartItems.id,
        foodId: schema_1.cartItems.foodId,
        quantity: schema_1.cartItems.quantity,
        orderedWeight: schema_1.cartItems.weight,
        finalWeight: schema_1.cartItems.finalWeight,
        weightUnit: schema_1.cartItems.weightUnit,
        unitPrice: schema_1.cartItems.unitPrice,
        variations: schema_1.cartItems.variations,
        addons: schema_1.cartItems.addons,
        addedBy: schema_1.cartItems.addedBy,
        isUnavailable: schema_1.cartItems.isUnavailable,
        soldBy: schema_1.food.sold_by,
        foodWeightUnit: schema_1.food.weight_unit,
    })
        .from(schema_1.cartItems)
        .leftJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.cartItems.foodId, schema_1.food.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cartItems.id, cartItemId), (0, drizzle_orm_1.eq)(schema_1.cartItems.weightRequestId, id)))
        .limit(1);
    if (!item) {
        throw new NotFound_1.NotFound("Cart item not found in this weight request (normal items cannot be weighed)");
    }
    if (item.addedBy !== "customer") {
        throw new BadRequest_1.BadRequest("This endpoint can only modify items added by the customer. Use PUT /items for restaurant-added items.");
    }
    // Only weighted customer rows are weighed; normal (unit) rows are priced at checkout.
    if (!(0, weightRequest_helper_1.isWeighedRow)({ weight: item.orderedWeight }, item.soldBy)) {
        throw new BadRequest_1.BadRequest("Only weight-based items can be weighed or marked unavailable.");
    }
    const now = new Date();
    const updateData = { updatedAt: now };
    if (unavailable !== undefined) {
        updateData.isUnavailable = Boolean(unavailable);
    }
    if (unitPrice !== undefined && req.user?.type !== "owner") {
        throw new BadRequest_1.BadRequest("Only the restaurant owner can set a custom price.");
    }
    if (unitPrice !== undefined) {
        const numUnitPrice = Number(unitPrice);
        if (numUnitPrice <= 0) {
            throw new BadRequest_1.BadRequest("Unit price must be greater than 0");
        }
        updateData.unitPrice = numUnitPrice.toFixed(2);
    }
    if (finalWeight !== undefined) {
        const numFinalWeight = (0, weightPricing_helper_1.validateWeightInput)({ sold_by: "weight", weight_unit: item.weightUnit || item.foodWeightUnit }, finalWeight);
        // Fetch settings for max increase percent
        const [settings] = await connection_1.db
            .select({
            weightMaxIncreasePercent: schema_1.restaurantSettings.weightMaxIncreasePercent,
        })
            .from(schema_1.restaurantSettings)
            .where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, request.restaurantId))
            .limit(1);
        const maxIncreasePercent = settings?.weightMaxIncreasePercent ?? weightRequest_helper_1.DEFAULT_WEIGHT_MAX_INCREASE_PERCENT;
        const orderedW = Number(item.orderedWeight || 0);
        const itemQty = Math.max(1, Number(item.quantity) || 1);
        if (orderedW > 0) {
            const maxAllowedPerPiece = (0, weightPricing_helper_1.calcMaxAllowedWeight)(orderedW, maxIncreasePercent);
            const maxAllowedTotal = (0, weightPricing_helper_1.calcMaxAllowedWeight)(orderedW * itemQty, maxIncreasePercent);
            let pieceWeight = numFinalWeight;
            if (numFinalWeight > maxAllowedPerPiece) {
                if (itemQty > 1 && numFinalWeight <= maxAllowedTotal) {
                    pieceWeight = Math.round((numFinalWeight / itemQty) * 1000) / 1000;
                }
                else {
                    throw new BadRequest_1.BadRequest(`Final weight (${numFinalWeight}) exceeds the maximum allowed increase of ${maxIncreasePercent}% (max: ${maxAllowedPerPiece}${itemQty > 1 ? `, max total: ${maxAllowedTotal}` : ""})`);
                }
            }
            updateData.finalWeight = pieceWeight.toFixed(3);
        }
        else {
            updateData.finalWeight = numFinalWeight.toFixed(3);
        }
    }
    // Recompute line total if either finalWeight or unitPrice changed
    if (finalWeight !== undefined || unitPrice !== undefined) {
        const effectiveWeight = finalWeight !== undefined
            ? Number(updateData.finalWeight ?? finalWeight)
            : Number(item.finalWeight || item.orderedWeight || 0);
        const baseP = unitPrice !== undefined
            ? Number(unitPrice)
            : parseFloat(item.unitPrice || "0");
        // Customer rows store {variations:[...]}, so parse through the snapshot helper.
        const parsedVars = (0, weightRequest_helper_1.parseVariationSnapshot)(item.variations);
        const parsedAddons = (0, weightRequest_helper_1.parseAddonSnapshot)(item.addons);
        const optExtras = [
            ...parsedVars.map((v) => ({
                price: v.price ?? v.additionalPrice ?? 0,
                priceMode: v.priceMode || "fixed",
            })),
            ...parsedAddons.map((a) => ({
                price: a.price || 0,
                priceMode: "fixed",
            })),
        ];
        const recomputedTotal = (0, weightPricing_helper_1.computeWeightedLineTotal)(effectiveWeight, baseP, optExtras, item.quantity);
        updateData.totalPrice = recomputedTotal;
    }
    // Write under a lock on the request so a concurrent confirm / reject / cancel cannot interleave.
    await connection_1.db.transaction(async (tx) => {
        const [locked] = await tx
            .select({ status: schema_1.weightRequests.status, weighingLog: schema_1.weightRequests.weighingLog })
            .from(schema_1.weightRequests)
            .where((0, drizzle_orm_1.eq)(schema_1.weightRequests.id, id))
            .for("update");
        if (!locked || locked.status !== "awaiting_weighing") {
            throw new BadRequest_1.BadRequest(`Item edits are only allowed while request is awaiting weighing. Current status: ${locked?.status}`);
        }
        await tx.update(schema_1.cartItems).set(updateData)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cartItems.id, cartItemId), (0, drizzle_orm_1.eq)(schema_1.cartItems.weightRequestId, id)));
        // Owner price override: old and new price kept in weighing_log.
        if (updateData.unitPrice !== undefined && Number(updateData.unitPrice) !== Number(item.unitPrice ?? 0)) {
            await tx.update(schema_1.weightRequests)
                .set({
                weighingLog: [
                    ...(0, weightRequest_helper_1.parseWeighingLog)(locked.weighingLog),
                    (0, weightRequest_helper_1.priceChangeLogEntry)({ cartItemId, foodId: item.foodId, oldPrice: item.unitPrice, newPrice: updateData.unitPrice, by: staffId, now }),
                ],
                updatedAt: now,
            })
                .where((0, drizzle_orm_1.eq)(schema_1.weightRequests.id, id));
        }
    });
    const updatedDetails = await formatRequestDetails(id);
    return (0, response_1.SuccessResponse)(res, {
        message: "Customer item updated successfully",
        data: updatedDetails,
    });
};
exports.patchCustomerItemWeight = patchCustomerItemWeight;
/**
 * 🟢 4. PUT /admin/weight-requests/:id/items
 * Replaces the entire set of items added by the restaurant.
 * - Items without cartItemId are inserted.
 * - Items with cartItemId are updated.
 * - Existing restaurant-added items omitted from the array are DELETED.
 * - Empty array deletes all restaurant-added items.
 * - Customer-added items are NEVER touched.
 */
const replaceRestaurantItems = async (req, res) => {
    const { id } = req.params;
    const { items: incomingItems } = req.body;
    const staffId = req.user?.id;
    const restaurantId = getStaffRestaurantId(req);
    const request = await fetchAuthorizedWeightRequest(id, req);
    if (request.status !== "awaiting_weighing") {
        throw new BadRequest_1.BadRequest(`Item edits are only allowed while request is awaiting weighing. Current status: ${request.status}`);
    }
    const now = new Date();
    // "The restaurant never sends a price": unitPrice is accepted from the restaurant OWNER only.
    const isOwner = req.user?.type === "owner";
    if (!isOwner && Array.isArray(incomingItems) && incomingItems.some((it) => it?.unitPrice !== undefined)) {
        throw new BadRequest_1.BadRequest("Only the restaurant owner can set a custom price. Remove unitPrice to use the menu price.");
    }
    await connection_1.db.transaction(async (tx) => {
        const [lockedReq] = await tx
            .select({ status: schema_1.weightRequests.status, weighingLog: schema_1.weightRequests.weighingLog })
            .from(schema_1.weightRequests)
            .where((0, drizzle_orm_1.eq)(schema_1.weightRequests.id, id))
            .for("update");
        if (!lockedReq || lockedReq.status !== "awaiting_weighing") {
            throw new BadRequest_1.BadRequest(`Item edits are only allowed while request is awaiting weighing. Current status: ${lockedReq?.status}`);
        }
        // Same branch / channel pricing as the customer's cart (see resolveRestaurantItemPricingContext).
        const customerPricingRows = await tx
            .select({ branchId: schema_1.cartItems.branchId, serviceModule: schema_1.cartItems.serviceModule })
            .from(schema_1.cartItems)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cartItems.userId, request.userId), (0, drizzle_orm_1.eq)(schema_1.cartItems.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.cartItems.addedBy, "customer")));
        const activeBranches = request.branchId
            ? []
            : await tx.select({ id: schema_1.branches.id }).from(schema_1.branches).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.branches.status, "active")));
        const pricingContext = (0, weightRequest_helper_1.resolveRestaurantItemPricingContext)({
            requestBranchId: request.branchId,
            customerRows: customerPricingRows,
            activeBranchIds: activeBranches.map((b) => b.id),
        });
        const priceLog = [];
        // Fetch existing restaurant-added items of this request
        const existingRestItems = await tx
            .select()
            .from(schema_1.cartItems)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cartItems.weightRequestId, id), (0, drizzle_orm_1.eq)(schema_1.cartItems.addedBy, "restaurant")))
            .for("update");
        const existingRestItemMap = new Map(existingRestItems.map((i) => [i.id, i]));
        const retainedIds = new Set();
        // Process each incoming item
        for (let i = 0; i < incomingItems.length; i++) {
            const itemInput = incomingItems[i];
            // If cartItemId is provided, it MUST exist in existing restaurant-added items of this request
            if (itemInput.cartItemId) {
                if (!existingRestItemMap.has(itemInput.cartItemId)) {
                    throw new BadRequest_1.BadRequest(`Item at index ${i}: Invalid cartItemId (${itemInput.cartItemId}). It does not exist or belongs to the customer.`);
                }
                retainedIds.add(itemInput.cartItemId);
            }
            // Validate food ownership and status
            const [targetFood] = await tx
                .select()
                .from(schema_1.food)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, itemInput.foodId), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)))
                .limit(1);
            if (!targetFood) {
                throw new BadRequest_1.BadRequest(`Item at index ${i}: Food not found or does not belong to this restaurant.`);
            }
            if (targetFood.status === "inactive" || targetFood.isOutOfStock) {
                throw new BadRequest_1.BadRequest(`Item at index ${i}: Food "${targetFood.name}" is inactive or out of stock.`);
            }
            const isWeighted = targetFood.sold_by === "weight";
            // Validate variations and addons from DB
            const rawVars = Array.isArray(itemInput.variations) ? itemInput.variations : [];
            const rawAddons = Array.isArray(itemInput.addons) ? itemInput.addons : [];
            const optionIds = rawVars.map((v) => v.optionId || v.id).filter(Boolean);
            const addonIds = rawAddons.map((a) => a.addonId || a.id).filter(Boolean);
            const dbOptions = optionIds.length > 0
                ? await tx
                    .select({
                    id: schema_1.variationOptions.id,
                    optionName: schema_1.variationOptions.optionName,
                    optionNameAr: schema_1.variationOptions.optionNameAr,
                    additionalPrice: schema_1.variationOptions.additionalPrice,
                    priceMode: schema_1.variationOptions.priceMode,
                    variationId: schema_1.foodVariations.id,
                    variationName: schema_1.foodVariations.name,
                    variationNameAr: schema_1.foodVariations.nameAr,
                    isRequired: schema_1.foodVariations.isRequired,
                    selectionType: schema_1.foodVariations.selectionType,
                    isWeightGroup: schema_1.foodVariations.isWeightGroup,
                    weightValue: schema_1.variationOptions.weightValue,
                    variationFoodId: schema_1.foodVariations.foodId,
                })
                    .from(schema_1.variationOptions)
                    .leftJoin(schema_1.foodVariations, (0, drizzle_orm_1.eq)(schema_1.variationOptions.variationId, schema_1.foodVariations.id))
                    .where((0, drizzle_orm_1.inArray)(schema_1.variationOptions.id, optionIds))
                : [];
            const dbAddons = addonIds.length > 0
                ? await tx.select().from(schema_1.addons).where((0, drizzle_orm_1.inArray)(schema_1.addons.id, addonIds))
                : [];
            if (dbOptions.length !== new Set(optionIds).size || dbOptions.some((o) => o.variationFoodId !== targetFood.id)) {
                throw new BadRequest_1.BadRequest(`Item at index ${i}: one or more options do not belong to "${targetFood.name}".`);
            }
            // Same weight rules as the customer cart: decimals, minimum, sane maximum, and the
            // weight-group / allow_custom_weight rules for the selected options.
            try {
                const normalised = (0, weightPricing_helper_1.validateWeightInput)(targetFood, itemInput.weight, dbOptions.map((o) => ({ isWeightGroup: o.isWeightGroup, weightValue: o.weightValue })));
                if (isWeighted)
                    itemInput.weight = normalised;
            }
            catch (err) {
                throw new BadRequest_1.BadRequest(`Item at index ${i}: ${err.message}`);
            }
            // Validate price_mode on options
            for (const opt of dbOptions) {
                (0, weightPricing_helper_1.validateOptionPriceMode)(targetFood.sold_by, opt.priceMode, opt.additionalPrice);
            }
            // Channel-resolved prices for the food and its options (calculateCalculatedPrice, as in the cart).
            const priceResult = await (0, pricing_helper_1.calculateCalculatedPrice)(targetFood.id, dbOptions.map((o) => o.id), pricingContext.branchId, pricingContext.serviceModule);
            if (!priceResult.isAvailable) {
                throw new BadRequest_1.BadRequest(`Item at index ${i}: "${targetFood.name}" or one of its options is not available on this branch / channel.`);
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
                price: a.price || "0.00",
            }));
            const quantity = itemInput.quantity || 1;
            const ownerUnitPrice = isOwner && itemInput.unitPrice !== undefined ? Number(itemInput.unitPrice) : undefined;
            const built = (0, weightRequest_helper_1.buildRestaurantItemPrice)({
                isWeighted,
                weight: isWeighted ? Number(itemInput.weight) : null,
                quantity,
                resolvedBasePrice: priceResult.basePrice,
                options: detailedVars.map((v) => ({ price: Number(v.price), priceMode: v.priceMode })),
                addonPrices: detailedAddons.map((a) => Number(a.price || 0)),
                ownerUnitPrice,
            }, (w, base, extras, qty) => (0, weightPricing_helper_1.computeWeightedLineTotal)(w, base, extras, qty));
            const unitPriceStr = built.unitPrice;
            const totalPriceStr = built.totalPrice;
            if (ownerUnitPrice !== undefined && Math.abs(ownerUnitPrice - priceResult.basePrice) > 0.001) {
                priceLog.push((0, weightRequest_helper_1.priceChangeLogEntry)({
                    cartItemId: itemInput.cartItemId ?? null, foodId: targetFood.id, foodName: targetFood.name,
                    oldPrice: priceResult.basePrice, newPrice: ownerUnitPrice, by: staffId, now,
                }));
            }
            if (itemInput.cartItemId) {
                // Update existing restaurant row
                await tx
                    .update(schema_1.cartItems)
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
                    .where((0, drizzle_orm_1.eq)(schema_1.cartItems.id, itemInput.cartItemId));
            }
            else {
                // Insert new restaurant row
                const newCartItemId = (0, uuid_1.v4)();
                await tx.insert(schema_1.cartItems).values({
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
                await tx.delete(schema_1.cartItems).where((0, drizzle_orm_1.eq)(schema_1.cartItems.id, existingItem.id));
            }
        }
        // Owner price overrides: old (menu) and new price kept in weighing_log.
        if (priceLog.length > 0) {
            await tx.update(schema_1.weightRequests)
                .set({ weighingLog: [...(0, weightRequest_helper_1.parseWeighingLog)(lockedReq.weighingLog), ...priceLog], updatedAt: now })
                .where((0, drizzle_orm_1.eq)(schema_1.weightRequests.id, id));
        }
    });
    const updatedDetails = await formatRequestDetails(id);
    return (0, response_1.SuccessResponse)(res, {
        message: "Restaurant items replaced successfully",
        data: updatedDetails,
    });
};
exports.replaceRestaurantItems = replaceRestaurantItems;
/**
 * 🟢 5. POST /admin/weight-requests/:id/confirm
 * Sends the request to the customer. ONE time only.
 * By default, weighted customer rows that were not weighed (no final_weight, not unavailable) are
 * confirmed AT THE ORDERED WEIGHT. Optional body { strict: true } restores the old rule (reject them).
 * Validates every weighted row, writes weighing_log, sets the customer timeout, notifies the customer.
 */
const confirmWeightRequest = async (req, res) => {
    const { id } = req.params;
    const staffId = req.user?.id;
    const restaurantId = getStaffRestaurantId(req);
    const strict = (0, weightPricing_helper_1.parseBooleanInput)(req.body?.strict) === true;
    // Same restaurant + branch check as the other routes: staff of another branch cannot confirm.
    await fetchAuthorizedWeightRequest(id, req);
    const now = new Date();
    const result = await connection_1.db.transaction(async (tx) => {
        const [request] = await tx
            .select()
            .from(schema_1.weightRequests)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.weightRequests.id, id), (0, drizzle_orm_1.eq)(schema_1.weightRequests.restaurantId, restaurantId)))
            .for("update");
        if (!request)
            throw new NotFound_1.NotFound("Weight request not found");
        if (request.status !== "awaiting_weighing") {
            throw new BadRequest_1.BadRequest(`Only requests in 'awaiting_weighing' status can be confirmed. Current status: ${request.status}`);
        }
        const items = await tx
            .select({
            id: schema_1.cartItems.id,
            foodId: schema_1.cartItems.foodId,
            foodName: schema_1.food.name,
            orderedWeight: schema_1.cartItems.weight,
            finalWeight: schema_1.cartItems.finalWeight,
            weightUnit: schema_1.cartItems.weightUnit,
            foodWeightUnit: schema_1.food.weight_unit,
            isUnavailable: schema_1.cartItems.isUnavailable,
            addedBy: schema_1.cartItems.addedBy,
            sold_by: schema_1.food.sold_by,
            unitPrice: schema_1.cartItems.unitPrice,
            quantity: schema_1.cartItems.quantity,
            variations: schema_1.cartItems.variations,
            addons: schema_1.cartItems.addons,
        })
            .from(schema_1.cartItems)
            .leftJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.cartItems.foodId, schema_1.food.id))
            .where((0, drizzle_orm_1.eq)(schema_1.cartItems.weightRequestId, id))
            .for("update");
        const [settings] = await tx
            .select({
            weightCustomerTimeoutMin: schema_1.restaurantSettings.weightCustomerTimeoutMin,
            weightMaxIncreasePercent: schema_1.restaurantSettings.weightMaxIncreasePercent,
        })
            .from(schema_1.restaurantSettings)
            .where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, restaurantId))
            .limit(1);
        const plan = (0, weightRequest_helper_1.planConfirmation)(items, { strict, maxIncreasePercent: settings?.weightMaxIncreasePercent ?? weightRequest_helper_1.DEFAULT_WEIGHT_MAX_INCREASE_PERCENT }, (w, price, extras, qty) => (0, weightPricing_helper_1.computeWeightedLineTotal)(w, price, extras, qty), { isWeightWithinLimit: weightPricing_helper_1.isWeightWithinLimit, isSaneWeight: weightPricing_helper_1.isSaneWeight });
        if (plan.kind === "reject")
            throw new BadRequest_1.BadRequest(plan.message);
        // Every weighted customer row unavailable and nothing added by the restaurant:
        // nothing left to weigh → cancel with the normal cleanup and tell the customer.
        if (plan.kind === "cancel") {
            await tx
                .update(schema_1.weightRequests)
                .set({
                status: "cancelled",
                cancelReason: "All weighed items are unavailable.",
                updatedAt: now,
            })
                .where((0, drizzle_orm_1.eq)(schema_1.weightRequests.id, id));
            await tx
                .update(schema_1.cartItems)
                .set({ weightRequestId: null, finalWeight: null, isUnavailable: false, updatedAt: now })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cartItems.weightRequestId, id), (0, drizzle_orm_1.eq)(schema_1.cartItems.addedBy, "customer")));
            return {
                status: "cancelled",
                userId: request.userId,
                restaurantId: request.restaurantId,
                branchId: request.branchId || null,
                expiresAt: null
            };
        }
        // Rows confirmed at the ordered weight (the line total is unchanged; stored again for consistency).
        for (const d of plan.defaults) {
            await tx
                .update(schema_1.cartItems)
                .set({ finalWeight: d.finalWeight, totalPrice: d.totalPrice, updatedAt: now })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cartItems.id, d.id), (0, drizzle_orm_1.eq)(schema_1.cartItems.weightRequestId, id)));
        }
        const earlierPriceChanges = (0, weightRequest_helper_1.parseWeighingLog)(request.weighingLog).filter((e) => e?.action === "price_changed");
        const weighingLog = [...earlierPriceChanges, ...plan.log.map(({ item, action, finalWeight }) => ({
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
        const customerTimeoutMin = settings?.weightCustomerTimeoutMin ?? weightRequest_helper_1.DEFAULT_WEIGHT_CUSTOMER_TIMEOUT_MIN;
        const expiresAt = new Date(now.getTime() + customerTimeoutMin * 60 * 1000);
        await tx
            .update(schema_1.weightRequests)
            .set({
            status: "awaiting_customer_approval",
            weighedBy: staffId,
            weighedAt: now,
            expiresAt,
            weighingLog: weighingLog,
            updatedAt: now,
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.weightRequests.id, id), (0, drizzle_orm_1.eq)(schema_1.weightRequests.status, "awaiting_weighing")));
        return {
            status: "awaiting_customer_approval",
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
            (0, socketService_1.notifyUser)(result.userId, "weight_request_rejected", {
                weightRequestId: id,
                restaurantId: result.restaurantId,
                branchId: result.branchId,
                reason: "All weighed items are unavailable.",
            });
            await (0, notifications_1.sendPushNotification)({
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
        }
        else {
            (0, socketService_1.notifyUser)(result.userId, "weight_request_confirmed", {
                weightRequestId: id,
                restaurantId: result.restaurantId,
                branchId: result.branchId,
                expiresAt: result.expiresAt,
            });
            await (0, notifications_1.sendPushNotification)({
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
    }
    catch (notifyErr) {
        console.warn("[confirmWeightRequest] Notification warning:", notifyErr);
    }
    const updatedDetails = await formatRequestDetails(id);
    return (0, response_1.SuccessResponse)(res, {
        message: result.status === "cancelled"
            ? "All weighed items are unavailable: the request was cancelled and the customer notified"
            : "Weight request confirmed and sent to customer",
        data: updatedDetails,
    });
};
exports.confirmWeightRequest = confirmWeightRequest;
/**
 * 🟢 6. POST /admin/weight-requests/:id/reject
 * Cancels the whole request, unlocks customer items, deletes restaurant items, notifies customer.
 */
const rejectWeightRequest = async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const restaurantId = getStaffRestaurantId(req);
    const now = new Date();
    const request = await fetchAuthorizedWeightRequest(id, req);
    if (!["awaiting_weighing", "awaiting_customer_approval"].includes(request.status)) {
        throw new BadRequest_1.BadRequest(`Cannot reject a request with status: ${request.status}`);
    }
    await connection_1.db.transaction(async (tx) => {
        // Re-check the status under lock (a checkout / cancel / cron may have won the race).
        const [locked] = await tx
            .select({ status: schema_1.weightRequests.status })
            .from(schema_1.weightRequests)
            .where((0, drizzle_orm_1.eq)(schema_1.weightRequests.id, id))
            .for("update");
        if (!locked || !weightRequest_helper_1.ACTIVE_WEIGHT_REQUEST_STATUSES.includes(locked.status)) {
            throw new BadRequest_1.BadRequest(`Cannot reject a request with status: ${locked?.status}`);
        }
        await tx
            .update(schema_1.weightRequests)
            .set({
            status: "cancelled",
            cancelReason: reason || "Rejected by restaurant",
            updatedAt: now,
        })
            .where((0, drizzle_orm_1.eq)(schema_1.weightRequests.id, id));
        // Delete restaurant-added items
        await tx
            .delete(schema_1.cartItems)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cartItems.weightRequestId, id), (0, drizzle_orm_1.eq)(schema_1.cartItems.addedBy, "restaurant")));
        // Unlock and reset customer-added items
        await tx
            .update(schema_1.cartItems)
            .set({
            weightRequestId: null,
            finalWeight: null,
            isUnavailable: false,
            updatedAt: now,
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cartItems.weightRequestId, id), (0, drizzle_orm_1.eq)(schema_1.cartItems.addedBy, "customer")));
    });
    // Notify customer
    try {
        (0, socketService_1.notifyUser)(request.userId, "weight_request_rejected", {
            weightRequestId: id,
            restaurantId: request.restaurantId,
            branchId: request.branchId || null,
            reason: reason || "Rejected by restaurant",
        });
        await (0, notifications_1.sendPushNotification)({
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
    }
    catch (notifyErr) {
        console.warn("[rejectWeightRequest] Notification warning:", notifyErr);
    }
    return (0, response_1.SuccessResponse)(res, {
        message: "Weight request rejected successfully",
        data: { id, status: "cancelled" },
    });
};
exports.rejectWeightRequest = rejectWeightRequest;
