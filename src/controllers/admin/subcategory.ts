import { Request, Response } from "express";
import { db } from "../../models/connection";
import {
    subcategories,
    categories,
    addons,
    food,
    branchSubcategories,
    branches,
} from "../../models/schema";
import { eq, and, inArray, asc, sql, or, isNull } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { NotFound } from "../../Errors/NotFound";
import { BadRequest } from "../../Errors/BadRequest";
import { v4 as uuidv4 } from "uuid";
import redis from "../../config/redis";

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
        order_Level: order_Level !== undefined ? order_Level : (order_level !== undefined ? order_level : 0),
        status: status || "active",
    });

    return SuccessResponse(res, { message: "Create subcategory success", data: { id } }, 201);
};

export const getAllSubcategories = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const branchId = (req.query.branchId as string)?.trim() || req.user?.branchId || null;
    const categoryId = (req.query.categoryId as string)?.trim() || null;

    const conditions: any[] = [eq(subcategories.restaurantId, restaurantId)];
    if (categoryId) {
        conditions.push(eq(subcategories.categoryId, categoryId));
    }

    let query = db
        .select({
            id: subcategories.id,
            name: subcategories.name,
            nameAr: subcategories.nameAr,
            nameFr: subcategories.nameFr,
            categoryId: subcategories.categoryId,
            addonsIds: subcategories.addonsIds,
            priority: subcategories.priority,
            order_level: subcategories.order_Level,
            status: subcategories.status,
            branchStatus: branchId ? branchSubcategories.status : sql<string | null>`NULL`,
            effectiveStatus: branchId
                ? sql<string>`COALESCE(${branchSubcategories.status}, ${subcategories.status})`
                : subcategories.status,
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
        .leftJoin(categories, eq(subcategories.categoryId, categories.id));

    if (branchId) {
        query = query.leftJoin(
            branchSubcategories,
            and(
                eq(branchSubcategories.subcategoryId, subcategories.id),
                eq(branchSubcategories.branchId, branchId)
            )
        ) as any;
    }

    const allSubcategories = await query
        .where(and(...conditions))
        .orderBy(asc(subcategories.order_Level));

    // Fetch all addons for this restaurant to map them
    const allAddons = await db.select().from(addons).where(eq(addons.restaurantid, restaurantId));

    const dataWithAddons = allSubcategories.map((sub: any) => {
        let parsedAddonsIds = sub.addonsIds;
        if (typeof sub.addonsIds === 'string') {
            try {
                parsedAddonsIds = JSON.parse(sub.addonsIds);
            } catch (e) {
                parsedAddonsIds = [];
            }
        }

        const subAddons = parsedAddonsIds && Array.isArray(parsedAddonsIds) 
            ? allAddons.filter(a => (parsedAddonsIds as string[]).includes(a.id)) 
            : [];

        const isAvailable = branchId
            ? sub.effectiveStatus === "active"
            : sub.status === "active";

        return {
            ...sub,
            addonsIds: parsedAddonsIds,
            addons: subAddons,
            isBranchActive: isAvailable,
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
    const branchId = (req.query.branchId as string)?.trim() || req.user?.branchId || null;

    let query = db
        .select({
            id: subcategories.id,
            name: subcategories.name,
            nameAr: subcategories.nameAr,
            nameFr: subcategories.nameFr,
            categoryId: subcategories.categoryId,
            addonsIds: subcategories.addonsIds,
            priority: subcategories.priority,
            order_level: subcategories.order_Level,
            status: subcategories.status,
            branchStatus: branchId ? branchSubcategories.status : sql<string | null>`NULL`,
            effectiveStatus: branchId
                ? sql<string>`COALESCE(${branchSubcategories.status}, ${subcategories.status})`
                : subcategories.status,
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
        .leftJoin(categories, eq(subcategories.categoryId, categories.id));

    if (branchId) {
        query = query.leftJoin(
            branchSubcategories,
            and(
                eq(branchSubcategories.subcategoryId, subcategories.id),
                eq(branchSubcategories.branchId, branchId)
            )
        ) as any;
    }

    const [sub] = await query
        .where(and(eq(subcategories.id, id), eq(subcategories.restaurantId, restaurantId)))
        .limit(1);

    if (!sub) {
        throw new NotFound("Subcategory not found");
    }

    let parsedAddonsIds = sub.addonsIds;
    if (typeof sub.addonsIds === 'string') {
        try {
            parsedAddonsIds = JSON.parse(sub.addonsIds);
        } catch (e) {
            parsedAddonsIds = [];
        }
    }

    let subAddons: any[] = [];
    if (parsedAddonsIds && Array.isArray(parsedAddonsIds) && parsedAddonsIds.length > 0) {
        subAddons = await db
            .select()
            .from(addons)
            .where(inArray(addons.id, parsedAddonsIds as string[]));
    }

    const isAvailable = branchId
        ? sub.effectiveStatus === "active"
        : sub.status === "active";

    const dataWithAddons = {
        ...sub,
        addonsIds: parsedAddonsIds,
        addons: subAddons,
        isBranchActive: isAvailable,
    };

    return SuccessResponse(res, { message: "Get subcategory by id success", data: dataWithAddons });
};

export const updateSubcategory = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;
    
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
    if (finalOrderLevel !== undefined) updateData.order_Level = finalOrderLevel;
    
    if (status) updateData.status = status;

    if (Object.keys(updateData).length === 1) {
        throw new BadRequest("No data to update");
    }

    await db.update(subcategories)
        .set(updateData)
        .where(and(eq(subcategories.id, id), eq(subcategories.restaurantId, restaurantId)));

    if (addonsIds !== undefined) {
        await db.update(food)
            .set({ addonsId: addonsIds })
            .where(eq(food.subcategoryid, id));
    }

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

// ============================================================================
// 1. فتح أو قفل التصنيف الفرعي في فرع معين (Toggle / Update Branch Status)
// PATCH /subcategories/:id/branch/:branchId/status
// Body: { status?: "active" | "inactive" } (اختياري، لو غير ممرر يقوم بعمل Toggle)
// ============================================================================
export const updateBranchSubcategoryStatus = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const userBranchId = req.user?.branchId;
    const { id: subcategoryId, branchId } = req.params;
    const { status } = req.body;

    if (!restaurantId) throw new BadRequest("Restaurant context is missing or unauthorized");
    if (!subcategoryId || !branchId) throw new BadRequest("subcategoryId and branchId are required");

    if (userBranchId && userBranchId !== branchId) {
        throw new BadRequest("Unauthorized: You cannot manage another branch's status");
    }

    // التأكد من أن الفرع يتبع المطعم
    const [branch] = await db
        .select({ id: branches.id, name: branches.name })
        .from(branches)
        .where(and(eq(branches.id, branchId), eq(branches.restaurantId, restaurantId)))
        .limit(1);

    if (!branch) throw new NotFound("Branch not found or does not belong to your restaurant");

    // التأكد من وجود الـ subcategory
    const [sub] = await db
        .select({ id: subcategories.id, name: subcategories.name, status: subcategories.status })
        .from(subcategories)
        .where(and(eq(subcategories.id, subcategoryId), eq(subcategories.restaurantId, restaurantId)))
        .limit(1);

    if (!sub) throw new NotFound("Subcategory not found or does not belong to your restaurant");

    // فحص السجل الحالي للفرع
    const [existing] = await db
        .select()
        .from(branchSubcategories)
        .where(
            and(
                eq(branchSubcategories.branchId, branchId),
                eq(branchSubcategories.subcategoryId, subcategoryId)
            )
        )
        .limit(1);

    let newStatus: "active" | "inactive";
    if (status && (status === "active" || status === "inactive")) {
        newStatus = status;
    } else {
        const currentStatus = existing ? existing.status : (sub.status || "active");
        newStatus = currentStatus === "active" ? "inactive" : "active";
    }

    if (existing) {
        await db
            .update(branchSubcategories)
            .set({ status: newStatus, updatedAt: new Date() })
            .where(eq(branchSubcategories.id, existing.id));
    } else {
        await db.insert(branchSubcategories).values({
            id: uuidv4(),
            branchId,
            subcategoryId,
            status: newStatus,
        });
    }

    // مسح الكاش
    try {
        await redis.del(`admin:branch_menu:${branchId}`);
        const userCacheKey = `restaurant_details:${restaurantId}:branch:${branchId}`;
        await redis.del(userCacheKey);
    } catch (e) {
        // Cache error is non-blocking
    }

    return SuccessResponse(res, {
        message: `Subcategory "${sub.name}" is now ${newStatus} in branch "${branch.name}"`,
        data: {
            subcategoryId,
            branchId,
            status: newStatus,
            isAvailable: newStatus === "active",
        },
    });
};

// ============================================================================
// 2. إرجاع حالة التصنيف الفرعي في جميع فروع المطعم (Subcategory Branch Availability)
// GET /subcategories/:id/branches-availability
// ============================================================================
export const getSubcategoryBranchAvailability = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const { id: subcategoryId } = req.params;

    if (!restaurantId) throw new BadRequest("Restaurant context is missing or unauthorized");
    if (!subcategoryId) throw new BadRequest("Subcategory ID is required");

    // التأكد من وجود الـ Subcategory
    const [sub] = await db
        .select({
            id: subcategories.id,
            name: subcategories.name,
            nameAr: subcategories.nameAr,
            nameFr: subcategories.nameFr,
            status: subcategories.status,
            categoryId: subcategories.categoryId,
        })
        .from(subcategories)
        .where(and(eq(subcategories.id, subcategoryId), eq(subcategories.restaurantId, restaurantId)))
        .limit(1);

    if (!sub) throw new NotFound("Subcategory not found or does not belong to your restaurant");

    // جلب جميع فروع المطعم النشطة
    const allBranches = await db
        .select({
            id: branches.id,
            name: branches.name,
            nameAr: branches.nameAr,
            nameFr: branches.nameFr,
            status: branches.status,
        })
        .from(branches)
        .where(and(eq(branches.restaurantId, restaurantId), eq(branches.status, "active")));

    // جلب سجلات تخصيص الفرع لهذا الـ Subcategory
    const overrides = await db
        .select({
            branchId: branchSubcategories.branchId,
            status: branchSubcategories.status,
        })
        .from(branchSubcategories)
        .where(eq(branchSubcategories.subcategoryId, subcategoryId));

    const overrideMap = new Map(overrides.map((o) => [o.branchId, o.status]));

    const branchList = allBranches.map((b) => {
        const branchStatus = overrideMap.has(b.id)
            ? overrideMap.get(b.id)!
            : (sub.status || "active");

        return {
            branchId: b.id,
            branchName: b.name,
            branchNameAr: b.nameAr,
            branchNameFr: b.nameFr,
            status: branchStatus,
            isAvailable: branchStatus === "active",
        };
    });

    return SuccessResponse(res, {
        message: "Subcategory branch availability fetched successfully",
        data: {
            subcategoryId: sub.id,
            subcategoryName: sub.name,
            subcategoryNameAr: sub.nameAr,
            globalStatus: sub.status,
            branches: branchList,
        },
    });
};

// ============================================================================
// 3. جلب التصنيفات الفرعية المفتوحة والنشطة فقط لفرع معين
// GET /subcategories/branch/:branchId/active
// ============================================================================
export const getActiveSubcategoriesByBranch = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const { branchId } = req.params;
    const categoryId = (req.query.categoryId as string)?.trim() || null;

    if (!restaurantId) throw new BadRequest("Restaurant context is missing or unauthorized");
    if (!branchId) throw new BadRequest("Branch ID is required");

    const conditions: any[] = [
        eq(subcategories.restaurantId, restaurantId),
        eq(subcategories.status, "active"),
    ];
    if (categoryId) {
        conditions.push(eq(subcategories.categoryId, categoryId));
    }

    const rows = await db
        .select({
            id: subcategories.id,
            name: subcategories.name,
            nameAr: subcategories.nameAr,
            nameFr: subcategories.nameFr,
            categoryId: subcategories.categoryId,
            addonsIds: subcategories.addonsIds,
            priority: subcategories.priority,
            order_level: subcategories.order_Level,
            status: subcategories.status,
            branchStatus: branchSubcategories.status,
        })
        .from(subcategories)
        .leftJoin(
            branchSubcategories,
            and(
                eq(branchSubcategories.subcategoryId, subcategories.id),
                eq(branchSubcategories.branchId, branchId)
            )
        )
        .where(
            and(
                ...conditions,
                or(
                    isNull(branchSubcategories.id),
                    eq(branchSubcategories.status, "active")
                )
            )
        )
        .orderBy(asc(subcategories.order_Level));

    return SuccessResponse(res, {
        message: "Active subcategories for branch fetched successfully",
        data: rows,
    });
};