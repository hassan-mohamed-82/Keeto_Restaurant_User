import { Request, Response } from "express";
import { db } from "../../models/connection";
import { food, recommendedFoods } from "../../models/schema";
import { eq, and, inArray, asc } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { UnauthorizedError } from "../../Errors";
import { v4 as uuidv4 } from "uuid";

const getAdminRestaurantId = (req: Request): string => {
    if (!req.user) throw new UnauthorizedError("Not authenticated");
    const restaurantId = req.user.restaurantId || req.user.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID not found");
    return restaurantId;
};

// ==========================================
// 1. Assign / Update Recommended Products for a Food Item
// ==========================================
export const assignRecommendedProducts = async (req: Request, res: Response) => {
    const restaurantId = getAdminRestaurantId(req);
    const { foodId, recommendedFoodIds } = req.body;

    if (!foodId) {
        throw new BadRequest("Basic foodId is required");
    }

    if (!Array.isArray(recommendedFoodIds)) {
        throw new BadRequest("recommendedFoodIds must be an array of food IDs");
    }

    // 1. Verify basic food exists and belongs to restaurant
    const [basicFood] = await db
        .select()
        .from(food)
        .where(and(eq(food.id, foodId), eq(food.restaurantid, restaurantId)))
        .limit(1);

    if (!basicFood) {
        throw new NotFound("Basic food product not found or does not belong to your restaurant");
    }

    // 2. Filter out self-recommendation
    const cleanRecommendedIds = [...new Set(recommendedFoodIds)].filter(id => id && id !== foodId);

    // 3. Verify all recommended food items exist and belong to the same restaurant
    if (cleanRecommendedIds.length > 0) {
        const validFoods = await db
            .select({ id: food.id })
            .from(food)
            .where(
                and(
                    eq(food.restaurantid, restaurantId),
                    inArray(food.id, cleanRecommendedIds)
                )
            );

        if (validFoods.length !== cleanRecommendedIds.length) {
            throw new BadRequest("One or more recommended food IDs are invalid or do not belong to your restaurant");
        }
    }

    // 4. Update / Sync recommended products in a transaction
    await db.transaction(async (tx) => {
        // Clear existing recommendations for this basic food
        await tx
            .delete(recommendedFoods)
            .where(
                and(
                    eq(recommendedFoods.foodId, foodId),
                    eq(recommendedFoods.restaurantId, restaurantId)
                )
            );

        // Insert new recommendations if any
        if (cleanRecommendedIds.length > 0) {
            const recordsToInsert = cleanRecommendedIds.map((recFoodId, index) => ({
                id: uuidv4(),
                restaurantId,
                foodId,
                recommendedFoodId: recFoodId,
                sortOrder: index + 1,
                status: "active" as const,
            }));

            await tx.insert(recommendedFoods).values(recordsToInsert);
        }
    });

    return SuccessResponse(res, {
        message: "Recommended products updated successfully",
        data: {
            foodId,
            recommendedCount: cleanRecommendedIds.length,
            recommendedFoodIds: cleanRecommendedIds,
        },
    });
};

// ==========================================
// 2. Get Recommended Products by Food ID (Admin)
// ==========================================
export const getRecommendedProductsByFoodId = async (req: Request, res: Response) => {
    const restaurantId = getAdminRestaurantId(req);
    const { foodId } = req.params;

    if (!foodId) {
        throw new BadRequest("foodId is required");
    }

    // Verify basic food
    const [basicFood] = await db
        .select({ id: food.id, name: food.name })
        .from(food)
        .where(and(eq(food.id, foodId), eq(food.restaurantid, restaurantId)))
        .limit(1);

    if (!basicFood) {
        throw new NotFound("Basic food product not found");
    }

    // Fetch recommended products
    const recommendations = await db
        .select({
            recommendationId: recommendedFoods.id,
            sortOrder: recommendedFoods.sortOrder,
            status: recommendedFoods.status,
            createdAt: recommendedFoods.createdAt,
            food: {
                id: food.id,
                name: food.name,
                nameAr: food.nameAr,
                nameFr: food.nameFr,
                image: food.image,
                price: food.price,
                discountType: food.discount_type,
                discountValue: food.discount_value,
                isOutOfStock: food.isOutOfStock,
                status: food.status,
            },
        })
        .from(recommendedFoods)
        .innerJoin(food, eq(recommendedFoods.recommendedFoodId, food.id))
        .where(
            and(
                eq(recommendedFoods.foodId, foodId),
                eq(recommendedFoods.restaurantId, restaurantId)
            )
        )
        .orderBy(asc(recommendedFoods.sortOrder));

    return SuccessResponse(res, {
        message: "Recommended products fetched successfully",
        data: {
            basicFood,
            recommendations,
        },
    });
};

// ==========================================
// 3. Remove single Recommended Product (Admin)
// ==========================================
export const removeRecommendedProduct = async (req: Request, res: Response) => {
    const restaurantId = getAdminRestaurantId(req);
    const { foodId, recommendedFoodId } = req.params;

    if (!foodId || !recommendedFoodId) {
        throw new BadRequest("Both foodId and recommendedFoodId are required");
    }

    const deleted = await db
        .delete(recommendedFoods)
        .where(
            and(
                eq(recommendedFoods.foodId, foodId),
                eq(recommendedFoods.recommendedFoodId, recommendedFoodId),
                eq(recommendedFoods.restaurantId, restaurantId)
            )
        );

    return SuccessResponse(res, {
        message: "Recommended product removed successfully",
    });
};
