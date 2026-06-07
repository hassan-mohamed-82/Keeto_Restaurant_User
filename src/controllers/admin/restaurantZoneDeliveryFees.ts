import { Request, Response } from "express";
import { db } from "../../models/connection";
import { cities, restaurantZoneDeliveryFees, zones } from "../../models/schema"; // تأكد من مسار الـ schema
import { eq, and } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { NotFound } from "../../Errors/NotFound";
import { BadRequest } from "../../Errors/BadRequest";
import { v4 as uuidv4 } from "uuid";

// =============================================
// CREATE Delivery Fee
// =============================================
export const createDeliveryFee = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id
    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    const { zoneId, deliveryFee, status,cityId } = req.body;

    if (!zoneId || deliveryFee === undefined) {
        throw new BadRequest("Zone ID and Delivery Fee are required");
    }

    // 1. التأكد إن المنطقة (Zone) موجودة أصلاً
    const existingZone = await db.select().from(zones).where(eq(zones.id, zoneId)).limit(1);
    if (!existingZone[0]) throw new BadRequest("Zone not found");

    // 2. التأكد إن المطعم مش ضايف سعر لنفس المنطقة قبل كده
    const existingFee = await db
        .select()
        .from(restaurantZoneDeliveryFees)
        .where(
            and(
                eq(restaurantZoneDeliveryFees.restaurantId, restaurantId),
                eq(restaurantZoneDeliveryFees.zoneId, zoneId)
            )
        )
        .limit(1);

    if (existingFee[0]) {
        throw new BadRequest("Delivery fee for this zone already exists for your restaurant");
    }
    const existingCity = await db.select().from(cities).where(eq(cities.id, cityId)).limit(1);
    if (!existingCity[0]) throw new BadRequest("City not found");
    const feeId = uuidv4();

    await db.insert(restaurantZoneDeliveryFees).values({
        id: feeId,
        restaurantId, // ✅ إجبار إن الريكورد يتسجل باسم المطعم الحالي
        zoneId,
        cityId,
        deliveryFee: deliveryFee.toString(), // يفضل تحويلها لـ string عشان الـ decimal في Drizzle
        status: status || "active",
    });

    return SuccessResponse(res, { message: "Delivery fee created successfully", data: { id: feeId } }, 201);
};

// =============================================
// GET ALL Delivery Fees (For the Current Restaurant)
// =============================================
export const getDeliveryFees = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id
    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    const rawFees = await db.select({
        id: restaurantZoneDeliveryFees.id,
        deliveryFee: restaurantZoneDeliveryFees.deliveryFee,
        status: restaurantZoneDeliveryFees.status,
        createdAt: restaurantZoneDeliveryFees.createdAt,
        zone: {
            id: zones.id,
            name: zones.name, // بافتراض إن جدول الـ zones فيه حقل اسمه name
        },
        city: {
            id: cities.id,
            name: cities.name, // بافتراض إن جدول الـ cities فيه حقل اسمه name
        }
    })
    .from(restaurantZoneDeliveryFees)
    // ✅ ربطنا بجدول الـ zones عشان نجيب بيانات المنطقة
    .leftJoin(zones, eq(restaurantZoneDeliveryFees.zoneId, zones.id))
    .leftJoin(cities, eq(restaurantZoneDeliveryFees.cityId, cities.id))
    // ✅ فلترة: المطعم الحالي فقط
    .where(eq(restaurantZoneDeliveryFees.restaurantId, restaurantId));

    return SuccessResponse(res, {
        message: "Get delivery fees success",
        data: rawFees
    });
};

// =============================================
// GET Delivery Fee By ID
// =============================================
export const getDeliveryFeeById = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id
    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    const fee = await db.select({
        id: restaurantZoneDeliveryFees.id,
        deliveryFee: restaurantZoneDeliveryFees.deliveryFee,
        status: restaurantZoneDeliveryFees.status,
        createdAt: restaurantZoneDeliveryFees.createdAt,
        zone: {
            id: zones.id,
            name: zones.name, 
        },
        city: {
            id: cities.id,
            name: cities.name, 
        }
    })
    .from(restaurantZoneDeliveryFees)
    .leftJoin(zones, eq(restaurantZoneDeliveryFees.zoneId, zones.id))
    .leftJoin(cities, eq(restaurantZoneDeliveryFees.cityId, cities.id))
    .where(
        // ✅ حماية: لازم الـ ID بتاع التسعيرة يطابق، ويكون تابع للمطعم الحالي
        and(
            eq(restaurantZoneDeliveryFees.id, id),
            eq(restaurantZoneDeliveryFees.restaurantId, restaurantId)
        )
    )
    .limit(1);

    if (!fee[0]) throw new NotFound("Delivery fee not found or does not belong to your restaurant");

    return SuccessResponse(res, {
        message: "Get delivery fee by id success",
        data: fee[0]
    });
};

// =============================================
// UPDATE Delivery Fee
// =============================================
export const updateDeliveryFee = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { deliveryFee, status ,cityId,zoneId} = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    
    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    // ✅ التحقق من الملكية قبل التعديل باستخدام and
    const existingFee = await db
        .select()
        .from(restaurantZoneDeliveryFees)
        .where(
            and(
                eq(restaurantZoneDeliveryFees.id, id),
                eq(restaurantZoneDeliveryFees.restaurantId, restaurantId)
            )
        )
        .limit(1);

    if (!existingFee[0]) throw new NotFound("Delivery fee not found or you don't have permission to edit it");
    if (req.body.cityId) {
        const existingCity = await db.select().from(cities).where(eq(cities.id, req.body.cityId)).limit(1);
        if (!existingCity[0]) throw new BadRequest("City not found");
    }
    if (req.body.zoneId) {
        const existingZone = await db.select().from(zones).where(eq(zones.id, req.body.zoneId)).limit(1);
        if (!existingZone[0]) throw new BadRequest("Zone not found");
    }
    const updateData: any = {};
    if (deliveryFee !== undefined) updateData.deliveryFee = deliveryFee.toString();
    if (status !== undefined) updateData.status = status;
    if (cityId !== undefined) updateData.cityId = cityId;
    if (zoneId !== undefined) updateData.zoneId = zoneId;

    await db
        .update(restaurantZoneDeliveryFees)
        .set(updateData)
        .where(eq(restaurantZoneDeliveryFees.id, id));

    return SuccessResponse(res, { message: "Delivery fee updated successfully" });
};

// =============================================
// DELETE Delivery Fee
// =============================================
export const deleteDeliveryFee = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId =req.user?.restaurantId || req.user?.id;
    
    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    // ✅ التحقق من الملكية قبل الحذف باستخدام and
    const existingFee = await db
        .select()
        .from(restaurantZoneDeliveryFees)
        .where(
            and(
                eq(restaurantZoneDeliveryFees.id, id),
                eq(restaurantZoneDeliveryFees.restaurantId, restaurantId)
            )
        )
        .limit(1);

    if (!existingFee[0]) throw new NotFound("Delivery fee not found or you don't have permission to delete it");

    await db
        .delete(restaurantZoneDeliveryFees)
        .where(eq(restaurantZoneDeliveryFees.id, id));

    return SuccessResponse(res, { message: "Delivery fee deleted successfully" });
};




export const select = async (req: Request, res: Response) => {
    const zonesselect=await db.select().from(zones).where(eq(zones.status,"active"));
    const citiesselect=await db.select().from(cities).where(eq(cities.status,"active"));
  return SuccessResponse(res, {
        message: "Get delivery fees success",
        data: {zonesselect,citiesselect}
    });
};