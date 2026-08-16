import { Request, Response } from "express";
import { db } from "../../models/connection";
import {
    food,
    foodIngredients,
    ingredients,
    ingredientCategories,
} from "../../models/schema";
import { eq, and, inArray } from "drizzle-orm";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { SuccessResponse } from "../../utils/response";

// =========================================================
// 🍳 إدارة الوصفة (Recipe / Food Ingredients)
// =========================================================

export const assignIngredientsToFood = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { ingredientsList } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");
    if (!Array.isArray(ingredientsList)) throw new BadRequest("ingredientsList must be an array");

    // 1. التأكد من وجود الوجبة وتبعيتا للمطعم
    const existingFood = await db.select().from(food).where(and(eq(food.id, id), eq(food.restaurantid, restaurantId))).limit(1);
    if (!existingFood[0]) throw new NotFound("Food not found or does not belong to you");

    if (ingredientsList.length > 0) {
        // 2. فحص أمني: التأكد من أن جميع المكونات الممررة تنتمي لنفس المطعم
        const passedIngredientIds = ingredientsList.map((item: any) => item.ingredientId);
        const validIngredients = await db
            .select({ id: ingredients.id })
            .from(ingredients)
            .where(and(
                inArray(ingredients.id, passedIngredientIds),
                eq(ingredients.restaurantId, restaurantId)
            ));

        if (validIngredients.length !== passedIngredientIds.length) {
            throw new BadRequest("One or more ingredients are invalid or do not belong to this restaurant");
        }
    }

    // 3. مسح المكونات القديمة وإعادة إضافة المكونات الجديدة داخل Transaction
    await db.transaction(async (tx) => {
        await tx.delete(foodIngredients).where(eq(foodIngredients.foodId, id));

        if (ingredientsList.length > 0) {
            const valuesToInsert = ingredientsList.map((item: any) => ({
                foodId: id,
                ingredientId: item.ingredientId,
                isRemovable: item.isRemovable ?? false,
                isEssential: item.isEssential ?? true, // 👈 تم إضافة isEssential بالقيم الافتراضية الصحيحة
            }));

            await tx.insert(foodIngredients).values(valuesToInsert);
        }
    });

    return SuccessResponse(res, { message: "Food recipe saved successfully" });
};

export const getFoodRecipe = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    const existingFood = await db.select().from(food).where(and(eq(food.id, id), eq(food.restaurantid, restaurantId))).limit(1);
    if (!existingFood[0]) throw new NotFound("Food not found");

    const recipe = await db.select({
        id: foodIngredients.id,
        ingredientId: ingredients.id,
        name: ingredients.name,
        inStock: ingredients.inStock,
        isRemovable: foodIngredients.isRemovable,
        isEssential: foodIngredients.isEssential,
        categoryName: ingredientCategories.name
    })
        .from(foodIngredients)
        .innerJoin(ingredients, eq(foodIngredients.ingredientId, ingredients.id))
        .leftJoin(ingredientCategories, eq(ingredients.categoryId, ingredientCategories.id))
        .where(eq(foodIngredients.foodId, id));

    return SuccessResponse(res, { message: "Get food recipe success", data: recipe });
};