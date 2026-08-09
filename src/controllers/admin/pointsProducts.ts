import { Request, Response } from "express";
import { db } from "../../models/connection";
import { food, pointsProducts } from "../../models/schema";
import { eq, and, inArray } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { NotFound } from "../../Errors/NotFound";
import { BadRequest } from "../../Errors/BadRequest";
import { v4 as uuidv4 } from "uuid";

const getRestaurantId = (req: Request): string => {
    const id = req.user?.restaurantId || req.user?.id;
    if (!id) throw new BadRequest("Restaurant ID missing or unauthorized");
    return id;
};

export const getFoodsForPointsSelect = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);

    // 1. All active foods for this restaurant
    const foods = await db
        .select({
            id: food.id,
            name: food.name,
            nameAr: food.nameAr,
            nameFr: food.nameFr,
            image: food.image,
            price: food.price,
            points: food.points,   // ← the points value that already lives on food
            status: food.status,
        })
        .from(food)
        .where(and(eq(food.restaurantid, restaurantId), eq(food.status, "active")));

    // 2. Which foods are already enrolled?
    const enrolled = await db
        .select({
            foodId: pointsProducts.foodId,
            id: pointsProducts.id,
            isActive: pointsProducts.isActive,
        })
        .from(pointsProducts)
        .where(eq(pointsProducts.restaurantId, restaurantId));

    const enrolledMap = new Map(enrolled.map(p => [p.foodId, p]));

    const result = foods.map(f => ({
        ...f,
        inPointsProgram: enrolledMap.has(f.id),
        pointsProgramId: enrolledMap.get(f.id)?.id ?? null,
        pointsProgramActive: enrolledMap.get(f.id)?.isActive ?? null,
    }));

    return SuccessResponse(res, {
        message: "Foods available for points program",
        data: result,
    });
};

export const getPointsProducts = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);

    const rows = await db
        .select({
            id: pointsProducts.id,
            isActive: pointsProducts.isActive,
            createdAt: pointsProducts.createdAt,
            updatedAt: pointsProducts.updatedAt,
            // Food details (including its own points field)
            foodId: food.id,
            foodName: food.name,
            foodNameAr: food.nameAr,
            foodNameFr: food.nameFr,
            foodImage: food.image,
            foodPrice: food.price,
            foodPoints: food.points,   // ← read from food, not from this table
            foodStatus: food.status,
        })
        .from(pointsProducts)
        .leftJoin(food, eq(pointsProducts.foodId, food.id))
        .where(eq(pointsProducts.restaurantId, restaurantId));

    return SuccessResponse(res, {
        message: "Get points products success",
        data: rows.map(r => ({
            id: r.id,
            isActive: r.isActive,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            food: {
                id: r.foodId,
                name: r.foodName,
                nameAr: r.foodNameAr,
                nameFr: r.foodNameFr,
                image: r.foodImage,
                price: r.foodPrice,
                points: r.foodPoints,  // ← from food table
                status: r.foodStatus,
            },
        })),
    });
};

export const enrollPointsProducts = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);
    const { foodId, foodIds } = req.body;

    // Normalise: accept single string OR array
    const rawIds: string[] = foodId
        ? [foodId]
        : Array.isArray(foodIds)
        ? foodIds
        : [];

    if (rawIds.length === 0) {
        throw new BadRequest("Provide foodId (string) or foodIds (array)");
    }

    // Validate all foods belong to this restaurant and have points set
    const existingFoods = await db
        .select({ id: food.id, points: food.points, name: food.name })
        .from(food)
        .where(and(inArray(food.id, rawIds), eq(food.restaurantid, restaurantId)));

    if (existingFoods.length !== rawIds.length) {
        throw new BadRequest("One or more food items not found or don't belong to your restaurant");
    }

    const withoutPoints = existingFoods.filter(f => (f.points ?? 0) <= 0);
    if (withoutPoints.length > 0) {
        throw new BadRequest(
            `Set a points value on these foods first: ${withoutPoints.map(f => f.name).join(", ")}`
        );
    }

    // Fetch already-enrolled entries for this restaurant
    const existingPP = await db
        .select({ id: pointsProducts.id, foodId: pointsProducts.foodId })
        .from(pointsProducts)
        .where(and(eq(pointsProducts.restaurantId, restaurantId), inArray(pointsProducts.foodId, rawIds)));

    const existingMap = new Map(existingPP.map(p => [p.foodId, p.id]));

    const inserted: string[] = [];
    const reactivated: string[] = [];

    await db.transaction(async (tx) => {
        for (const fId of rawIds) {
            const existingId = existingMap.get(fId);
            if (existingId) {
                await tx
                    .update(pointsProducts)
                    .set({ isActive: true })
                    .where(eq(pointsProducts.id, existingId));
                reactivated.push(fId);
            } else {
                await tx.insert(pointsProducts).values({
                    id: uuidv4(),
                    restaurantId,
                    foodId: fId,
                    isActive: true,
                });
                inserted.push(fId);
            }
        }
    });

    return SuccessResponse(res, {
        message: `Points program updated: ${inserted.length} added, ${reactivated.length} re-activated`,
        data: { inserted, reactivated },
    });
};

export const togglePointsProduct = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);
    const { id } = req.params;

    const existing = await db
        .select()
        .from(pointsProducts)
        .where(and(eq(pointsProducts.id, id), eq(pointsProducts.restaurantId, restaurantId)))
        .limit(1);

    if (!existing[0]) throw new NotFound("Points product not found or does not belong to your restaurant");

    const newStatus = !existing[0].isActive;
    await db.update(pointsProducts).set({ isActive: newStatus }).where(eq(pointsProducts.id, id));

    return SuccessResponse(res, {
        message: `Points product ${newStatus ? "activated" : "deactivated"} successfully`,
        data: { isActive: newStatus },
    });
};

export const removePointsProduct = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);
    const { id } = req.params;

    const existing = await db
        .select()
        .from(pointsProducts)
        .where(and(eq(pointsProducts.id, id), eq(pointsProducts.restaurantId, restaurantId)))
        .limit(1);

    if (!existing[0]) throw new NotFound("Points product not found or does not belong to your restaurant");

    await db.delete(pointsProducts).where(eq(pointsProducts.id, id));

    return SuccessResponse(res, { message: "Food removed from points program successfully" });
};
