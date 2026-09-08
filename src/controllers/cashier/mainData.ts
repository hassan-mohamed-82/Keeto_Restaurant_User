import { Request, Response } from "express";
import { db } from "../../models/connection";

import { categories, subcategories, food, } from "../../models/schema";
import { eq, inArray, sql, and } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { UnauthorizedError } from "../../Errors";
import {product_form, } from "../../helpers/pricing.helper";

export async function categories_list(req: Request, res: Response) {
    const { language } = req.body;
    if (!language) {
        throw new BadRequest("language is required");
    }
    if (language != "En" && language != "Ar" && language != "Fr") {
        throw new BadRequest("language is not valid");
    }

    const categories_items = await db
    .select({
        id: categories.id,
        name: language === "En" ? categories.name : language === "Ar" ? categories.nameAr : categories.nameFr,
        Image: categories.Image,
    })
    .from(categories)
    .where(eq(categories.status, "active"))
    .orderBy(
        sql`CASE 
            WHEN ${categories.priority} = 'high' THEN 1
            WHEN ${categories.priority} = 'medium' THEN 2
            WHEN ${categories.priority} = 'low' THEN 3
            ELSE 4 
        END`
    );

    return SuccessResponse(res, { message: "Get all categories success", data: categories_items });
} 

export async function sub_categories_list(req: Request, res: Response) {
    const { language } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id; 
    if (!restaurantId) {
        throw new UnauthorizedError("Unauthorized");
    }
    if (!language) {
        throw new BadRequest("language is required");
    }
    if (language != "En" && language != "Ar" && language != "Fr") {
        throw new BadRequest("language is not valid");
    }

    const subcategories_items = await db
    .select({
        id: subcategories.id,
        name: language === "En" ? subcategories.name : language === "Ar" ? subcategories.nameAr : subcategories.nameFr,
        categoryId: subcategories.categoryId,
    })
    .from(subcategories)
    .where(and(
        eq(subcategories.status, "active"),
        eq(subcategories.restaurantId, restaurantId)
    ))
    .orderBy(
        sql`CASE 
            WHEN ${subcategories.priority} = 'high' THEN 1
            WHEN ${subcategories.priority} = 'medium' THEN 2
            WHEN ${subcategories.priority} = 'low' THEN 3
            ELSE 4 
        END`
    );

    return SuccessResponse(res, { message: "Get all sub categories success", data: subcategories_items });
} 

export async function products(req: Request, res: Response) {
    const { language, categoryId, subcategoryId, serviceModule } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const branchId = req.user?.branchId || req.user?.id; 
    
    if (!restaurantId) {
        throw new UnauthorizedError("Unauthorized");
    }
    if (!branchId) {
        throw new BadRequest("branchId is required");
    }

    // 1. التحقق من صحة المدخلات
    if (!language) {
        throw new BadRequest("language is required");
    }
    if (!serviceModule) {
        throw new BadRequest("serviceModule is required");
    }
    if (!["En", "Ar", "Fr"].includes(language)) {
        throw new BadRequest("language is not valid");
    }
    if (!categoryId && !subcategoryId) {
        throw new BadRequest("categoryId or subcategoryId is required");
    }

    // 2. بناء شروط الاستعلام بشكل ديناميكي لتجنب التكرار
    const queryConditions = [
        eq(food.status, "active"),
        eq(food.restaurantid, restaurantId),
        eq(food.isOutOfStock, false),
    ];

    if (subcategoryId) {
        queryConditions.push(eq(food.subcategoryid, subcategoryId));
    } else {
        queryConditions.push(eq(food.categoryid, categoryId));
    }

    // 3. جلب المنتجات
    const productsList = await db
        .select()
        .from(food)
        .where(and(...queryConditions));

    // 4. معالجة المنتجات باستخدام Promise.all لضمان انتظار جميع العمليات
    const products_items = await Promise.all(
        productsList.map((product) => 
            // تمرير المعاملات بالترتيب الصحيح المطابق لدالة product_form
            product_form(product, branchId, serviceModule, language as "En" | "Ar" | "Fr")
        )
    );

    return SuccessResponse(res, { message: "Get all products success", data: products_items });
}