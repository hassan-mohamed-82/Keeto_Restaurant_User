import { Request, Response } from "express";
import { db } from "../../models/connection";
import { ingredientCategories, ingredients, foodIngredients, food } from "../../models/schema";
import { eq, and, inArray } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { v4 as uuidv4 } from "uuid";

// =========================================================
// 🍓 القسم الثاني: CRUD للمكونات نفسها (Ingredients)
// =========================================================

// 1. Create - إضافة مكون جديد
export const createIngredient = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const { name, categoryId } = req.body;

    if (!restaurantId) throw new BadRequest("Unauthorized");
    if (!name || !categoryId) throw new BadRequest("Name and Category ID are required");

    const id = uuidv4();
    await db.insert(ingredients).values({ 
        id, 
        restaurantId, 
        categoryId, 
        name, 
        inStock: true 
    });

    return SuccessResponse(res, { message: "Ingredient created successfully", data: { id } }, 201);
};

// 2. Read - عرض كل المكونات 
export const getIngredients = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const list = await db.select({
        id: ingredients.id,
        name: ingredients.name,
        inStock: ingredients.inStock,
        categoryId: ingredients.categoryId,
        categoryName: ingredientCategories.name
    })
    .from(ingredients)
    .leftJoin(ingredientCategories, eq(ingredients.categoryId, ingredientCategories.id))
    .where(eq(ingredients.restaurantId, restaurantId));

    return SuccessResponse(res, { data: list });
};

// 3. Update (Normal) - تعديل اسم المكون أو التصنيف بتاعه
export const updateIngredient = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, categoryId } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;

    const updateData: any = { updatedAt: new Date() };
    if (name) updateData.name = name;
    if (categoryId) updateData.categoryId = categoryId;

    await db.update(ingredients)
        .set(updateData)
        .where(and(eq(ingredients.id, id), eq(ingredients.restaurantId, restaurantId as string)));

    return SuccessResponse(res, { message: "Ingredient updated successfully" });
};

// 4. Update (Magic/Toggle) - 🚨 زرار المخزون اللي بيقفل الأكل 
export const toggleIngredientStock = async (req: Request, res: Response) => {
    const { id } = req.params; 
    const { inStock } = req.body; 
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (inStock === undefined) throw new BadRequest("inStock boolean is required");

    await db.transaction(async (tx) => {
        // تحديث المكون نفسه
        await tx.update(ingredients)
            .set({ inStock, updatedAt: new Date() })
            .where(and(eq(ingredients.id, id), eq(ingredients.restaurantId, restaurantId as string)));

        // لو المكون خلص (false)، نقفل الأكل المربوط بيه
        if (inStock === false) {
            const relatedFoods = await tx.select({ foodId: foodIngredients.foodId })
                .from(foodIngredients)
                .where(eq(foodIngredients.ingredientId, id));

            const foodIdsToDisable = relatedFoods.map(f => f.foodId);

            if (foodIdsToDisable.length > 0) {
                await tx.update(food)
                    .set({ status: "inactive" }) 
                    .where(inArray(food.id, foodIdsToDisable));
            }
        }
    });

    return SuccessResponse(res, { message: `Stock updated. Related products adjusted automatically.` });
};

// 5. Delete - مسح المكون نهائياً
export const deleteIngredient = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;

    await db.transaction(async (tx) => {
        // خطوة 1: لازم نمسح المكون من جدول الربط (الوصفات) الأول عشان نتجنب الـ Foreign Key Error
        await tx.delete(foodIngredients).where(eq(foodIngredients.ingredientId, id));

        // خطوة 2: نمسح المكون نفسه
        await tx.delete(ingredients)
            .where(and(eq(ingredients.id, id), eq(ingredients.restaurantId, restaurantId as string)));
    });

    return SuccessResponse(res, { message: "Ingredient and its recipe links deleted successfully" });
};

export const getIngredientById = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");
    const ingredient = await db.select()
        .from(ingredients)
        .where(and(eq(ingredients.id, id), eq(ingredients.restaurantId, restaurantId as string)));
    return SuccessResponse(res, { data: ingredient });
};

export const getallactiveingredientscategory = async (req: Request, res: Response) => {
   const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const categories = await db.select()
        .from(ingredientCategories)
        .where(and(
            eq(ingredientCategories.restaurantId, restaurantId as string),
            eq(ingredientCategories.status, "active")
        ));

    return SuccessResponse(res, { data: categories });

};

export const getFoodsByIngredient = async (req: Request, res: Response) => {
    const { id } = req.params; 
    const restaurantId = req.user?.restaurantId || req.user?.id;

    const relatedFoods = await db.select({
        foodId: food.id,
        foodName: food.name,
        foodStatus: food.status,
        isRemovable: foodIngredients.isRemovable 
    })
    .from(foodIngredients)
    .innerJoin(food, eq(foodIngredients.foodId, food.id))
    .where(and(
        eq(foodIngredients.ingredientId, id),
        eq(food.restaurantid, restaurantId as string) 
    ));

    return SuccessResponse(res, { 
        message: "Fetched related foods successfully",
        count: relatedFoods.length, 
        data: relatedFoods 
    });
};