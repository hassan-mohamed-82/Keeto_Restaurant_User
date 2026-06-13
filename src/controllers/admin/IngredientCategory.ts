import { Request, Response } from "express";
import { db } from "../../models/connection";
import { ingredientCategories, ingredients, foodIngredients, food } from "../../models/schema";
import { eq, and, inArray } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { v4 as uuidv4 } from "uuid";

// =========================================================
// 📁 القسم الأول: CRUD لتصنيفات المكونات (Ingredient Categories)
// =========================================================

// 1. Create - إضافة تصنيف جديد
export const createIngredientCategory = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const { name, status,nameAr } = req.body;

    if (!restaurantId) throw new BadRequest("Unauthorized");
    if (!name) throw new BadRequest("Category name is required");

    const id = uuidv4();
    await db.insert(ingredientCategories).values({ 
        id, 
        restaurantId, 
        name, 
        nameAr,
        status: status || "active" 
    });

    return SuccessResponse(res, { message: "Category created successfully", data: { id } }, 201);
};

// 2. Read - عرض كل التصنيفات للمطعم ده
export const getIngredientCategories = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const categories = await db.select()
        .from(ingredientCategories)
        .where(eq(ingredientCategories.restaurantId, restaurantId as string));

    return SuccessResponse(res, { data: categories });
};

// 3. Update - تعديل اسم أو حالة التصنيف
export const updateIngredientCategory = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, status,nameAr } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;

    const updateData: any = { updatedAt: new Date() };
    if (name) updateData.name = name;
    if (status !== undefined) updateData.status = status;
    if (nameAr) updateData.nameAr = nameAr;

    await db.update(ingredientCategories)
        .set(updateData)
.where(and(eq(ingredientCategories.id, id), eq(ingredientCategories.restaurantId, restaurantId as string)));
    return SuccessResponse(res, { message: "Category updated successfully" });
};

// 4. Delete - مسح التصنيف
export const deleteIngredientCategory = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;

    // حماية: التأكد إن مفيش مكونات تابعة للتصنيف ده قبل ما نمسحه
    const existingIngredients = await db.select().from(ingredients).where(eq(ingredients.categoryId, id)).limit(1);
    if (existingIngredients.length > 0) {
        throw new BadRequest("Cannot delete this category because it contains active ingredients. Move or delete them first.");
    }

    await db.delete(ingredientCategories)
        .where(and(eq(ingredientCategories.id, id), eq(ingredientCategories.restaurantId, restaurantId as string)));

    return SuccessResponse(res, { message: "Category deleted successfully" });
};


export const getIngredientCategoryById = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");
    const category = await db.select()
        .from(ingredientCategories)
        .where(and(eq(ingredientCategories.id, id), eq(ingredientCategories.restaurantId, restaurantId as string)));
    return SuccessResponse(res, { data: category });
};



