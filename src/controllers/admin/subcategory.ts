import { Request, Response } from "express";
import { db } from "../../models/connection";
import {
    subcategories,
    categories,
    addons,
    food,
    branchSubcategories,
    branches,
    branchMenuItems,
} from "../../models/schema";
import { eq, and, inArray, asc, sql, or, isNull } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { NotFound } from "../../Errors/NotFound";
import { BadRequest } from "../../Errors/BadRequest";
import { v4 as uuidv4 } from "uuid";
import redis from "../../config/redis";
import { handleImageUpdate } from "../../utils/handleImages";

export const createSubcategory = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }
    
    // استقبلنا order_level و order_Level لدعم الحالتين
    const { name, categoryId, priority, status, nameAr, nameFr, image, addonsIds, order_level, order_Level } = req.body;

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
    const imageUrl = await handleImageUpdate(req, undefined, image, "subcategories");

    await db.insert(subcategories).values({
        id,
        name,
        nameAr,
        nameFr,
        image: imageUrl,
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
            image: subcategories.image,
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
            image: subcategories.image,
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
    
    const { name, categoryId, priority, status, nameAr, nameFr, image, addonsIds, order_level, order_Level } = req.body;

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
    if (image !== undefined) {
        updateData.image = await handleImageUpdate(req, existingSubcategory[0].image, image, "subcategories");
    }
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

    // 🟢 مزامنة حالة كل منتجات هذا الـ subcategory داخل الفرع
    const subcategoryFoods = await db
        .select({
            id: food.id,
            status: food.status, // الحالة العامة في جدول food
        })
        .from(food)
        .where(
            and(
                eq(food.subcategoryid, subcategoryId),
                eq(food.restaurantid, restaurantId)
            )
        );

    if (subcategoryFoods.length > 0) {
        const foodIds = subcategoryFoods.map((f) => f.id);
        const existingBranchItems = await db
            .select({
                id: branchMenuItems.id,
                foodId: branchMenuItems.foodId,
                status: branchMenuItems.status,
            })
            .from(branchMenuItems)
            .where(
                and(
                    eq(branchMenuItems.branchId, branchId),
                    inArray(branchMenuItems.foodId, foodIds)
                )
            );

        const existingMap = new Map(existingBranchItems.map((item) => [item.foodId, item]));

        if (newStatus === "inactive") {
            // تحويل كل المنتجات إلى inactive في هذا الفرع
            for (const f of subcategoryFoods) {
                const existingItem = existingMap.get(f.id);
                if (existingItem) {
                    await db
                        .update(branchMenuItems)
                        .set({ status: "inactive", updatedAt: new Date() })
                        .where(eq(branchMenuItems.id, existingItem.id));
                } else {
                    await db.insert(branchMenuItems).values({
                        id: uuidv4(),
                        branchId,
                        foodId: f.id,
                        status: "inactive",
                    });
                }
            }
        } else {
            // عند التفعيل: المنتجات النشطة فقط في الكتالوج الرئيسي تُفعل، والمنتج غير النشط لا يُغير
            for (const f of subcategoryFoods) {
                if (f.status === "active") {
                    const existingItem = existingMap.get(f.id);
                    if (existingItem) {
                        await db
                            .update(branchMenuItems)
                            .set({ status: "active", updatedAt: new Date() })
                            .where(eq(branchMenuItems.id, existingItem.id));
                    }
                }
            }
        }
    }

    // مسح الكاش
    try {
        await redis.del(`admin:branch_menu:${branchId}`);
        const userCacheKey = `restaurant_details:${restaurantId}:branch:${branchId}`;
        await redis.del(userCacheKey);
        const homeMenuKeys = await redis.keys("restaurant_details:*");
        if (homeMenuKeys.length > 0) await redis.del(...homeMenuKeys);
        const categoryKeys = await redis.keys("foods_category:*");
        if (categoryKeys.length > 0) await redis.del(...categoryKeys);
    } catch (e) {
        // Cache error is non-blocking
    }

    return SuccessResponse(res, {
        message: `Subcategory "${sub.name}" is now ${newStatus} in branch "${branch.name}" (products synced)`,
        data: {
            subcategoryId,
            branchId,
            status: newStatus,
            isAvailable: newStatus === "active",
            syncedProductsCount: subcategoryFoods.length,
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
            image: subcategories.image,
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
            subcategoryImage: sub.image,
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
            image: subcategories.image,
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

// ============================================================================
// 4. جعل كل منتجات التصنيف الفرعي / الرئيسي Out of Stock
// PUT /subcategories/:id/branch/:branchId/out-of-stock
// PUT /subcategories/:id/out-of-stock
// Body: { isOutOfStock?: boolean } (Default: true)
// ============================================================================
export const updateBranchSubcategoryOutOfStock = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const userBranchId = req.user?.branchId;
    const subcategoryId = req.params.id || req.params.subcategoryId || (req.body?.subcategoryId as string) || (req.query?.subcategoryId as string);
    const branchId = req.params.branchId || (req.body?.branchId as string) || (req.query?.branchId as string) || userBranchId;

    const isOutOfStock = req.body?.isOutOfStock !== undefined ? Boolean(req.body.isOutOfStock) : true;

    if (!restaurantId) throw new BadRequest("Restaurant context is missing or unauthorized");
    if (!subcategoryId) {
        throw new BadRequest("subcategoryId is required");
    }

    if (branchId && userBranchId && userBranchId !== branchId) {
        throw new BadRequest("Unauthorized: You cannot manage another branch's stock");
    }

    let branchName = "";
    if (branchId) {
        const [branch] = await db
            .select({ id: branches.id, name: branches.name })
            .from(branches)
            .where(and(eq(branches.id, branchId), eq(branches.restaurantId, restaurantId)))
            .limit(1);

        if (!branch) throw new NotFound("Branch not found or does not belong to your restaurant");
        branchName = branch.name;
    }

    let subcategoryName = "";
    if (subcategoryId) {
        const [sub] = await db
            .select({ id: subcategories.id, name: subcategories.name })
            .from(subcategories)
            .where(and(eq(subcategories.id, subcategoryId), eq(subcategories.restaurantId, restaurantId)))
            .limit(1);

        if (!sub) throw new NotFound("Subcategory not found or does not belong to your restaurant");
        subcategoryName = sub.name;
    }

    // بناء شروط البحث عن المنتجات
    const foodConditions: any[] = [eq(food.restaurantid, restaurantId)];
    if (subcategoryId) foodConditions.push(eq(food.subcategoryid, subcategoryId));

    const targetFoods = await db
        .select({
            id: food.id,
            name: food.name,
            isOutOfStock: food.isOutOfStock,
        })
        .from(food)
        .where(and(...foodConditions));

    if (targetFoods.length === 0) {
        return SuccessResponse(res, {
            message: "No foods found for the specified subcategory/category",
            data: { updatedCount: 0, isOutOfStock },
        });
    }

    const foodIds = targetFoods.map((f) => f.id);

    // 1. تحديث حقل isOutOfStock في جدول food (food.isOutOfStock = true / false)
    await db
        .update(food)
        .set({
            isOutOfStock,
            updatedAt: new Date(),
        })
        .where(and(...foodConditions));

    // 2. تحديث الـ stored flag مباشرة على جدول subcategories (global)
    await db
        .update(subcategories)
        .set({ isOutOfStock, updatedAt: new Date() })
        .where(eq(subcategories.id, subcategoryId));

    // 3. إذا تم تحديد فرع، نحدث branchSubcategories.isOutOfStock + branch_menu_items stock
    if (branchId) {
        // 3a. Upsert branchSubcategories.isOutOfStock
        const [existingBranchSub] = await db
            .select({ id: branchSubcategories.id })
            .from(branchSubcategories)
            .where(
                and(
                    eq(branchSubcategories.subcategoryId, subcategoryId),
                    eq(branchSubcategories.branchId, branchId)
                )
            )
            .limit(1);

        if (existingBranchSub) {
            await db
                .update(branchSubcategories)
                .set({ isOutOfStock, updatedAt: new Date() })
                .where(eq(branchSubcategories.id, existingBranchSub.id));
        } else {
            await db.insert(branchSubcategories).values({
                id: uuidv4(),
                branchId,
                subcategoryId,
                isOutOfStock,
            });
        }

        // 3b. Update branch_menu_items stock for each food
        const existingBranchItems = await db
            .select({ id: branchMenuItems.id, foodId: branchMenuItems.foodId })
            .from(branchMenuItems)
            .where(
                and(
                    eq(branchMenuItems.branchId, branchId),
                    inArray(branchMenuItems.foodId, foodIds)
                )
            );

        const existingMap = new Map(existingBranchItems.map((item) => [item.foodId, item.id]));
        const targetStockType = isOutOfStock ? "limited" : "unlimited";
        const targetStockQty = isOutOfStock ? 0 : (req.body?.stockQty ?? 0);

        for (const fId of foodIds) {
            const existingId = existingMap.get(fId);
            if (existingId) {
                await db
                    .update(branchMenuItems)
                    .set({
                        stockType: targetStockType,
                        stockQty: targetStockQty,
                        updatedAt: new Date(),
                    })
                    .where(eq(branchMenuItems.id, existingId));
            } else {
                await db.insert(branchMenuItems).values({
                    id: uuidv4(),
                    branchId,
                    foodId: fId,
                    stockType: targetStockType,
                    stockQty: targetStockQty,
                    status: "active",
                });
            }
        }
    }

    // مسح الكاش
    try {
        if (branchId) {
            await redis.del(`admin:branch_menu:${branchId}`);
            const userCacheKey = `restaurant_details:${restaurantId}:branch:${branchId}`;
            await redis.del(userCacheKey);
        }
        const homeMenuKeys = await redis.keys("restaurant_details:*");
        if (homeMenuKeys.length > 0) await redis.del(...homeMenuKeys);
        const categoryKeys = await redis.keys("foods_category:*");
        if (categoryKeys.length > 0) await redis.del(...categoryKeys);
        const branchMenuKeys = await redis.keys("admin:branch_menu:*");
        if (branchMenuKeys.length > 0) await redis.del(...branchMenuKeys);
    } catch (e) {
        // Cache error is non-blocking
    }

    const targetLabel = subcategoryName
        ? `Subcategory "${subcategoryName}"`
        : "";

    const branchLabel = branchName ? ` in branch "${branchName}"` : "";

    return SuccessResponse(res, {
        message: `All ${targetFoods.length} products in ${targetLabel}${branchLabel} are now marked as ${
            isOutOfStock ? "out of stock" : "in stock"
        } (food.isOutOfStock = ${isOutOfStock})`,
        data: {
            subcategoryId: subcategoryId || null,
            branchId: branchId || null,
            isOutOfStock,
            updatedCount: targetFoods.length,
            affectedProductIds: foodIds,
        },
    });
};