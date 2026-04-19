"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.select = exports.deleteDeliveryFee = exports.updateDeliveryFee = exports.getDeliveryFeeById = exports.getDeliveryFees = exports.createDeliveryFee = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema"); // تأكد من مسار الـ schema
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const NotFound_1 = require("../../Errors/NotFound");
const BadRequest_1 = require("../../Errors/BadRequest");
const uuid_1 = require("uuid");
// =============================================
// CREATE Delivery Fee
// =============================================
const createDeliveryFee = async (req, res) => {
    const restaurantId = req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const { zoneId, deliveryFee, status } = req.body;
    if (!zoneId || deliveryFee === undefined) {
        throw new BadRequest_1.BadRequest("Zone ID and Delivery Fee are required");
    }
    // 1. التأكد إن المنطقة (Zone) موجودة أصلاً
    const existingZone = await connection_1.db.select().from(schema_1.zones).where((0, drizzle_orm_1.eq)(schema_1.zones.id, zoneId)).limit(1);
    if (!existingZone[0])
        throw new BadRequest_1.BadRequest("Zone not found");
    // 2. التأكد إن المطعم مش ضايف سعر لنفس المنطقة قبل كده
    const existingFee = await connection_1.db
        .select()
        .from(schema_1.restaurantZoneDeliveryFees)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.zoneId, zoneId)))
        .limit(1);
    if (existingFee[0]) {
        throw new BadRequest_1.BadRequest("Delivery fee for this zone already exists for your restaurant");
    }
    const feeId = (0, uuid_1.v4)();
    await connection_1.db.insert(schema_1.restaurantZoneDeliveryFees).values({
        id: feeId,
        restaurantId, // ✅ إجبار إن الريكورد يتسجل باسم المطعم الحالي
        zoneId,
        deliveryFee: deliveryFee.toString(), // يفضل تحويلها لـ string عشان الـ decimal في Drizzle
        status: status || "active",
    });
    return (0, response_1.SuccessResponse)(res, { message: "Delivery fee created successfully", data: { id: feeId } }, 201);
};
exports.createDeliveryFee = createDeliveryFee;
// =============================================
// GET ALL Delivery Fees (For the Current Restaurant)
// =============================================
const getDeliveryFees = async (req, res) => {
    const restaurantId = req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const rawFees = await connection_1.db.select({
        id: schema_1.restaurantZoneDeliveryFees.id,
        deliveryFee: schema_1.restaurantZoneDeliveryFees.deliveryFee,
        status: schema_1.restaurantZoneDeliveryFees.status,
        createdAt: schema_1.restaurantZoneDeliveryFees.createdAt,
        zone: {
            id: schema_1.zones.id,
            name: schema_1.zones.name, // بافتراض إن جدول الـ zones فيه حقل اسمه name
        }
    })
        .from(schema_1.restaurantZoneDeliveryFees)
        // ✅ ربطنا بجدول الـ zones عشان نجيب بيانات المنطقة
        .leftJoin(schema_1.zones, (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.zoneId, schema_1.zones.id))
        // ✅ فلترة: المطعم الحالي فقط
        .where((0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.restaurantId, restaurantId));
    return (0, response_1.SuccessResponse)(res, {
        message: "Get delivery fees success",
        data: rawFees
    });
};
exports.getDeliveryFees = getDeliveryFees;
// =============================================
// GET Delivery Fee By ID
// =============================================
const getDeliveryFeeById = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const fee = await connection_1.db.select({
        id: schema_1.restaurantZoneDeliveryFees.id,
        deliveryFee: schema_1.restaurantZoneDeliveryFees.deliveryFee,
        status: schema_1.restaurantZoneDeliveryFees.status,
        createdAt: schema_1.restaurantZoneDeliveryFees.createdAt,
        zone: {
            id: schema_1.zones.id,
            name: schema_1.zones.name,
        }
    })
        .from(schema_1.restaurantZoneDeliveryFees)
        .leftJoin(schema_1.zones, (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.zoneId, schema_1.zones.id))
        .where(
    // ✅ حماية: لازم الـ ID بتاع التسعيرة يطابق، ويكون تابع للمطعم الحالي
    (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.id, id), (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.restaurantId, restaurantId)))
        .limit(1);
    if (!fee[0])
        throw new NotFound_1.NotFound("Delivery fee not found or does not belong to your restaurant");
    return (0, response_1.SuccessResponse)(res, {
        message: "Get delivery fee by id success",
        data: fee[0]
    });
};
exports.getDeliveryFeeById = getDeliveryFeeById;
// =============================================
// UPDATE Delivery Fee
// =============================================
const updateDeliveryFee = async (req, res) => {
    const { id } = req.params;
    const { deliveryFee, status } = req.body;
    const restaurantId = req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    // ✅ التحقق من الملكية قبل التعديل باستخدام and
    const existingFee = await connection_1.db
        .select()
        .from(schema_1.restaurantZoneDeliveryFees)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.id, id), (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.restaurantId, restaurantId)))
        .limit(1);
    if (!existingFee[0])
        throw new NotFound_1.NotFound("Delivery fee not found or you don't have permission to edit it");
    const updateData = {};
    if (deliveryFee !== undefined)
        updateData.deliveryFee = deliveryFee.toString();
    if (status !== undefined)
        updateData.status = status;
    await connection_1.db
        .update(schema_1.restaurantZoneDeliveryFees)
        .set(updateData)
        .where((0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Delivery fee updated successfully" });
};
exports.updateDeliveryFee = updateDeliveryFee;
// =============================================
// DELETE Delivery Fee
// =============================================
const deleteDeliveryFee = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    // ✅ التحقق من الملكية قبل الحذف باستخدام and
    const existingFee = await connection_1.db
        .select()
        .from(schema_1.restaurantZoneDeliveryFees)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.id, id), (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.restaurantId, restaurantId)))
        .limit(1);
    if (!existingFee[0])
        throw new NotFound_1.NotFound("Delivery fee not found or you don't have permission to delete it");
    await connection_1.db
        .delete(schema_1.restaurantZoneDeliveryFees)
        .where((0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Delivery fee deleted successfully" });
};
exports.deleteDeliveryFee = deleteDeliveryFee;
const select = async (req, res) => {
    const zonesselect = await connection_1.db.select().from(schema_1.zones).where((0, drizzle_orm_1.eq)(schema_1.zones.status, "active"));
    return (0, response_1.SuccessResponse)(res, {
        message: "Get delivery fees success",
        data: zonesselect
    });
};
exports.select = select;
