import { Request, Response } from "express";
import { db } from "../../models/connection";
import { subcategories, categories, addons } from "../../models/schema";
import { eq, and, inArray, asc } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { NotFound } from "../../Errors/NotFound";
import { BadRequest } from "../../Errors/BadRequest";
import { v4 as uuidv4 } from "uuid";

export const createSubcategory = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }
    
    // استقبلنا order_level و order_Level لدعم الحالتين
    const { name, categoryId, priority, status, nameAr, nameFr, addonsIds, order_level, order_Level } = req.body;

    if (!name || !categoryId) {
        throw new BadRequest("Subcategory name and category ID are required");
    }

    // Check if category exists
    const existingCategory = await db
        .select()
        .from(categories)
        .where(eq(categories.id, categoryId))
        .limit(1);

    if (!existingCategory[0]) {
        throw new BadRequest("Category not found");
    }

    // Validate addons
    if (addonsIds && Array.isArray(addonsIds) && addonsIds.length > 0) {
        const existingAddons = await db
            .select({ id: addons.id })
            .from(addons)
            .where(
                and(
                    eq(addons.restaurantid, restaurantId),
                    inArray(addons.id, addonsIds)
                )
            );
            
        if (existingAddons.length !== addonsIds.length) {
            throw new BadRequest("One or more Addon IDs are invalid or do not belong to this restaurant");
        }
    }

    const id = uuidv4();

    await db.insert(subcategories).values({
        id,
        name,
        nameAr,
        nameFr,
        categoryId,
        restaurantId: restaurantId,
        addonsIds: addonsIds || [],
        priority: priority || "low",
        order_Level: order_Level !== undefined ? order_Level : (order_level !== undefined ? order_level : 0), // ربط المتغير الجديد
        status: status || "active",
    });

    return SuccessResponse(res, { message: "Create subcategory success", data: { id } }, 201);
};

export const getAllSubcategories = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const allSubcategories = await db
        .select({
            id: subcategories.id,
            name: subcategories.name,
            nameAr: subcategories.nameAr,
            nameFr: subcategories.nameFr,
            categoryId: subcategories.categoryId,
            addonsIds: subcategories.addonsIds,
            priority: subcategories.priority,
            order_level: subcategories.order_Level, // إرجاعه باسم order_level
            status: subcategories.status,
            createdAt: subcategories.createdAt,
            updatedAt: subcategories.updatedAt,
            category: {
                id: categories.id,
                name: categories.name,
                nameAr: categories.nameAr,
                nameFr: categories.nameFr,
                status: categories.status,
            },
        })
        .from(subcategories)
        .where(eq(subcategories.restaurantId, restaurantId))
        .leftJoin(categories, eq(subcategories.categoryId, categories.id))
        .orderBy(asc(subcategories.order_Level)); // الترتيب بناءً على orderLevel

    // Fetch all addons for this restaurant to map them
    const allAddons = await db.select().from(addons).where(eq(addons.restaurantid, restaurantId));

    const dataWithAddons = allSubcategories.map(sub => {
        const subAddons = sub.addonsIds && Array.isArray(sub.addonsIds) 
            ? allAddons.filter(a => (sub.addonsIds as string[]).includes(a.id)) 
            : [];
        return {
            ...sub,
            addons: subAddons
        };
    });

    return SuccessResponse(res, { message: "Get all subcategories success", data: dataWithAddons });
};

export const getSubcategoryById = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;
    const subcategory = await db
        .select({
            id: subcategories.id,
            name: subcategories.name,
            nameAr: subcategories.nameAr,
            nameFr: subcategories.nameFr,
            categoryId: subcategories.categoryId,
            addonsIds: subcategories.addonsIds,
            priority: subcategories.priority,
            order_level: subcategories.order_Level, // إرجاعه باسم order_level
            status: subcategories.status,
            createdAt: subcategories.createdAt,
            updatedAt: subcategories.updatedAt,
            category: {
                id: categories.id,
                name: categories.name,
                nameAr: categories.nameAr,
                nameFr: categories.nameFr,
                status: categories.status,
            },
        })
        .from(subcategories)
        .leftJoin(categories, eq(subcategories.categoryId, categories.id))
        .where(and(eq(subcategories.id, id), eq(subcategories.restaurantId, restaurantId)))
        .limit(1);

    if (!subcategory[0]) {
        throw new NotFound("Subcategory not found");
    }

    const sub = subcategory[0];
    let subAddons: any[] = [];
    if (sub.addonsIds && Array.isArray(sub.addonsIds) && sub.addonsIds.length > 0) {
        subAddons = await db
            .select()
            .from(addons)
            .where(inArray(addons.id, sub.addonsIds as string[]));
    }

    const dataWithAddons = {
        ...sub,
        addons: subAddons
    };

    return SuccessResponse(res, { message: "Get subcategory by id success", data: dataWithAddons });
};

export const updateSubcategory = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;
    
    // استقبال order_level
    const { name, categoryId, priority, status, nameAr, nameFr, addonsIds, order_level, order_Level } = req.body;

    const existingSubcategory = await db
        .select()
        .from(subcategories)
        .where(and(eq(subcategories.id, id), eq(subcategories.restaurantId, restaurantId)))
        .limit(1);

    if (!existingSubcategory[0]) {
        throw new NotFound("Subcategory not found or you don't have permission to edit it");
    }

    if (categoryId) {
        const existingCategory = await db
            .select()
            .from(categories)
            .where(eq(categories.id, categoryId))
            .limit(1);

        if (!existingCategory[0]) {
            throw new BadRequest("Category not found");
        }
    }

    if (addonsIds && Array.isArray(addonsIds) && addonsIds.length > 0) {
        const existingAddons = await db
            .select({ id: addons.id })
            .from(addons)
            .where(
                and(
                    eq(addons.restaurantid, restaurantId),
                    inArray(addons.id, addonsIds)
                )
            );
            
        if (existingAddons.length !== addonsIds.length) {
            throw new BadRequest("One or more Addon IDs are invalid or do not belong to this restaurant");
        }
    }

    const updateData: any = {
        updatedAt: new Date(),
    };

    if (name) updateData.name = name;
    if (nameAr !== undefined) updateData.nameAr = nameAr;
    if (nameFr !== undefined) updateData.nameFr = nameFr;
    if (categoryId) updateData.categoryId = categoryId;
    if (addonsIds !== undefined) updateData.addonsIds = addonsIds;
    if (priority) updateData.priority = priority;
    
    const finalOrderLevel = order_Level !== undefined ? order_Level : order_level;
    if (finalOrderLevel !== undefined) updateData.order_Level = finalOrderLevel; // التحديث في حالة التمرير
    
    if (status) updateData.status = status;

    if (Object.keys(updateData).length === 1) {
        throw new BadRequest("No data to update");
    }

    await db.update(subcategories)
        .set(updateData)
        .where(and(eq(subcategories.id, id), eq(subcategories.restaurantId, restaurantId)));

    return SuccessResponse(res, { message: "Update subcategory success" });
};

export const deleteSubcategory = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const existingSubcategory = await db
        .select()
        .from(subcategories)
        .where(and(eq(subcategories.id, id), eq(subcategories.restaurantId, restaurantId)))
        .limit(1);

    if (!existingSubcategory[0]) {
        throw new NotFound("Subcategory not found or you don't have permission to delete it");
    }

    await db.delete(subcategories)
        .where(and(eq(subcategories.id, id), eq(subcategories.restaurantId, restaurantId)));

    return SuccessResponse(res, { message: "Delete subcategory success" });
};

export const getallcategory = async (req: Request, res: Response) => {
    const allCategories = await db
        .select({
            id: categories.id,
            name: categories.name,
        })
        .from(categories)
        .where(eq(categories.status, "active"));
    return SuccessResponse(res, { message: "Get all categories success", data: allCategories });
};