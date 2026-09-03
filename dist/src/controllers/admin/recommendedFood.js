"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllRecommendedFoods = exports.getFoodsForSelect = exports.removeRecommendedProduct = exports.getRecommendedProductsByFoodId = exports.assignRecommendedProducts = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const mysql_core_1 = require("drizzle-orm/mysql-core");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const NotFound_1 = require("../../Errors/NotFound");
const Errors_1 = require("../../Errors");
const uuid_1 = require("uuid");
const getAdminRestaurantId = (req) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Not authenticated");
    const restaurantId = req.user.restaurantId || req.user.id || req.user?.branchId;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID not found");
    return restaurantId;
};
// ==========================================
// 1. Assign / Update Recommended Products for a Food Item
// ==========================================
const assignRecommendedProducts = async (req, res) => {
    const restaurantId = getAdminRestaurantId(req);
    const { foodId, recommendedFoodIds } = req.body;
    if (!foodId) {
        throw new BadRequest_1.BadRequest("Basic foodId is required");
    }
    if (!Array.isArray(recommendedFoodIds)) {
        throw new BadRequest_1.BadRequest("recommendedFoodIds must be an array of food IDs");
    }
    // 1. Verify basic food exists and belongs to restaurant
    const [basicFood] = await connection_1.db
        .select()
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, foodId), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)))
        .limit(1);
    if (!basicFood) {
        throw new NotFound_1.NotFound("Basic food product not found or does not belong to your restaurant");
    }
    // 2. Filter out self-recommendation
    const cleanRecommendedIds = [...new Set(recommendedFoodIds)].filter(id => id && id !== foodId);
    // 3. Verify all recommended food items exist and belong to the same restaurant
    if (cleanRecommendedIds.length > 0) {
        const validFoods = await connection_1.db
            .select({ id: schema_1.food.id })
            .from(schema_1.food)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.food.id, cleanRecommendedIds)));
        if (validFoods.length !== cleanRecommendedIds.length) {
            throw new BadRequest_1.BadRequest("One or more recommended food IDs are invalid or do not belong to your restaurant");
        }
    }
    // 4. Update / Sync recommended products in a transaction
    await connection_1.db.transaction(async (tx) => {
        // Clear existing recommendations for this basic food
        await tx
            .delete(schema_1.recommendedFoods)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.recommendedFoods.foodId, foodId), (0, drizzle_orm_1.eq)(schema_1.recommendedFoods.restaurantId, restaurantId)));
        // Insert new recommendations if any
        if (cleanRecommendedIds.length > 0) {
            const recordsToInsert = cleanRecommendedIds.map((recFoodId, index) => ({
                id: (0, uuid_1.v4)(),
                restaurantId,
                foodId,
                recommendedFoodId: recFoodId,
                sortOrder: index + 1,
                status: "active",
            }));
            await tx.insert(schema_1.recommendedFoods).values(recordsToInsert);
        }
    });
    return (0, response_1.SuccessResponse)(res, {
        message: "Recommended products updated successfully",
        data: {
            foodId,
            recommendedCount: cleanRecommendedIds.length,
            recommendedFoodIds: cleanRecommendedIds,
        },
    });
};
exports.assignRecommendedProducts = assignRecommendedProducts;
// ==========================================
// 2. Get Recommended Products by Food ID (Admin)
// ==========================================
const getRecommendedProductsByFoodId = async (req, res) => {
    const restaurantId = getAdminRestaurantId(req);
    const { foodId } = req.params;
    if (!foodId) {
        throw new BadRequest_1.BadRequest("foodId is required");
    }
    // Verify basic food
    const [basicFood] = await connection_1.db
        .select({ id: schema_1.food.id, name: schema_1.food.name, nameAr: schema_1.food.nameAr, nameFr: schema_1.food.nameFr, image: schema_1.food.image })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, foodId), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)))
        .limit(1);
    if (!basicFood) {
        throw new NotFound_1.NotFound("Basic food product not found");
    }
    // Fetch recommended products
    const recommendations = await connection_1.db
        .select({
        recommendationId: schema_1.recommendedFoods.id,
        sortOrder: schema_1.recommendedFoods.sortOrder,
        status: schema_1.recommendedFoods.status,
        createdAt: schema_1.recommendedFoods.createdAt,
        food: {
            id: schema_1.food.id,
            name: schema_1.food.name,
            nameAr: schema_1.food.nameAr,
            nameFr: schema_1.food.nameFr,
            image: schema_1.food.image,
            price: schema_1.food.price,
            discountType: schema_1.food.discount_type,
            discountValue: schema_1.food.discount_value,
            isOutOfStock: schema_1.food.isOutOfStock,
            status: schema_1.food.status,
        },
    })
        .from(schema_1.recommendedFoods)
        .innerJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.recommendedFoods.recommendedFoodId, schema_1.food.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.recommendedFoods.foodId, foodId), (0, drizzle_orm_1.eq)(schema_1.recommendedFoods.restaurantId, restaurantId)))
        .orderBy((0, drizzle_orm_1.asc)(schema_1.recommendedFoods.sortOrder));
    return (0, response_1.SuccessResponse)(res, {
        message: "Recommended products fetched successfully",
        data: {
            basicFood,
            recommendations,
        },
    });
};
exports.getRecommendedProductsByFoodId = getRecommendedProductsByFoodId;
// ==========================================
// 3. Remove single Recommended Product (Admin)
// ==========================================
const removeRecommendedProduct = async (req, res) => {
    const restaurantId = getAdminRestaurantId(req);
    const { foodId, recommendedFoodId } = req.params;
    if (!foodId || !recommendedFoodId) {
        throw new BadRequest_1.BadRequest("Both foodId and recommendedFoodId are required");
    }
    await connection_1.db
        .delete(schema_1.recommendedFoods)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.recommendedFoods.foodId, foodId), (0, drizzle_orm_1.eq)(schema_1.recommendedFoods.recommendedFoodId, recommendedFoodId), (0, drizzle_orm_1.eq)(schema_1.recommendedFoods.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: "Recommended product removed successfully",
    });
};
exports.removeRecommendedProduct = removeRecommendedProduct;
// ==========================================
// 4. Get All Foods for Select Dropdown (id, names, image, price)
// ==========================================
const getFoodsForSelect = async (req, res) => {
    const restaurantId = getAdminRestaurantId(req);
    const foodsList = await connection_1.db
        .select({
        id: schema_1.food.id,
        name: schema_1.food.name,
        nameAr: schema_1.food.nameAr,
        nameFr: schema_1.food.nameFr,
        image: schema_1.food.image,
        price: schema_1.food.price,
        status: schema_1.food.status,
        isOutOfStock: schema_1.food.isOutOfStock,
    })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), (0, drizzle_orm_1.eq)(schema_1.food.status, "active")));
    return (0, response_1.SuccessResponse)(res, {
        message: "Get foods for select success",
        data: foodsList,
    });
};
exports.getFoodsForSelect = getFoodsForSelect;
// ==========================================
// 5. Get All Recommended Food Pairings (Basic Foods with their Recommended Foods)
// ==========================================
const getAllRecommendedFoods = async (req, res) => {
    const restaurantId = getAdminRestaurantId(req);
    const basicFood = (0, mysql_core_1.alias)(schema_1.food, "basic_food");
    const recFood = (0, mysql_core_1.alias)(schema_1.food, "rec_food");
    const rows = await connection_1.db
        .select({
        recommendationId: schema_1.recommendedFoods.id,
        sortOrder: schema_1.recommendedFoods.sortOrder,
        recommendationStatus: schema_1.recommendedFoods.status,
        basicFoodId: basicFood.id,
        basicFoodName: basicFood.name,
        basicFoodNameAr: basicFood.nameAr,
        basicFoodNameFr: basicFood.nameFr,
        basicFoodImage: basicFood.image,
        recFoodId: recFood.id,
        recFoodName: recFood.name,
        recFoodNameAr: recFood.nameAr,
        recFoodNameFr: recFood.nameFr,
        recFoodImage: recFood.image,
        recFoodPrice: recFood.price,
        recFoodDiscountType: recFood.discount_type,
        recFoodDiscountValue: recFood.discount_value,
        recFoodIsOutOfStock: recFood.isOutOfStock,
        recFoodStatus: recFood.status,
    })
        .from(schema_1.recommendedFoods)
        .innerJoin(basicFood, (0, drizzle_orm_1.eq)(schema_1.recommendedFoods.foodId, basicFood.id))
        .innerJoin(recFood, (0, drizzle_orm_1.eq)(schema_1.recommendedFoods.recommendedFoodId, recFood.id))
        .where((0, drizzle_orm_1.eq)(schema_1.recommendedFoods.restaurantId, restaurantId))
        .orderBy((0, drizzle_orm_1.asc)(schema_1.recommendedFoods.sortOrder));
    const groupedMap = new Map();
    for (const row of rows) {
        if (!groupedMap.has(row.basicFoodId)) {
            groupedMap.set(row.basicFoodId, {
                food: {
                    id: row.basicFoodId,
                    name: row.basicFoodName,
                    nameAr: row.basicFoodNameAr,
                    nameFr: row.basicFoodNameFr,
                    image: row.basicFoodImage,
                },
                recommendedFoods: [],
            });
        }
        groupedMap.get(row.basicFoodId).recommendedFoods.push({
            recommendationId: row.recommendationId,
            id: row.recFoodId,
            name: row.recFoodName,
            nameAr: row.recFoodNameAr,
            nameFr: row.recFoodNameFr,
            image: row.recFoodImage,
            price: row.recFoodPrice,
            discountType: row.recFoodDiscountType,
            discountValue: row.recFoodDiscountValue,
            isOutOfStock: row.recFoodIsOutOfStock,
            status: row.recFoodStatus,
            sortOrder: row.sortOrder,
            recommendationStatus: row.recommendationStatus,
        });
    }
    return (0, response_1.SuccessResponse)(res, {
        message: "Get all recommended foods success",
        data: Array.from(groupedMap.values()),
    });
};
exports.getAllRecommendedFoods = getAllRecommendedFoods;
