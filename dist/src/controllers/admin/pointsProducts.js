"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removePointsProduct = exports.togglePointsProduct = exports.enrollPointsProducts = exports.getPointsProducts = exports.getFoodsForPointsSelect = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const NotFound_1 = require("../../Errors/NotFound");
const BadRequest_1 = require("../../Errors/BadRequest");
const uuid_1 = require("uuid");
const getRestaurantId = (req) => {
    const id = req.user?.restaurantId || req.user?.id;
    if (!id)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    return id;
};
const getFoodsForPointsSelect = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    // 1. All active foods for this restaurant
    const foods = await connection_1.db
        .select({
        id: schema_1.food.id,
        name: schema_1.food.name,
        nameAr: schema_1.food.nameAr,
        nameFr: schema_1.food.nameFr,
        image: schema_1.food.image,
        price: schema_1.food.price,
        points: schema_1.food.points, // ← the points value that already lives on food
        status: schema_1.food.status,
    })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), (0, drizzle_orm_1.eq)(schema_1.food.status, "active")));
    // 2. Which foods are already enrolled?
    const enrolled = await connection_1.db
        .select({
        foodId: schema_1.pointsProducts.foodId,
        id: schema_1.pointsProducts.id,
        isActive: schema_1.pointsProducts.isActive,
    })
        .from(schema_1.pointsProducts)
        .where((0, drizzle_orm_1.eq)(schema_1.pointsProducts.restaurantId, restaurantId));
    const enrolledMap = new Map(enrolled.map(p => [p.foodId, p]));
    const result = foods.map(f => ({
        ...f,
        inPointsProgram: enrolledMap.has(f.id),
        pointsProgramId: enrolledMap.get(f.id)?.id ?? null,
        pointsProgramActive: enrolledMap.get(f.id)?.isActive ?? null,
    }));
    return (0, response_1.SuccessResponse)(res, {
        message: "Foods available for points program",
        data: result,
    });
};
exports.getFoodsForPointsSelect = getFoodsForPointsSelect;
const getPointsProducts = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const rows = await connection_1.db
        .select({
        id: schema_1.pointsProducts.id,
        isActive: schema_1.pointsProducts.isActive,
        pointsRequiredForRedeem: schema_1.pointsProducts.pointsRequiredForRedeem, // ← from pointsProducts table
        createdAt: schema_1.pointsProducts.createdAt,
        updatedAt: schema_1.pointsProducts.updatedAt,
        // Food details (including its own points field)
        foodId: schema_1.food.id,
        foodName: schema_1.food.name,
        foodNameAr: schema_1.food.nameAr,
        foodNameFr: schema_1.food.nameFr,
        foodImage: schema_1.food.image,
        foodPrice: schema_1.food.price,
        foodPoints: schema_1.food.points,
        foodStatus: schema_1.food.status,
    })
        .from(schema_1.pointsProducts)
        .leftJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.pointsProducts.foodId, schema_1.food.id))
        .where((0, drizzle_orm_1.eq)(schema_1.pointsProducts.restaurantId, restaurantId));
    return (0, response_1.SuccessResponse)(res, {
        message: "Get points products success",
        data: rows.map(r => ({
            id: r.id,
            isActive: r.isActive,
            pointsRequiredForRedeem: r.pointsRequiredForRedeem ?? 0, // ← returned in response
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            food: {
                id: r.foodId,
                name: r.foodName,
                nameAr: r.foodNameAr,
                nameFr: r.foodNameFr,
                image: r.foodImage,
                price: r.foodPrice,
                points: r.foodPoints,
                status: r.foodStatus,
            },
        })),
    });
};
exports.getPointsProducts = getPointsProducts;
const enrollPointsProducts = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    // Body: { items: [{ foodId: string, pointsRequiredForRedeem: number }] }
    const items = req.body.items;
    if (!Array.isArray(items) || items.length === 0) {
        throw new BadRequest_1.BadRequest("Provide items as an array of { foodId, pointsRequiredForRedeem }");
    }
    // Build lookup maps from the items array
    const rawIds = items.map(i => i.foodId);
    const pointsLookup = new Map(items.map(i => [i.foodId, Number(i.pointsRequiredForRedeem) || 0]));
    // Validate all foods belong to this restaurant and have points set
    const existingFoods = await connection_1.db
        .select({ id: schema_1.food.id, points: schema_1.food.points, name: schema_1.food.name })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.food.id, rawIds), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)));
    if (existingFoods.length !== rawIds.length) {
        throw new BadRequest_1.BadRequest("One or more food items not found or don't belong to your restaurant");
    }
    // const withoutPoints = existingFoods.filter(f => (f.points ?? 0) <= 0);
    // if (withoutPoints.length > 0) {
    //     throw new BadRequest(
    //         `Set a points value on these foods first: ${withoutPoints.map(f => f.name).join(", ")}`
    //     );
    // }
    // Fetch already-enrolled entries for this restaurant
    const existingPP = await connection_1.db
        .select({ id: schema_1.pointsProducts.id, foodId: schema_1.pointsProducts.foodId })
        .from(schema_1.pointsProducts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.pointsProducts.restaurantId, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.pointsProducts.foodId, rawIds)));
    const existingMap = new Map(existingPP.map(p => [p.foodId, p.id]));
    const inserted = [];
    const reactivated = [];
    await connection_1.db.transaction(async (tx) => {
        for (const { foodId: fId } of items) {
            const pts = pointsLookup.get(fId) ?? 0;
            const existingId = existingMap.get(fId);
            if (existingId) {
                // Re-activate and update pointsRequiredForRedeem
                await tx
                    .update(schema_1.pointsProducts)
                    .set({ isActive: true, pointsRequiredForRedeem: pts })
                    .where((0, drizzle_orm_1.eq)(schema_1.pointsProducts.id, existingId));
                reactivated.push(fId);
            }
            else {
                // Fresh insert with pointsRequiredForRedeem
                await tx.insert(schema_1.pointsProducts).values({
                    id: (0, uuid_1.v4)(),
                    restaurantId,
                    foodId: fId,
                    isActive: true,
                    pointsRequiredForRedeem: pts,
                });
                inserted.push(fId);
            }
        }
    });
    return (0, response_1.SuccessResponse)(res, {
        message: `Points program updated: ${inserted.length} added, ${reactivated.length} re-activated`,
        data: { inserted, reactivated },
    });
};
exports.enrollPointsProducts = enrollPointsProducts;
const togglePointsProduct = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const { id } = req.params;
    const existing = await connection_1.db
        .select()
        .from(schema_1.pointsProducts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.pointsProducts.id, id), (0, drizzle_orm_1.eq)(schema_1.pointsProducts.restaurantId, restaurantId)))
        .limit(1);
    if (!existing[0])
        throw new NotFound_1.NotFound("Points product not found or does not belong to your restaurant");
    const newStatus = !existing[0].isActive;
    await connection_1.db.update(schema_1.pointsProducts).set({ isActive: newStatus }).where((0, drizzle_orm_1.eq)(schema_1.pointsProducts.id, id));
    return (0, response_1.SuccessResponse)(res, {
        message: `Points product ${newStatus ? "activated" : "deactivated"} successfully`,
        data: { isActive: newStatus },
    });
};
exports.togglePointsProduct = togglePointsProduct;
const removePointsProduct = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const { id } = req.params;
    const existing = await connection_1.db
        .select()
        .from(schema_1.pointsProducts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.pointsProducts.id, id), (0, drizzle_orm_1.eq)(schema_1.pointsProducts.restaurantId, restaurantId)))
        .limit(1);
    if (!existing[0])
        throw new NotFound_1.NotFound("Points product not found or does not belong to your restaurant");
    await connection_1.db.delete(schema_1.pointsProducts).where((0, drizzle_orm_1.eq)(schema_1.pointsProducts.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Food removed from points program successfully" });
};
exports.removePointsProduct = removePointsProduct;
