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
// 1. Create Discount (With Switch Logic)
// ==========================================
const createDiscount = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const { name, nameAr, nameFr, discountType, discountValue, maxDiscount, minOrderAmount, usageLimit, startDate, endDate, isActive, foodIds } = req.body;
    if (!name)
        throw new BadRequest_1.BadRequest("Discount name is required");
    if (!discountType)
        throw new BadRequest_1.BadRequest("Discount type is required (percentage | fixed_amount)");
    if (discountValue === undefined || discountValue === null)
        throw new BadRequest_1.BadRequest("Discount value is required");
    const shouldBeActive = isActive !== undefined ? isActive : true;
    const discountId = (0, uuid_1.v4)();
    // 💡 منطق الـ Switch: إذا كان الخصم الجديد نشطاً، نقوم بإطفاء كل الخصومات النشطة حالياً للمطعم
    if (shouldBeActive) {
        // أ) جلب الـ IDs الخاصة بخصومات هذا المطعم فقط
        const myDiscounts = await connection_1.db
            .select({ id: schema_1.discounts.id })
            .from(schema_1.discounts)
            .innerJoin(schema_1.discountRestaurants, (0, drizzle_orm_1.eq)(schema_1.discounts.id, schema_1.discountRestaurants.discountId))
            .where((0, drizzle_orm_1.eq)(schema_1.discountRestaurants.restaurantId, restaurantId));
        const myDiscountIds = myDiscounts.map(d => d.id);
        // ب) إطفاء الخصومات السابقة إن وجدت
        if (myDiscountIds.length > 0) {
            await connection_1.db
                .update(schema_1.discounts)
                .set({ isActive: false, updatedAt: new Date() })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.discounts.id, myDiscountIds), (0, drizzle_orm_1.eq)(schema_1.discounts.isActive, true)));
        }
    }
    // 1. إدخال العرض الجديد في الجدول الرئيسي
    await connection_1.db.insert(schema_1.discounts).values({
        id: discountId,
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
        isActive: shouldBeActive,
        isGlobal: false
    });
    // 2. ربطه بالمطعم الحالي
    await connection_1.db.insert(schema_1.discountRestaurants).values({
        id: (0, uuid_1.v4)(),
        discountId: discountId,
        restaurantId: restaurantId
    });
    // 3. إضافة المنتجات المحددة (إن وجدت)
    if (foodIds && Array.isArray(foodIds) && foodIds.length > 0) {
        const foodValues = foodIds.map((foodId) => ({
            id: (0, uuid_1.v4)(),
            discountId: discountId,
            foodId: foodId
        }));
        await connection_1.db.insert(schema_1.discountFoods).values(foodValues);
    }
    return (0, response_1.SuccessResponse)(res, { message: "Discount created successfully. Other active discounts turned off.", data: { id: discountId } }, 201);
};
exports.createDiscount = createDiscount;
// ==========================================
// 2. Get All Discounts (This restaurant's discounts + Global discounts)
// ==========================================
const getAllDiscounts = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const rawData = await connection_1.db
        .selectDistinct({ discounts: schema_1.discounts })
        .from(schema_1.discounts)
        .leftJoin(schema_1.discountRestaurants, (0, drizzle_orm_1.eq)(schema_1.discounts.id, schema_1.discountRestaurants.discountId))
        .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.discounts.isGlobal, true), (0, drizzle_orm_1.eq)(schema_1.discountRestaurants.restaurantId, restaurantId)));
    const allDiscounts = rawData.map(row => row.discounts);
    const enrichedDiscounts = await Promise.all(allDiscounts.map(async (discount) => {
        const foodsData = await connection_1.db.select({
            id: schema_1.food.id,
            name: schema_1.food.name,
            nameAr: schema_1.food.nameAr,
            nameFr: schema_1.food.nameFr
        })
            .from(schema_1.discountFoods)
            .innerJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.discountFoods.foodId, schema_1.food.id))
            .where((0, drizzle_orm_1.eq)(schema_1.discountFoods.discountId, discount.id));
        return {
            ...discount,
            foodIds: foodsData.map(f => f.id),
            foods: foodsData
        };
    }));
    return (0, response_1.SuccessResponse)(res, { message: "Get all discounts success", data: enrichedDiscounts });
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
    const [rawData] = await connection_1.db
        .selectDistinct({ discounts: schema_1.discounts })
        .from(schema_1.discounts)
        .leftJoin(schema_1.discountRestaurants, (0, drizzle_orm_1.eq)(schema_1.discounts.id, schema_1.discountRestaurants.discountId))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.discounts.id, id), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.discounts.isGlobal, true), (0, drizzle_orm_1.eq)(schema_1.discountRestaurants.restaurantId, restaurantId))))
        .limit(1);
    if (!rawData)
        throw new NotFound_1.NotFound("Discount not found");
    const foodsData = await connection_1.db.select({
        id: schema_1.food.id,
        name: schema_1.food.name,
        nameAr: schema_1.food.nameAr,
        nameFr: schema_1.food.nameFr
    })
        .from(schema_1.discountFoods)
        .innerJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.discountFoods.foodId, schema_1.food.id))
        .where((0, drizzle_orm_1.eq)(schema_1.discountFoods.discountId, rawData.discounts.id));
    const result = {
        ...rawData.discounts,
        foodIds: foodsData.map(f => f.id),
        foods: foodsData
    };
    return (0, response_1.SuccessResponse)(res, { message: "Get discount success", data: result });
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
        .innerJoin(schema_1.discountRestaurants, (0, drizzle_orm_1.eq)(schema_1.discounts.id, schema_1.discountRestaurants.discountId))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.discounts.id, id), (0, drizzle_orm_1.eq)(schema_1.discountRestaurants.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.discounts.isGlobal, false)))
        .limit(1);
    if (!existing)
        throw new NotFound_1.NotFound("Discount not found or cannot be modified");
    const { name, nameAr, nameFr, discountType, discountValue, maxDiscount, minOrderAmount, usageLimit, startDate, endDate, isActive, foodIds } = req.body;
    // 💡 أيضاً في التحديث: إذا قام بتحويل الحالة إلى active، نطفئ باقي الخصومات
    if (isActive === true && !existing.discounts.isActive) {
        const myDiscounts = await connection_1.db
            .select({ id: schema_1.discounts.id })
            .from(schema_1.discounts)
            .innerJoin(schema_1.discountRestaurants, (0, drizzle_orm_1.eq)(schema_1.discounts.id, schema_1.discountRestaurants.discountId))
            .where((0, drizzle_orm_1.eq)(schema_1.discountRestaurants.restaurantId, restaurantId));
        const myDiscountIds = myDiscounts.map(d => d.id);
        if (myDiscountIds.length > 0) {
            await connection_1.db
                .update(schema_1.discounts)
                .set({ isActive: false, updatedAt: new Date() })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.discounts.id, myDiscountIds), (0, drizzle_orm_1.eq)(schema_1.discounts.isActive, true)));
        }
    }
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
    if (foodIds !== undefined) {
        await connection_1.db.delete(schema_1.discountFoods).where((0, drizzle_orm_1.eq)(schema_1.discountFoods.discountId, id));
        if (Array.isArray(foodIds) && foodIds.length > 0) {
            const foodValues = foodIds.map((foodId) => ({
                id: (0, uuid_1.v4)(),
                discountId: id,
                foodId: foodId
            }));
            await connection_1.db.insert(schema_1.discountFoods).values(foodValues);
        }
    }
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
        .innerJoin(schema_1.discountRestaurants, (0, drizzle_orm_1.eq)(schema_1.discounts.id, schema_1.discountRestaurants.discountId))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.discounts.id, id), (0, drizzle_orm_1.eq)(schema_1.discountRestaurants.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.discounts.isGlobal, false)))
        .limit(1);
    if (!existing)
        throw new NotFound_1.NotFound("Discount not found or cannot be deleted");
    await connection_1.db.delete(schema_1.discounts).where((0, drizzle_orm_1.eq)(schema_1.discounts.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Discount deleted successfully" });
};
exports.deleteDiscount = deleteDiscount;
// ==========================================
// 6. Toggle Discount Status (With Switch Logic)
// ==========================================
const toggleDiscountStatus = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const [rawData] = await connection_1.db
        .select()
        .from(schema_1.discounts)
        .innerJoin(schema_1.discountRestaurants, (0, drizzle_orm_1.eq)(schema_1.discounts.id, schema_1.discountRestaurants.discountId))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.discounts.id, id), (0, drizzle_orm_1.eq)(schema_1.discountRestaurants.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.discounts.isGlobal, false)))
        .limit(1);
    if (!rawData)
        throw new NotFound_1.NotFound("Discount not found or cannot be modified");
    const existingDiscount = rawData.discounts;
    const nextStatus = !existingDiscount.isActive;
    // 💡 إذا كان صاحب المطعم يفتح الـ Switch (يحول الحالة لـ true)
    if (nextStatus === true) {
        // أ) جلب كل الخصومات التابعة للمطعم
        const myDiscounts = await connection_1.db
            .select({ id: schema_1.discounts.id })
            .from(schema_1.discounts)
            .innerJoin(schema_1.discountRestaurants, (0, drizzle_orm_1.eq)(schema_1.discounts.id, schema_1.discountRestaurants.discountId))
            .where((0, drizzle_orm_1.eq)(schema_1.discountRestaurants.restaurantId, restaurantId));
        const myDiscountIds = myDiscounts.map(d => d.id);
        // ب) إيقاف أي خصم نشط آخر فوراً لضمان وجود خصم واحد نشط فقط
        if (myDiscountIds.length > 0) {
            await connection_1.db
                .update(schema_1.discounts)
                .set({ isActive: false, updatedAt: new Date() })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.discounts.id, myDiscountIds), (0, drizzle_orm_1.eq)(schema_1.discounts.isActive, true)));
        }
    }
    // ج) تحديث الخصم الحالي للحالة الجديدة
    await connection_1.db.update(schema_1.discounts)
        .set({ isActive: nextStatus, updatedAt: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.discounts.id, id));
    return (0, response_1.SuccessResponse)(res, {
        message: `Discount ${nextStatus ? "activated" : "deactivated"} successfully. Other active discounts turned off.`,
        data: { isActive: nextStatus }
    });
};
exports.toggleDiscountStatus = toggleDiscountStatus;
