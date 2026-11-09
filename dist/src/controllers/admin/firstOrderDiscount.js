"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFirstOrderDiscountUsages = exports.toggleFirstOrderDiscountStatus = exports.deleteFirstOrderDiscount = exports.updateFirstOrderDiscount = exports.getFirstOrderDiscountById = exports.getAllFirstOrderDiscounts = exports.createFirstOrderDiscount = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const NotFound_1 = require("../../Errors/NotFound");
const uuid_1 = require("uuid");
// =====================================================================
// Helper — get restaurantId from JWT
// =====================================================================
const getRestaurantId = (req) => {
    const id = req.user?.restaurantId || req.user?.id;
    if (!id)
        throw new BadRequest_1.BadRequest("Unauthorized");
    return id;
};
// =====================================================================
// 1. Create First-Order Discount
// POST /admin/first-order-discounts
// =====================================================================
const createFirstOrderDiscount = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const { name, nameAr, nameFr, firstOrderCount, discountType, discountValue, maxDiscountAmount, maxUsage, maxUsagePerUser, startDate, endDate, status, } = req.body;
    const id = (0, uuid_1.v4)();
    await connection_1.db.insert(schema_1.firstOrderDiscounts).values({
        id,
        name,
        nameAr: nameAr ?? null,
        nameFr: nameFr ?? null,
        restaurantId,
        firstOrderCount: Number(firstOrderCount),
        discountType,
        discountValue: String(discountValue),
        maxDiscountAmount: maxDiscountAmount ? String(maxDiscountAmount) : null,
        maxUsage: maxUsage ? Number(maxUsage) : null,
        usedCount: 0,
        maxUsagePerUser: maxUsagePerUser ? Number(maxUsagePerUser) : 1,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        status: status ?? "active",
    });
    return (0, response_1.SuccessResponse)(res, {
        message: "First-order discount created successfully",
        data: { id },
    }, 201);
};
exports.createFirstOrderDiscount = createFirstOrderDiscount;
// =====================================================================
// 2. Get All First-Order Discounts for this Restaurant
// GET /admin/first-order-discounts
// =====================================================================
const getAllFirstOrderDiscounts = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const data = await connection_1.db
        .select()
        .from(schema_1.firstOrderDiscounts)
        .where((0, drizzle_orm_1.eq)(schema_1.firstOrderDiscounts.restaurantId, restaurantId));
    return (0, response_1.SuccessResponse)(res, { message: "Fetched successfully", data });
};
exports.getAllFirstOrderDiscounts = getAllFirstOrderDiscounts;
// =====================================================================
// 3. Get Single First-Order Discount by ID
// GET /admin/first-order-discounts/:id
// =====================================================================
const getFirstOrderDiscountById = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const { id } = req.params;
    const [data] = await connection_1.db
        .select()
        .from(schema_1.firstOrderDiscounts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.firstOrderDiscounts.id, id), (0, drizzle_orm_1.eq)(schema_1.firstOrderDiscounts.restaurantId, restaurantId)))
        .limit(1);
    if (!data)
        throw new NotFound_1.NotFound("First-order discount not found");
    return (0, response_1.SuccessResponse)(res, { message: "Fetched successfully", data });
};
exports.getFirstOrderDiscountById = getFirstOrderDiscountById;
// =====================================================================
// 4. Update First-Order Discount
// PUT /admin/first-order-discounts/:id
// =====================================================================
const updateFirstOrderDiscount = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.firstOrderDiscounts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.firstOrderDiscounts.id, id), (0, drizzle_orm_1.eq)(schema_1.firstOrderDiscounts.restaurantId, restaurantId)))
        .limit(1);
    if (!existing)
        throw new NotFound_1.NotFound("First-order discount not found or unauthorized");
    const { name, nameAr, nameFr, firstOrderCount, discountType, discountValue, maxDiscountAmount, maxUsage, maxUsagePerUser, startDate, endDate, status, } = req.body;
    const updateData = { updatedAt: new Date() };
    if (name !== undefined)
        updateData.name = name;
    if (nameAr !== undefined)
        updateData.nameAr = nameAr;
    if (nameFr !== undefined)
        updateData.nameFr = nameFr;
    if (firstOrderCount !== undefined)
        updateData.firstOrderCount = Number(firstOrderCount);
    if (discountType !== undefined)
        updateData.discountType = discountType;
    if (discountValue !== undefined)
        updateData.discountValue = String(discountValue);
    if (maxDiscountAmount !== undefined)
        updateData.maxDiscountAmount = maxDiscountAmount ? String(maxDiscountAmount) : null;
    if (maxUsage !== undefined)
        updateData.maxUsage = maxUsage ? Number(maxUsage) : null;
    if (maxUsagePerUser !== undefined)
        updateData.maxUsagePerUser = Number(maxUsagePerUser);
    if (startDate !== undefined)
        updateData.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined)
        updateData.endDate = endDate ? new Date(endDate) : null;
    if (status !== undefined)
        updateData.status = status;
    await connection_1.db.update(schema_1.firstOrderDiscounts).set(updateData).where((0, drizzle_orm_1.eq)(schema_1.firstOrderDiscounts.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "First-order discount updated successfully" });
};
exports.updateFirstOrderDiscount = updateFirstOrderDiscount;
// =====================================================================
// 5. Delete First-Order Discount
// DELETE /admin/first-order-discounts/:id
// =====================================================================
const deleteFirstOrderDiscount = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select({ id: schema_1.firstOrderDiscounts.id })
        .from(schema_1.firstOrderDiscounts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.firstOrderDiscounts.id, id), (0, drizzle_orm_1.eq)(schema_1.firstOrderDiscounts.restaurantId, restaurantId)))
        .limit(1);
    if (!existing)
        throw new NotFound_1.NotFound("First-order discount not found or unauthorized");
    // cascade will delete usages automatically (ON DELETE CASCADE)
    await connection_1.db.delete(schema_1.firstOrderDiscounts).where((0, drizzle_orm_1.eq)(schema_1.firstOrderDiscounts.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "First-order discount deleted successfully" });
};
exports.deleteFirstOrderDiscount = deleteFirstOrderDiscount;
// =====================================================================
// 6. Toggle Status (active ↔ inactive)
// PATCH /admin/first-order-discounts/:id/toggle-status
// =====================================================================
const toggleFirstOrderDiscountStatus = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.firstOrderDiscounts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.firstOrderDiscounts.id, id), (0, drizzle_orm_1.eq)(schema_1.firstOrderDiscounts.restaurantId, restaurantId)))
        .limit(1);
    if (!existing)
        throw new NotFound_1.NotFound("First-order discount not found or unauthorized");
    const newStatus = existing.status === "active" ? "inactive" : "active";
    await connection_1.db
        .update(schema_1.firstOrderDiscounts)
        .set({ status: newStatus, updatedAt: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.firstOrderDiscounts.id, id));
    return (0, response_1.SuccessResponse)(res, {
        message: `First-order discount ${newStatus === "active" ? "activated" : "deactivated"} successfully`,
        data: { status: newStatus },
    });
};
exports.toggleFirstOrderDiscountStatus = toggleFirstOrderDiscountStatus;
// =====================================================================
// 7. Get Usage History for a Discount
// GET /admin/first-order-discounts/:id/usages
// =====================================================================
const getFirstOrderDiscountUsages = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select({ id: schema_1.firstOrderDiscounts.id })
        .from(schema_1.firstOrderDiscounts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.firstOrderDiscounts.id, id), (0, drizzle_orm_1.eq)(schema_1.firstOrderDiscounts.restaurantId, restaurantId)))
        .limit(1);
    if (!existing)
        throw new NotFound_1.NotFound("First-order discount not found or unauthorized");
    const usages = await connection_1.db
        .select()
        .from(schema_1.firstOrderDiscountUsages)
        .where((0, drizzle_orm_1.eq)(schema_1.firstOrderDiscountUsages.firstOrderDiscountId, id));
    return (0, response_1.SuccessResponse)(res, {
        message: "Usage history fetched successfully",
        data: usages,
    });
};
exports.getFirstOrderDiscountUsages = getFirstOrderDiscountUsages;
