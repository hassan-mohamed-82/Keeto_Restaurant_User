"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toggleDiscountStatus = exports.deleteDiscount = exports.updateDiscount = exports.getDiscountById = exports.getAllDiscounts = exports.createDiscount = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const NotFound_1 = require("../../Errors/NotFound");
const uuid_1 = require("uuid");
// ==========================================
// 1. Create Discount
// ==========================================
const createDiscount = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const { name, nameAr, nameFr, discountType, discountValue, maxDiscount, minOrderAmount, usageLimit, startDate, endDate, isActive } = req.body;
    if (!name)
        throw new BadRequest_1.BadRequest("Discount name is required");
    if (!discountType)
        throw new BadRequest_1.BadRequest("Discount type is required (percentage | fixed_amount)");
    if (discountValue === undefined || discountValue === null)
        throw new BadRequest_1.BadRequest("Discount value is required");
    const id = (0, uuid_1.v4)();
    await connection_1.db.insert(schema_1.discounts).values({
        id,
        restaurantId,
        name,
        nameAr: nameAr || null,
        nameFr: nameFr || null,
        discountType,
        discountValue: discountValue.toString(),
        maxDiscount: maxDiscount ? maxDiscount.toString() : null,
        minOrderAmount: minOrderAmount ? minOrderAmount.toString() : "0.00",
        usageLimit: usageLimit || null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        isActive: isActive !== undefined ? isActive : true,
    });
    return (0, response_1.SuccessResponse)(res, { message: "Discount created successfully", data: { id } }, 201);
};
exports.createDiscount = createDiscount;
// ==========================================
// 2. Get All Discounts (for this restaurant)
// ==========================================
const getAllDiscounts = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const allDiscounts = await connection_1.db
        .select()
        .from(schema_1.discounts)
        .where((0, drizzle_orm_1.eq)(schema_1.discounts.restaurantId, restaurantId));
    return (0, response_1.SuccessResponse)(res, { message: "Get all discounts success", data: allDiscounts });
};
exports.getAllDiscounts = getAllDiscounts;
// ==========================================
// 3. Get Discount by ID
// ==========================================
const getDiscountById = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const [discount] = await connection_1.db
        .select()
        .from(schema_1.discounts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.discounts.id, id), (0, drizzle_orm_1.eq)(schema_1.discounts.restaurantId, restaurantId)))
        .limit(1);
    if (!discount)
        throw new NotFound_1.NotFound("Discount not found");
    return (0, response_1.SuccessResponse)(res, { message: "Get discount success", data: discount });
};
exports.getDiscountById = getDiscountById;
// ==========================================
// 4. Update Discount
// ==========================================
const updateDiscount = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.discounts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.discounts.id, id), (0, drizzle_orm_1.eq)(schema_1.discounts.restaurantId, restaurantId)))
        .limit(1);
    if (!existing)
        throw new NotFound_1.NotFound("Discount not found");
    const { name, nameAr, nameFr, discountType, discountValue, maxDiscount, minOrderAmount, usageLimit, startDate, endDate, isActive } = req.body;
    const updateData = { updatedAt: new Date() };
    if (name !== undefined)
        updateData.name = name;
    if (nameAr !== undefined)
        updateData.nameAr = nameAr;
    if (nameFr !== undefined)
        updateData.nameFr = nameFr;
    if (discountType !== undefined)
        updateData.discountType = discountType;
    if (discountValue !== undefined)
        updateData.discountValue = discountValue.toString();
    if (maxDiscount !== undefined)
        updateData.maxDiscount = maxDiscount ? maxDiscount.toString() : null;
    if (minOrderAmount !== undefined)
        updateData.minOrderAmount = minOrderAmount.toString();
    if (usageLimit !== undefined)
        updateData.usageLimit = usageLimit;
    if (startDate !== undefined)
        updateData.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined)
        updateData.endDate = endDate ? new Date(endDate) : null;
    if (isActive !== undefined)
        updateData.isActive = isActive;
    await connection_1.db.update(schema_1.discounts).set(updateData).where((0, drizzle_orm_1.eq)(schema_1.discounts.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Discount updated successfully" });
};
exports.updateDiscount = updateDiscount;
// ==========================================
// 5. Delete Discount
// ==========================================
const deleteDiscount = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.discounts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.discounts.id, id), (0, drizzle_orm_1.eq)(schema_1.discounts.restaurantId, restaurantId)))
        .limit(1);
    if (!existing)
        throw new NotFound_1.NotFound("Discount not found");
    await connection_1.db.delete(schema_1.discounts).where((0, drizzle_orm_1.eq)(schema_1.discounts.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Discount deleted successfully" });
};
exports.deleteDiscount = deleteDiscount;
// ==========================================
// 6. Toggle Discount Active Status
// ==========================================
const toggleDiscountStatus = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.discounts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.discounts.id, id), (0, drizzle_orm_1.eq)(schema_1.discounts.restaurantId, restaurantId)))
        .limit(1);
    if (!existing)
        throw new NotFound_1.NotFound("Discount not found");
    await connection_1.db.update(schema_1.discounts)
        .set({ isActive: !existing.isActive, updatedAt: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.discounts.id, id));
    return (0, response_1.SuccessResponse)(res, {
        message: `Discount ${!existing.isActive ? "activated" : "deactivated"} successfully`,
        data: { isActive: !existing.isActive }
    });
};
exports.toggleDiscountStatus = toggleDiscountStatus;
