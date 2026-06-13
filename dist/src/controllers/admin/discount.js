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
// 1. Create Discount (For this restaurant specifically)
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
    const discountId = (0, uuid_1.v4)();
    // 1. إدخال العرض في الجدول الرئيسي (مع ضبط isGlobal على false لأن المطعم هو من ينشئه لنفسه)
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
        isActive: isActive !== undefined ? isActive : true,
        isGlobal: false // عروض المطاعم ليست عامة تلقائياً
    });
    // 2. ربطه تلقائياً وبأمان بالمطعم الحالي من التوكن
    await connection_1.db.insert(schema_1.discountRestaurants).values({
        id: (0, uuid_1.v4)(),
        discountId: discountId,
        restaurantId: restaurantId
    });
    return (0, response_1.SuccessResponse)(res, { message: "Discount created successfully", data: { id: discountId } }, 201);
};
exports.createDiscount = createDiscount;
// ==========================================
// 2. Get All Discounts (This restaurant's discounts + Global discounts)
// ==========================================
const getAllDiscounts = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    // جلب الخصومات المربوطة بهذا المطعم عبر الـ leftJoin + جلب العروض الـ Global التي تشمله
    const rawData = await connection_1.db
        .selectDistinct({ discounts: schema_1.discounts })
        .from(schema_1.discounts)
        .leftJoin(schema_1.discountRestaurants, (0, drizzle_orm_1.eq)(schema_1.discounts.id, schema_1.discountRestaurants.discountId))
        .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.discounts.isGlobal, true), // جلب العروض العامة التي تطبق على الجميع
    (0, drizzle_orm_1.eq)(schema_1.discountRestaurants.restaurantId, restaurantId) // جلب عروض المطعم الخاصة
    ));
    const allDiscounts = rawData.map(row => row.discounts);
    return (0, response_1.SuccessResponse)(res, { message: "Get all discounts success", data: allDiscounts });
};
exports.getAllDiscounts = getAllDiscounts;
// ==========================================
// 3. Get Discount by ID (Scoped to this restaurant or Global)
// ==========================================
const getDiscountById = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    // التحقق من وجود الخصم وأنه إما مخصص للمطعم أو خصم عام متاح للجميع
    const [rawData] = await connection_1.db
        .selectDistinct({ discounts: schema_1.discounts })
        .from(schema_1.discounts)
        .leftJoin(schema_1.discountRestaurants, (0, drizzle_orm_1.eq)(schema_1.discounts.id, schema_1.discountRestaurants.discountId))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.discounts.id, id), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.discounts.isGlobal, true), (0, drizzle_orm_1.eq)(schema_1.discountRestaurants.restaurantId, restaurantId))))
        .limit(1);
    if (!rawData)
        throw new NotFound_1.NotFound("Discount not found");
    return (0, response_1.SuccessResponse)(res, { message: "Get discount success", data: rawData.discounts });
};
exports.getDiscountById = getDiscountById;
// ==========================================
// 4. Update Discount (Protected - Restrict editing global discounts)
// ==========================================
const updateDiscount = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    // تأكيد ملكية المطعم للخصم، والتأكد أنه ليس خصماً عاماً (لأن المطعم لا يملك صلاحية تعديل خصومات الأدمن العامة)
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.discounts)
        .innerJoin(schema_1.discountRestaurants, (0, drizzle_orm_1.eq)(schema_1.discounts.id, schema_1.discountRestaurants.discountId))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.discounts.id, id), (0, drizzle_orm_1.eq)(schema_1.discountRestaurants.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.discounts.isGlobal, false) // حماية: لمنع تعديل عروض الـ Global من قبل الـ Vendor
    ))
        .limit(1);
    if (!existing)
        throw new NotFound_1.NotFound("Discount not found or cannot be modified");
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
// 5. Delete Discount (Protected - Restrict deleting global discounts)
// ==========================================
const deleteDiscount = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    // تأكيد ملكية المطعم للخصم وأنه ليس Global قبل الحذف
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.discounts)
        .innerJoin(schema_1.discountRestaurants, (0, drizzle_orm_1.eq)(schema_1.discounts.id, schema_1.discountRestaurants.discountId))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.discounts.id, id), (0, drizzle_orm_1.eq)(schema_1.discountRestaurants.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.discounts.isGlobal, false) // حماية من الحذف لعروض الأدمن العامة
    ))
        .limit(1);
    if (!existing)
        throw new NotFound_1.NotFound("Discount not found or cannot be deleted");
    await connection_1.db.delete(schema_1.discounts).where((0, drizzle_orm_1.eq)(schema_1.discounts.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Discount deleted successfully" });
};
exports.deleteDiscount = deleteDiscount;
// ==========================================
// 6. Toggle Discount Status (Protected)
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
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.discounts.id, id), (0, drizzle_orm_1.eq)(schema_1.discountRestaurants.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.discounts.isGlobal, false) // حماية لعدم تفعيل/تعطيل عروض الأدمن
    ))
        .limit(1);
    if (!rawData)
        throw new NotFound_1.NotFound("Discount not found or cannot be modified");
    const existingDiscount = rawData.discounts;
    await connection_1.db.update(schema_1.discounts)
        .set({ isActive: !existingDiscount.isActive, updatedAt: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.discounts.id, id));
    return (0, response_1.SuccessResponse)(res, {
        message: `Discount ${!existingDiscount.isActive ? "activated" : "deactivated"} successfully`,
        data: { isActive: !existingDiscount.isActive }
    });
};
exports.toggleDiscountStatus = toggleDiscountStatus;
