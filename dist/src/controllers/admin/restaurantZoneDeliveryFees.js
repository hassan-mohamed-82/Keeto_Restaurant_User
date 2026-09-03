"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.select = exports.deleteDeliveryFee = exports.updateDeliveryFee = exports.getDeliveryFeeById = exports.getDeliveryFees = exports.createDeliveryFee = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const NotFound_1 = require("../../Errors/NotFound");
const BadRequest_1 = require("../../Errors/BadRequest");
const uuid_1 = require("uuid");
// =============================================
// CREATE Delivery Fee (Restaurant Zone Setting)
// =============================================
const createDeliveryFee = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const { zoneId, cityId, branchId, coverageType, customCoordinates, customRadiusKm, deliveryFee, minOrderAmount, status, } = req.body;
    const targetBranchId = branchId || req.user?.branchId || null;
    if (!zoneId || !cityId) {
        throw new BadRequest_1.BadRequest("Zone ID and City ID are required");
    }
    // 1. التأكد من وجود الزون وجلب بياناتها الافتراضية
    const existingZone = await connection_1.db.select().from(schema_1.zones).where((0, drizzle_orm_1.eq)(schema_1.zones.id, zoneId)).limit(1);
    if (!existingZone[0])
        throw new BadRequest_1.BadRequest("Zone not found");
    // 2. التأكد من وجود المدينة
    const existingCity = await connection_1.db.select().from(schema_1.cities).where((0, drizzle_orm_1.eq)(schema_1.cities.id, cityId)).limit(1);
    if (!existingCity[0])
        throw new BadRequest_1.BadRequest("City not found");
    // 3. التأكد من وجود الفرع إذا تم تمريره
    if (targetBranchId) {
        const existingBranch = await connection_1.db
            .select()
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.id, targetBranchId), (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId)))
            .limit(1);
        if (!existingBranch[0])
            throw new BadRequest_1.BadRequest("Branch not found or does not belong to your restaurant");
    }
    // 4. التأكد إن المطعم لم يقم بإضافة تسعيرة لهذه الزون والفرع مسبقاً
    const duplicateConditions = [
        (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.restaurantId, restaurantId),
        (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.zoneId, zoneId),
    ];
    if (targetBranchId) {
        duplicateConditions.push((0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.branchId, targetBranchId));
    }
    else {
        duplicateConditions.push((0, drizzle_orm_1.isNull)(schema_1.restaurantZoneDeliveryFees.branchId));
    }
    const existingFee = await connection_1.db
        .select()
        .from(schema_1.restaurantZoneDeliveryFees)
        .where((0, drizzle_orm_1.and)(...duplicateConditions))
        .limit(1);
    if (existingFee[0]) {
        throw new BadRequest_1.BadRequest(targetBranchId
            ? "Delivery fee for this zone and branch already exists"
            : "Delivery fee for this zone already exists for your restaurant");
    }
    const feeId = (0, uuid_1.v4)();
    // إذا لم يرسل المطعم بيانات مخصصة، يأخذ القيم الافتراضية المحددة من السوبر أدمن
    const finalCoordinates = customCoordinates !== undefined ? customCoordinates : existingZone[0].coordinates;
    const finalRadius = customRadiusKm !== undefined ? customRadiusKm : existingZone[0].coverageAreaRadiusKm;
    const finalDeliveryFee = deliveryFee !== undefined ? deliveryFee : existingZone[0].deliveryFee;
    const finalMinOrderAmount = minOrderAmount !== undefined ? minOrderAmount : existingZone[0].minOrderAmount;
    await connection_1.db.insert(schema_1.restaurantZoneDeliveryFees).values({
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
    return (0, response_1.SuccessResponse)(res, { message: "Delivery fee created successfully", data: { id: feeId } }, 201);
};
exports.createDeliveryFee = createDeliveryFee;
// =============================================
// GET ALL Delivery Fees (For Current Restaurant)
// =============================================
const getDeliveryFees = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const adminBranchId = req.user?.branchId;
    const queryBranchId = req.query.branchId;
    const filterBranchId = adminBranchId || queryBranchId;
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.restaurantId, restaurantId)];
    if (filterBranchId) {
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.branchId, filterBranchId), (0, drizzle_orm_1.isNull)(schema_1.restaurantZoneDeliveryFees.branchId)));
    }
    const rawFees = await connection_1.db
        .select({
        id: schema_1.restaurantZoneDeliveryFees.id,
        branchId: schema_1.restaurantZoneDeliveryFees.branchId,
        coverageType: schema_1.restaurantZoneDeliveryFees.coverageType,
        customCoordinates: schema_1.restaurantZoneDeliveryFees.customCoordinates,
        customRadiusKm: schema_1.restaurantZoneDeliveryFees.customRadiusKm,
        deliveryFee: schema_1.restaurantZoneDeliveryFees.deliveryFee,
        minOrderAmount: schema_1.restaurantZoneDeliveryFees.minOrderAmount,
        status: schema_1.restaurantZoneDeliveryFees.status,
        createdAt: schema_1.restaurantZoneDeliveryFees.createdAt,
        updatedAt: schema_1.restaurantZoneDeliveryFees.updatedAt,
        branch: {
            id: schema_1.branches.id,
            name: schema_1.branches.name,
            nameAr: schema_1.branches.nameAr,
            nameFr: schema_1.branches.nameFr,
        },
        zone: {
            id: schema_1.zones.id,
            name: schema_1.zones.name,
            nameAr: schema_1.zones.nameAr,
            displayName: schema_1.zones.displayName,
            displayNameAr: schema_1.zones.displayNameAr,
            defaultCoordinates: schema_1.zones.coordinates,
            defaultRadiusKm: schema_1.zones.coverageAreaRadiusKm,
        },
        city: {
            id: schema_1.cities.id,
            name: schema_1.cities.name,
            nameAr: schema_1.cities.nameAr,
        },
    })
        .from(schema_1.restaurantZoneDeliveryFees)
        .leftJoin(schema_1.zones, (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.zoneId, schema_1.zones.id))
        .leftJoin(schema_1.cities, (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.cityId, schema_1.cities.id))
        .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.branchId, schema_1.branches.id))
        .where((0, drizzle_orm_1.and)(...conditions));
    const processedFees = rawFees.map((fee) => {
        if (fee.zone) {
            let parsedCoordinates = fee.zone.defaultCoordinates;
            if (typeof parsedCoordinates === "string") {
                try {
                    parsedCoordinates = JSON.parse(parsedCoordinates);
                }
                catch (error) {
                    console.error(`Error parsing coordinates for zone ${fee.zone.id}:`, error);
                }
            }
            fee.zone.defaultCoordinates = parsedCoordinates;
        }
        let parsedCustomCoordinates = fee.customCoordinates;
        if (typeof parsedCustomCoordinates === "string") {
            try {
                parsedCustomCoordinates = JSON.parse(parsedCustomCoordinates);
            }
            catch (error) {
                console.error(`Error parsing custom coordinates for fee ${fee.id}:`, error);
            }
        }
        fee.customCoordinates = parsedCustomCoordinates;
        return fee;
    });
    return (0, response_1.SuccessResponse)(res, {
        message: "Get delivery fees success",
        data: processedFees,
    });
};
exports.getDeliveryFees = getDeliveryFees;
// =============================================
// GET Delivery Fee By ID
// =============================================
const getDeliveryFeeById = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const fee = await connection_1.db
        .select({
        id: schema_1.restaurantZoneDeliveryFees.id,
        branchId: schema_1.restaurantZoneDeliveryFees.branchId,
        coverageType: schema_1.restaurantZoneDeliveryFees.coverageType,
        customCoordinates: schema_1.restaurantZoneDeliveryFees.customCoordinates,
        customRadiusKm: schema_1.restaurantZoneDeliveryFees.customRadiusKm,
        deliveryFee: schema_1.restaurantZoneDeliveryFees.deliveryFee,
        minOrderAmount: schema_1.restaurantZoneDeliveryFees.minOrderAmount,
        status: schema_1.restaurantZoneDeliveryFees.status,
        createdAt: schema_1.restaurantZoneDeliveryFees.createdAt,
        updatedAt: schema_1.restaurantZoneDeliveryFees.updatedAt,
        branch: {
            id: schema_1.branches.id,
            name: schema_1.branches.name,
            nameAr: schema_1.branches.nameAr,
            nameFr: schema_1.branches.nameFr,
        },
        zone: {
            id: schema_1.zones.id,
            name: schema_1.zones.name,
            nameAr: schema_1.zones.nameAr,
            displayName: schema_1.zones.displayName,
            displayNameAr: schema_1.zones.displayNameAr,
            defaultCoordinates: schema_1.zones.coordinates,
            defaultRadiusKm: schema_1.zones.coverageAreaRadiusKm,
        },
        city: {
            id: schema_1.cities.id,
            name: schema_1.cities.name,
            nameAr: schema_1.cities.nameAr,
        },
    })
        .from(schema_1.restaurantZoneDeliveryFees)
        .leftJoin(schema_1.zones, (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.zoneId, schema_1.zones.id))
        .leftJoin(schema_1.cities, (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.cityId, schema_1.cities.id))
        .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.branchId, schema_1.branches.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.id, id), (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.restaurantId, restaurantId)))
        .limit(1);
    if (!fee[0])
        throw new NotFound_1.NotFound("Delivery fee not found or does not belong to your restaurant");
    if (req.user?.branchId && fee[0].branchId && fee[0].branchId !== req.user.branchId) {
        throw new BadRequest_1.BadRequest("Unauthorized: Delivery fee does not belong to your branch");
    }
    const resultFee = fee[0];
    if (resultFee.zone) {
        let parsedCoordinates = resultFee.zone.defaultCoordinates;
        if (typeof parsedCoordinates === "string") {
            try {
                parsedCoordinates = JSON.parse(parsedCoordinates);
            }
            catch (error) {
                console.error(`Error parsing coordinates for zone ${resultFee.zone.id}:`, error);
            }
        }
        resultFee.zone.defaultCoordinates = parsedCoordinates;
    }
    let parsedCustomCoordinates = resultFee.customCoordinates;
    if (typeof parsedCustomCoordinates === "string") {
        try {
            parsedCustomCoordinates = JSON.parse(parsedCustomCoordinates);
        }
        catch (error) {
            console.error(`Error parsing custom coordinates for fee ${resultFee.id}:`, error);
        }
    }
    resultFee.customCoordinates = parsedCustomCoordinates;
    return (0, response_1.SuccessResponse)(res, {
        message: "Get delivery fee by id success",
        data: resultFee,
    });
};
exports.getDeliveryFeeById = getDeliveryFeeById;
// =============================================
// UPDATE Delivery Fee
// =============================================
const updateDeliveryFee = async (req, res) => {
    const { id } = req.params;
    const { deliveryFee, minOrderAmount, coverageType, customCoordinates, customRadiusKm, status, cityId, zoneId, branchId, } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const existingFee = await connection_1.db
        .select()
        .from(schema_1.restaurantZoneDeliveryFees)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.id, id), (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.restaurantId, restaurantId)))
        .limit(1);
    if (!existingFee[0])
        throw new NotFound_1.NotFound("Delivery fee not found or you don't have permission to edit it");
    if (req.user?.branchId && existingFee[0].branchId && existingFee[0].branchId !== req.user.branchId) {
        throw new BadRequest_1.BadRequest("Unauthorized: Delivery fee does not belong to your branch");
    }
    if (cityId) {
        const existingCity = await connection_1.db.select().from(schema_1.cities).where((0, drizzle_orm_1.eq)(schema_1.cities.id, cityId)).limit(1);
        if (!existingCity[0])
            throw new BadRequest_1.BadRequest("City not found");
    }
    if (zoneId) {
        const existingZone = await connection_1.db.select().from(schema_1.zones).where((0, drizzle_orm_1.eq)(schema_1.zones.id, zoneId)).limit(1);
        if (!existingZone[0])
            throw new BadRequest_1.BadRequest("Zone not found");
    }
    if (branchId) {
        const existingBranch = await connection_1.db
            .select()
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.id, branchId), (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId)))
            .limit(1);
        if (!existingBranch[0])
            throw new BadRequest_1.BadRequest("Branch not found or does not belong to your restaurant");
    }
    const updateData = {
        updatedAt: new Date(),
    };
    if (deliveryFee !== undefined)
        updateData.deliveryFee = String(deliveryFee);
    if (minOrderAmount !== undefined)
        updateData.minOrderAmount = String(minOrderAmount);
    if (coverageType !== undefined)
        updateData.coverageType = coverageType;
    if (customCoordinates !== undefined)
        updateData.customCoordinates = customCoordinates;
    if (customRadiusKm !== undefined)
        updateData.customRadiusKm = customRadiusKm ? String(customRadiusKm) : null;
    if (status !== undefined)
        updateData.status = status;
    if (cityId !== undefined)
        updateData.cityId = cityId;
    if (zoneId !== undefined)
        updateData.zoneId = zoneId;
    if (branchId !== undefined)
        updateData.branchId = branchId || null;
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
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const existingFee = await connection_1.db
        .select()
        .from(schema_1.restaurantZoneDeliveryFees)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.id, id), (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.restaurantId, restaurantId)))
        .limit(1);
    if (!existingFee[0])
        throw new NotFound_1.NotFound("Delivery fee not found or you don't have permission to delete it");
    if (req.user?.branchId && existingFee[0].branchId && existingFee[0].branchId !== req.user.branchId) {
        throw new BadRequest_1.BadRequest("Unauthorized: Delivery fee does not belong to your branch");
    }
    await connection_1.db
        .delete(schema_1.restaurantZoneDeliveryFees)
        .where((0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Delivery fee deleted successfully" });
};
exports.deleteDeliveryFee = deleteDeliveryFee;
// =============================================
// SELECT Active Zones, Cities, and Branches
// =============================================
const select = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const rawZones = await connection_1.db.select().from(schema_1.zones).where((0, drizzle_orm_1.eq)(schema_1.zones.status, "active"));
    const citiesselect = await connection_1.db.select().from(schema_1.cities).where((0, drizzle_orm_1.eq)(schema_1.cities.status, "active"));
    let branchesselect = [];
    if (restaurantId) {
        branchesselect = await connection_1.db
            .select({ id: schema_1.branches.id, name: schema_1.branches.name })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.branches.status, "active")));
    }
    const zonesselect = rawZones.map((zone) => {
        let parsedCoordinates = zone.coordinates;
        if (typeof parsedCoordinates === "string") {
            try {
                parsedCoordinates = JSON.parse(parsedCoordinates);
            }
            catch (error) {
                console.error(`Error parsing coordinates for zone ${zone.id}:`, error);
            }
        }
        return {
            ...zone,
            coordinates: parsedCoordinates
        };
    });
    return (0, response_1.SuccessResponse)(res, {
        message: "Get delivery fees select data success",
        data: { zonesselect, citiesselect, branchesselect },
    });
};
exports.select = select;
