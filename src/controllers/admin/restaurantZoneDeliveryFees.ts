import { Request, Response } from "express";
import { db } from "../../models/connection";
import { cities, restaurantZoneDeliveryFees, zones, branches } from "../../models/schema";
import { eq, and, or, isNull } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { NotFound } from "../../Errors/NotFound";
import { BadRequest } from "../../Errors/BadRequest";
import { v4 as uuidv4 } from "uuid";

// =============================================
// CREATE Delivery Fee (Restaurant Zone Setting)
// =============================================
export const createDeliveryFee = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    const {
        zoneId,
        cityId,
        branchId,
        coverageType,
        customCoordinates,
        customRadiusKm,
        deliveryFee,
        minOrderAmount,
        status,
    } = req.body;

    const targetBranchId = branchId || req.user?.branchId || null;

    if (!zoneId || !cityId) {
        throw new BadRequest("Zone ID and City ID are required");
    }

    // 1. التأكد من وجود الزون وجلب بياناتها الافتراضية
    const existingZone = await db.select().from(zones).where(eq(zones.id, zoneId)).limit(1);
    if (!existingZone[0]) throw new BadRequest("Zone not found");

    // 2. التأكد من وجود المدينة
    const existingCity = await db.select().from(cities).where(eq(cities.id, cityId)).limit(1);
    if (!existingCity[0]) throw new BadRequest("City not found");

    // 3. التأكد من وجود الفرع إذا تم تمريره
    if (targetBranchId) {
        const existingBranch = await db
            .select()
            .from(branches)
            .where(
                and(
                    eq(branches.id, targetBranchId),
                    eq(branches.restaurantId, restaurantId)
                )
            )
            .limit(1);
        if (!existingBranch[0]) throw new BadRequest("Branch not found or does not belong to your restaurant");
    }

    // 4. التأكد إن المطعم لم يقم بإضافة تسعيرة لهذه الزون والفرع مسبقاً
    const duplicateConditions: any[] = [
        eq(restaurantZoneDeliveryFees.restaurantId, restaurantId),
        eq(restaurantZoneDeliveryFees.zoneId, zoneId),
    ];
    if (targetBranchId) {
        duplicateConditions.push(eq(restaurantZoneDeliveryFees.branchId, targetBranchId));
    } else {
        duplicateConditions.push(isNull(restaurantZoneDeliveryFees.branchId));
    }

    const existingFee = await db
        .select()
        .from(restaurantZoneDeliveryFees)
        .where(and(...duplicateConditions))
        .limit(1);

    if (existingFee[0]) {
        throw new BadRequest(
            targetBranchId
                ? "Delivery fee for this zone and branch already exists"
                : "Delivery fee for this zone already exists for your restaurant"
        );
    }

    const feeId = uuidv4();

    // إذا لم يرسل المطعم بيانات مخصصة، يأخذ القيم الافتراضية المحددة من السوبر أدمن
    const finalCoordinates = customCoordinates !== undefined ? customCoordinates : existingZone[0].coordinates;
    const finalRadius = customRadiusKm !== undefined ? customRadiusKm : existingZone[0].coverageAreaRadiusKm;
    const finalDeliveryFee = deliveryFee !== undefined ? deliveryFee : existingZone[0].deliveryFee;
    const finalMinOrderAmount = minOrderAmount !== undefined ? minOrderAmount : existingZone[0].minOrderAmount;

    await db.insert(restaurantZoneDeliveryFees).values({
        id: feeId,
        restaurantId,
        branchId: targetBranchId || null,
        zoneId,
        cityId,
        coverageType: coverageType || "POLYGON",
        customCoordinates: finalCoordinates || null,
        customRadiusKm: finalRadius ? String(finalRadius) : null,
        deliveryFee: String(finalDeliveryFee || "0.00"),
        minOrderAmount: String(finalMinOrderAmount || "0.00"),
        status: status || "active",
    });

    return SuccessResponse(res, { message: "Delivery fee created successfully", data: { id: feeId } }, 201);
};

// =============================================
// GET ALL Delivery Fees (For Current Restaurant)
// =============================================
export const getDeliveryFees = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    const adminBranchId = req.user?.branchId;
    const queryBranchId = req.query.branchId as string | undefined;
    const filterBranchId = adminBranchId || queryBranchId;

    const conditions: any[] = [eq(restaurantZoneDeliveryFees.restaurantId, restaurantId)];

    if (filterBranchId) {
        conditions.push(
            or(
                eq(restaurantZoneDeliveryFees.branchId, filterBranchId),
                isNull(restaurantZoneDeliveryFees.branchId)
            )
        );
    }

    const rawFees = await db
        .select({
            id: restaurantZoneDeliveryFees.id,
            branchId: restaurantZoneDeliveryFees.branchId,
            coverageType: restaurantZoneDeliveryFees.coverageType,
            customCoordinates: restaurantZoneDeliveryFees.customCoordinates,
            customRadiusKm: restaurantZoneDeliveryFees.customRadiusKm,
            deliveryFee: restaurantZoneDeliveryFees.deliveryFee,
            minOrderAmount: restaurantZoneDeliveryFees.minOrderAmount,
            status: restaurantZoneDeliveryFees.status,
            createdAt: restaurantZoneDeliveryFees.createdAt,
            updatedAt: restaurantZoneDeliveryFees.updatedAt,
            branch: {
                id: branches.id,
                name: branches.name,
                nameAr: branches.nameAr,
                nameFr: branches.nameFr,
            },
            zone: {
                id: zones.id,
                name: zones.name,
                nameAr: zones.nameAr,
                displayName: zones.displayName,
                displayNameAr: zones.displayNameAr,
                defaultCoordinates: zones.coordinates,
                defaultRadiusKm: zones.coverageAreaRadiusKm,
            },
            city: {
                id: cities.id,
                name: cities.name,
                nameAr: cities.nameAr,
            },
        })
        .from(restaurantZoneDeliveryFees)
        .leftJoin(zones, eq(restaurantZoneDeliveryFees.zoneId, zones.id))
        .leftJoin(cities, eq(restaurantZoneDeliveryFees.cityId, cities.id))
        .leftJoin(branches, eq(restaurantZoneDeliveryFees.branchId, branches.id))
        .where(and(...conditions));

    const processedFees = rawFees.map((fee) => {
        if (fee.zone) {
            let parsedCoordinates = fee.zone.defaultCoordinates;
            if (typeof parsedCoordinates === "string") {
                try {
                    parsedCoordinates = JSON.parse(parsedCoordinates);
                } catch (error) {
                    console.error(`Error parsing coordinates for zone ${fee.zone.id}:`, error);
                }
            }
            fee.zone.defaultCoordinates = parsedCoordinates;
        }

        let parsedCustomCoordinates = fee.customCoordinates;
        if (typeof parsedCustomCoordinates === "string") {
            try {
                parsedCustomCoordinates = JSON.parse(parsedCustomCoordinates);
            } catch (error) {
                console.error(`Error parsing custom coordinates for fee ${fee.id}:`, error);
            }
        }
        fee.customCoordinates = parsedCustomCoordinates as any;

        return fee;
    });

    return SuccessResponse(res, {
        message: "Get delivery fees success",
        data: processedFees,
    });
};

// =============================================
// GET Delivery Fee By ID
// =============================================
export const getDeliveryFeeById = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    const fee = await db
        .select({
            id: restaurantZoneDeliveryFees.id,
            branchId: restaurantZoneDeliveryFees.branchId,
            coverageType: restaurantZoneDeliveryFees.coverageType,
            customCoordinates: restaurantZoneDeliveryFees.customCoordinates,
            customRadiusKm: restaurantZoneDeliveryFees.customRadiusKm,
            deliveryFee: restaurantZoneDeliveryFees.deliveryFee,
            minOrderAmount: restaurantZoneDeliveryFees.minOrderAmount,
            status: restaurantZoneDeliveryFees.status,
            createdAt: restaurantZoneDeliveryFees.createdAt,
            updatedAt: restaurantZoneDeliveryFees.updatedAt,
            branch: {
                id: branches.id,
                name: branches.name,
                nameAr: branches.nameAr,
                nameFr: branches.nameFr,
            },
            zone: {
                id: zones.id,
                name: zones.name,
                nameAr: zones.nameAr,
                displayName: zones.displayName,
                displayNameAr: zones.displayNameAr,
                defaultCoordinates: zones.coordinates,
                defaultRadiusKm: zones.coverageAreaRadiusKm,
            },
            city: {
                id: cities.id,
                name: cities.name,
                nameAr: cities.nameAr,
            },
        })
        .from(restaurantZoneDeliveryFees)
        .leftJoin(zones, eq(restaurantZoneDeliveryFees.zoneId, zones.id))
        .leftJoin(cities, eq(restaurantZoneDeliveryFees.cityId, cities.id))
        .leftJoin(branches, eq(restaurantZoneDeliveryFees.branchId, branches.id))
        .where(
            and(
                eq(restaurantZoneDeliveryFees.id, id),
                eq(restaurantZoneDeliveryFees.restaurantId, restaurantId)
            )
        )
        .limit(1);

    if (!fee[0]) throw new NotFound("Delivery fee not found or does not belong to your restaurant");

    if (req.user?.branchId && fee[0].branchId && fee[0].branchId !== req.user.branchId) {
        throw new BadRequest("Unauthorized: Delivery fee does not belong to your branch");
    }

    const resultFee = fee[0];
    if (resultFee.zone) {
        let parsedCoordinates = resultFee.zone.defaultCoordinates;
        if (typeof parsedCoordinates === "string") {
            try {
                parsedCoordinates = JSON.parse(parsedCoordinates);
            } catch (error) {
                console.error(`Error parsing coordinates for zone ${resultFee.zone.id}:`, error);
            }
        }
        resultFee.zone.defaultCoordinates = parsedCoordinates;
    }

    let parsedCustomCoordinates = resultFee.customCoordinates;
    if (typeof parsedCustomCoordinates === "string") {
        try {
            parsedCustomCoordinates = JSON.parse(parsedCustomCoordinates);
        } catch (error) {
            console.error(`Error parsing custom coordinates for fee ${resultFee.id}:`, error);
        }
    }
    resultFee.customCoordinates = parsedCustomCoordinates as any;

    return SuccessResponse(res, {
        message: "Get delivery fee by id success",
        data: resultFee,
    });
};

// =============================================
// UPDATE Delivery Fee
// =============================================
export const updateDeliveryFee = async (req: Request, res: Response) => {
    const { id } = req.params;
    const {
        deliveryFee,
        minOrderAmount,
        coverageType,
        customCoordinates,
        customRadiusKm,
        status,
        cityId,
        zoneId,
        branchId,
    } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

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

    if (req.user?.branchId && existingFee[0].branchId && existingFee[0].branchId !== req.user.branchId) {
        throw new BadRequest("Unauthorized: Delivery fee does not belong to your branch");
    }

    if (cityId) {
        const existingCity = await db.select().from(cities).where(eq(cities.id, cityId)).limit(1);
        if (!existingCity[0]) throw new BadRequest("City not found");
    }

    if (zoneId) {
        const existingZone = await db.select().from(zones).where(eq(zones.id, zoneId)).limit(1);
        if (!existingZone[0]) throw new BadRequest("Zone not found");
    }

    if (branchId) {
        const existingBranch = await db
            .select()
            .from(branches)
            .where(and(eq(branches.id, branchId), eq(branches.restaurantId, restaurantId)))
            .limit(1);
        if (!existingBranch[0]) throw new BadRequest("Branch not found or does not belong to your restaurant");
    }

    const updateData: any = {
        updatedAt: new Date(),
    };

    if (deliveryFee !== undefined) updateData.deliveryFee = String(deliveryFee);
    if (minOrderAmount !== undefined) updateData.minOrderAmount = String(minOrderAmount);
    if (coverageType !== undefined) updateData.coverageType = coverageType;
    if (customCoordinates !== undefined) updateData.customCoordinates = customCoordinates;
    if (customRadiusKm !== undefined) updateData.customRadiusKm = customRadiusKm ? String(customRadiusKm) : null;
    if (status !== undefined) updateData.status = status;
    if (cityId !== undefined) updateData.cityId = cityId;
    if (zoneId !== undefined) updateData.zoneId = zoneId;
    if (branchId !== undefined) updateData.branchId = branchId || null;

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
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

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

    if (req.user?.branchId && existingFee[0].branchId && existingFee[0].branchId !== req.user.branchId) {
        throw new BadRequest("Unauthorized: Delivery fee does not belong to your branch");
    }

    await db
        .delete(restaurantZoneDeliveryFees)
        .where(eq(restaurantZoneDeliveryFees.id, id));

    return SuccessResponse(res, { message: "Delivery fee deleted successfully" });
};

// =============================================
// SELECT Active Zones, Cities, and Branches
// =============================================
export const select = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;

    const rawZones = await db.select().from(zones).where(eq(zones.status, "active"));
    const citiesselect = await db.select().from(cities).where(eq(cities.status, "active"));

    let branchesselect: any[] = [];
    if (restaurantId) {
        branchesselect = await db
            .select({ id: branches.id, name: branches.name })
            .from(branches)
            .where(
                and(
                    eq(branches.restaurantId, restaurantId),
                    eq(branches.status, "active")
                )
            );
    }

    const zonesselect = rawZones.map((zone) => {
        let parsedCoordinates = zone.coordinates;
        if (typeof parsedCoordinates === "string") {
            try {
                parsedCoordinates = JSON.parse(parsedCoordinates);
            } catch (error) {
                console.error(`Error parsing coordinates for zone ${zone.id}:`, error);
            }
        }
        return {
            ...zone,
            coordinates: parsedCoordinates
        };
    });

    return SuccessResponse(res, {
        message: "Get delivery fees select data success",
        data: { zonesselect, citiesselect, branchesselect },
    });
};