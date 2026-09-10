"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateBranchSubcategoryOutOfStock = exports.getActiveSubcategoriesByBranch = exports.getSubcategoryBranchAvailability = exports.updateBranchSubcategoryStatus = exports.getallcategory = exports.deleteSubcategory = exports.updateSubcategory = exports.getSubcategoryById = exports.getAllSubcategories = exports.createSubcategory = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const NotFound_1 = require("../../Errors/NotFound");
const BadRequest_1 = require("../../Errors/BadRequest");
const uuid_1 = require("uuid");
const redis_1 = __importDefault(require("../../config/redis"));
const handleImages_1 = require("../../utils/handleImages");
const createSubcategory = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    // استقبلنا order_level و order_Level لدعم الحالتين
    const { name, categoryId, priority, status, nameAr, nameFr, image, addonsIds, order_level, order_Level } = req.body;
    if (!name || !categoryId) {
        throw new BadRequest_1.BadRequest("Subcategory name and category ID are required");
    }
    // Check if category exists
    const existingCategory = await connection_1.db
        .select()
        .from(schema_1.categories)
        .where((0, drizzle_orm_1.eq)(schema_1.categories.id, categoryId))
        .limit(1);
    if (!existingCategory[0]) {
        throw new BadRequest_1.BadRequest("Category not found");
    }
    // Validate addons
    if (addonsIds && Array.isArray(addonsIds) && addonsIds.length > 0) {
        const existingAddons = await connection_1.db
            .select({ id: schema_1.addons.id })
            .from(schema_1.addons)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.addons.restaurantid, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.addons.id, addonsIds)));
        if (existingAddons.length !== addonsIds.length) {
            throw new BadRequest_1.BadRequest("One or more Addon IDs are invalid or do not belong to this restaurant");
        }
    }
    const id = (0, uuid_1.v4)();
    const imageUrl = await (0, handleImages_1.handleImageUpdate)(req, undefined, image, "subcategories");
    await connection_1.db.insert(schema_1.subcategories).values({
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
    return (0, response_1.SuccessResponse)(res, { message: "Create subcategory success", data: { id } }, 201);
};
exports.createSubcategory = createSubcategory;
const getAllSubcategories = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const branchId = req.query.branchId?.trim() || req.user?.branchId || null;
    const categoryId = req.query.categoryId?.trim() || null;
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId)];
    if (categoryId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.subcategories.categoryId, categoryId));
    }
    let query = connection_1.db
        .select({
        id: schema_1.subcategories.id,
        name: schema_1.subcategories.name,
        nameAr: schema_1.subcategories.nameAr,
        nameFr: schema_1.subcategories.nameFr,
        image: schema_1.subcategories.image,
        categoryId: schema_1.subcategories.categoryId,
        addonsIds: schema_1.subcategories.addonsIds,
        priority: schema_1.subcategories.priority,
        order_level: schema_1.subcategories.order_Level,
        status: schema_1.subcategories.status,
        branchStatus: branchId ? schema_1.branchSubcategories.status : (0, drizzle_orm_1.sql) `NULL`,
        effectiveStatus: branchId
            ? (0, drizzle_orm_1.sql) `COALESCE(${schema_1.branchSubcategories.status}, ${schema_1.subcategories.status})`
            : schema_1.subcategories.status,
        createdAt: schema_1.subcategories.createdAt,
        updatedAt: schema_1.subcategories.updatedAt,
        category: {
            id: schema_1.categories.id,
            name: schema_1.categories.name,
            nameAr: schema_1.categories.nameAr,
            nameFr: schema_1.categories.nameFr,
            status: schema_1.categories.status,
        },
    })
        .from(schema_1.subcategories)
        .leftJoin(schema_1.categories, (0, drizzle_orm_1.eq)(schema_1.subcategories.categoryId, schema_1.categories.id));
    if (branchId) {
        query = query.leftJoin(schema_1.branchSubcategories, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchSubcategories.subcategoryId, schema_1.subcategories.id), (0, drizzle_orm_1.eq)(schema_1.branchSubcategories.branchId, branchId)));
    }
    const allSubcategories = await query
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.asc)(schema_1.subcategories.order_Level));
    // Fetch all addons for this restaurant to map them
    const allAddons = await connection_1.db.select().from(schema_1.addons).where((0, drizzle_orm_1.eq)(schema_1.addons.restaurantid, restaurantId));
    const dataWithAddons = allSubcategories.map((sub) => {
        let parsedAddonsIds = sub.addonsIds;
        if (typeof sub.addonsIds === 'string') {
            try {
                parsedAddonsIds = JSON.parse(sub.addonsIds);
            }
            catch (e) {
                parsedAddonsIds = [];
            }
        }
        const subAddons = parsedAddonsIds && Array.isArray(parsedAddonsIds)
            ? allAddons.filter(a => parsedAddonsIds.includes(a.id))
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
    return (0, response_1.SuccessResponse)(res, { message: "Get all subcategories success", data: dataWithAddons });
};
exports.getAllSubcategories = getAllSubcategories;
const getSubcategoryById = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const branchId = req.query.branchId?.trim() || req.user?.branchId || null;
    let query = connection_1.db
        .select({
        id: schema_1.subcategories.id,
        name: schema_1.subcategories.name,
        nameAr: schema_1.subcategories.nameAr,
        nameFr: schema_1.subcategories.nameFr,
        image: schema_1.subcategories.image,
        categoryId: schema_1.subcategories.categoryId,
        addonsIds: schema_1.subcategories.addonsIds,
        priority: schema_1.subcategories.priority,
        order_level: schema_1.subcategories.order_Level,
        status: schema_1.subcategories.status,
        branchStatus: branchId ? schema_1.branchSubcategories.status : (0, drizzle_orm_1.sql) `NULL`,
        effectiveStatus: branchId
            ? (0, drizzle_orm_1.sql) `COALESCE(${schema_1.branchSubcategories.status}, ${schema_1.subcategories.status})`
            : schema_1.subcategories.status,
        createdAt: schema_1.subcategories.createdAt,
        updatedAt: schema_1.subcategories.updatedAt,
        category: {
            id: schema_1.categories.id,
            name: schema_1.categories.name,
            nameAr: schema_1.categories.nameAr,
            nameFr: schema_1.categories.nameFr,
            status: schema_1.categories.status,
        },
    })
        .from(schema_1.subcategories)
        .leftJoin(schema_1.categories, (0, drizzle_orm_1.eq)(schema_1.subcategories.categoryId, schema_1.categories.id));
    if (branchId) {
        query = query.leftJoin(schema_1.branchSubcategories, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchSubcategories.subcategoryId, schema_1.subcategories.id), (0, drizzle_orm_1.eq)(schema_1.branchSubcategories.branchId, branchId)));
    }
    const [sub] = await query
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.subcategories.id, id), (0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId)))
        .limit(1);
    if (!sub) {
        throw new NotFound_1.NotFound("Subcategory not found");
    }
    let parsedAddonsIds = sub.addonsIds;
    if (typeof sub.addonsIds === 'string') {
        try {
            parsedAddonsIds = JSON.parse(sub.addonsIds);
        }
        catch (e) {
            parsedAddonsIds = [];
        }
    }
    let subAddons = [];
    if (parsedAddonsIds && Array.isArray(parsedAddonsIds) && parsedAddonsIds.length > 0) {
        subAddons = await connection_1.db
            .select()
            .from(schema_1.addons)
            .where((0, drizzle_orm_1.inArray)(schema_1.addons.id, parsedAddonsIds));
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
    return (0, response_1.SuccessResponse)(res, { message: "Get subcategory by id success", data: dataWithAddons });
};
exports.getSubcategoryById = getSubcategoryById;
const updateSubcategory = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const { name, categoryId, priority, status, nameAr, nameFr, image, addonsIds, order_level, order_Level } = req.body;
    const existingSubcategory = await connection_1.db
        .select()
        .from(schema_1.subcategories)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.subcategories.id, id), (0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId)))
        .limit(1);
    if (!existingSubcategory[0]) {
        throw new NotFound_1.NotFound("Subcategory not found or you don't have permission to edit it");
    }
    if (categoryId) {
        const existingCategory = await connection_1.db
            .select()
            .from(schema_1.categories)
            .where((0, drizzle_orm_1.eq)(schema_1.categories.id, categoryId))
            .limit(1);
        if (!existingCategory[0]) {
            throw new BadRequest_1.BadRequest("Category not found");
        }
    }
    if (addonsIds && Array.isArray(addonsIds) && addonsIds.length > 0) {
        const existingAddons = await connection_1.db
            .select({ id: schema_1.addons.id })
            .from(schema_1.addons)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.addons.restaurantid, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.addons.id, addonsIds)));
        if (existingAddons.length !== addonsIds.length) {
            throw new BadRequest_1.BadRequest("One or more Addon IDs are invalid or do not belong to this restaurant");
        }
    }
    const updateData = {
        updatedAt: new Date(),
    };
    if (name)
        updateData.name = name;
    if (nameAr !== undefined)
        updateData.nameAr = nameAr;
    if (nameFr !== undefined)
        updateData.nameFr = nameFr;
    if (image !== undefined) {
        updateData.image = await (0, handleImages_1.handleImageUpdate)(req, existingSubcategory[0].image, image, "subcategories");
    }
    if (categoryId)
        updateData.categoryId = categoryId;
    if (addonsIds !== undefined)
        updateData.addonsIds = addonsIds;
    if (priority)
        updateData.priority = priority;
    const finalOrderLevel = order_Level !== undefined ? order_Level : order_level;
    if (finalOrderLevel !== undefined)
        updateData.order_Level = finalOrderLevel;
    if (status)
        updateData.status = status;
    if (Object.keys(updateData).length === 1) {
        throw new BadRequest_1.BadRequest("No data to update");
    }
    await connection_1.db.update(schema_1.subcategories)
        .set(updateData)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.subcategories.id, id), (0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId)));
    if (addonsIds !== undefined) {
        await connection_1.db.update(schema_1.food)
            .set({ addonsId: addonsIds })
            .where((0, drizzle_orm_1.eq)(schema_1.food.subcategoryid, id));
    }
    return (0, response_1.SuccessResponse)(res, { message: "Update subcategory success" });
};
exports.updateSubcategory = updateSubcategory;
const deleteSubcategory = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const existingSubcategory = await connection_1.db
        .select()
        .from(schema_1.subcategories)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.subcategories.id, id), (0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId)))
        .limit(1);
    if (!existingSubcategory[0]) {
        throw new NotFound_1.NotFound("Subcategory not found or you don't have permission to delete it");
    }
    await connection_1.db.delete(schema_1.subcategories)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.subcategories.id, id), (0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, { message: "Delete subcategory success" });
};
exports.deleteSubcategory = deleteSubcategory;
const getallcategory = async (req, res) => {
    const allCategories = await connection_1.db
        .select({
        id: schema_1.categories.id,
        name: schema_1.categories.name,
    })
        .from(schema_1.categories)
        .where((0, drizzle_orm_1.eq)(schema_1.categories.status, "active"));
    return (0, response_1.SuccessResponse)(res, { message: "Get all categories success", data: allCategories });
};
exports.getallcategory = getallcategory;
// ============================================================================
// 1. فتح أو قفل التصنيف الفرعي في فرع معين (Toggle / Update Branch Status)
// PATCH /subcategories/:id/branch/:branchId/status
// Body: { status?: "active" | "inactive" } (اختياري، لو غير ممرر يقوم بعمل Toggle)
// ============================================================================
const updateBranchSubcategoryStatus = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const userBranchId = req.user?.branchId;
    const { id: subcategoryId, branchId } = req.params;
    const { status } = req.body;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant context is missing or unauthorized");
    if (!subcategoryId || !branchId)
        throw new BadRequest_1.BadRequest("subcategoryId and branchId are required");
    if (userBranchId && userBranchId !== branchId) {
        throw new BadRequest_1.BadRequest("Unauthorized: You cannot manage another branch's status");
    }
    // التأكد من أن الفرع يتبع المطعم
    const [branch] = await connection_1.db
        .select({ id: schema_1.branches.id, name: schema_1.branches.name })
        .from(schema_1.branches)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.id, branchId), (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId)))
        .limit(1);
    if (!branch)
        throw new NotFound_1.NotFound("Branch not found or does not belong to your restaurant");
    // التأكد من وجود الـ subcategory
    const [sub] = await connection_1.db
        .select({ id: schema_1.subcategories.id, name: schema_1.subcategories.name, status: schema_1.subcategories.status })
        .from(schema_1.subcategories)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.subcategories.id, subcategoryId), (0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId)))
        .limit(1);
    if (!sub)
        throw new NotFound_1.NotFound("Subcategory not found or does not belong to your restaurant");
    // فحص السجل الحالي للفرع
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.branchSubcategories)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchSubcategories.branchId, branchId), (0, drizzle_orm_1.eq)(schema_1.branchSubcategories.subcategoryId, subcategoryId)))
        .limit(1);
    let newStatus;
    if (status && (status === "active" || status === "inactive")) {
        newStatus = status;
    }
    else {
        const currentStatus = existing ? existing.status : (sub.status || "active");
        newStatus = currentStatus === "active" ? "inactive" : "active";
    }
    if (existing) {
        await connection_1.db
            .update(schema_1.branchSubcategories)
            .set({ status: newStatus, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.branchSubcategories.id, existing.id));
    }
    else {
        await connection_1.db.insert(schema_1.branchSubcategories).values({
            id: (0, uuid_1.v4)(),
            branchId,
            subcategoryId,
            status: newStatus,
        });
    }
    // 🟢 مزامنة حالة كل منتجات هذا الـ subcategory داخل الفرع
    const subcategoryFoods = await connection_1.db
        .select({
        id: schema_1.food.id,
        status: schema_1.food.status, // الحالة العامة في جدول food
    })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.subcategoryid, subcategoryId), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)));
    if (subcategoryFoods.length > 0) {
        const foodIds = subcategoryFoods.map((f) => f.id);
        const existingBranchItems = await connection_1.db
            .select({
            id: schema_1.branchMenuItems.id,
            foodId: schema_1.branchMenuItems.foodId,
            status: schema_1.branchMenuItems.status,
        })
            .from(schema_1.branchMenuItems)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.branchId, branchId), (0, drizzle_orm_1.inArray)(schema_1.branchMenuItems.foodId, foodIds)));
        const existingMap = new Map(existingBranchItems.map((item) => [item.foodId, item]));
        if (newStatus === "inactive") {
            // تحويل كل المنتجات إلى inactive في هذا الفرع
            for (const f of subcategoryFoods) {
                const existingItem = existingMap.get(f.id);
                if (existingItem) {
                    await connection_1.db
                        .update(schema_1.branchMenuItems)
                        .set({ status: "inactive", updatedAt: new Date() })
                        .where((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.id, existingItem.id));
                }
                else {
                    await connection_1.db.insert(schema_1.branchMenuItems).values({
                        id: (0, uuid_1.v4)(),
                        branchId,
                        foodId: f.id,
                        status: "inactive",
                    });
                }
            }
        }
        else {
            // عند التفعيل: المنتجات النشطة فقط في الكتالوج الرئيسي تُفعل، والمنتج غير النشط لا يُغير
            for (const f of subcategoryFoods) {
                if (f.status === "active") {
                    const existingItem = existingMap.get(f.id);
                    if (existingItem) {
                        await connection_1.db
                            .update(schema_1.branchMenuItems)
                            .set({ status: "active", updatedAt: new Date() })
                            .where((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.id, existingItem.id));
                    }
                }
            }
        }
    }
    // مسح الكاش
    try {
        await redis_1.default.del(`admin:branch_menu:${branchId}`);
        const userCacheKey = `restaurant_details:${restaurantId}:branch:${branchId}`;
        await redis_1.default.del(userCacheKey);
        const homeMenuKeys = await redis_1.default.keys("restaurant_details:*");
        if (homeMenuKeys.length > 0)
            await redis_1.default.del(...homeMenuKeys);
        const categoryKeys = await redis_1.default.keys("foods_category:*");
        if (categoryKeys.length > 0)
            await redis_1.default.del(...categoryKeys);
    }
    catch (e) {
        // Cache error is non-blocking
    }
    return (0, response_1.SuccessResponse)(res, {
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
exports.updateBranchSubcategoryStatus = updateBranchSubcategoryStatus;
// ============================================================================
// 2. إرجاع حالة التصنيف الفرعي في جميع فروع المطعم (Subcategory Branch Availability)
// GET /subcategories/:id/branches-availability
// ============================================================================
const getSubcategoryBranchAvailability = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const { id: subcategoryId } = req.params;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant context is missing or unauthorized");
    if (!subcategoryId)
        throw new BadRequest_1.BadRequest("Subcategory ID is required");
    // التأكد من وجود الـ Subcategory
    const [sub] = await connection_1.db
        .select({
        id: schema_1.subcategories.id,
        name: schema_1.subcategories.name,
        nameAr: schema_1.subcategories.nameAr,
        nameFr: schema_1.subcategories.nameFr,
        image: schema_1.subcategories.image,
        status: schema_1.subcategories.status,
        categoryId: schema_1.subcategories.categoryId,
    })
        .from(schema_1.subcategories)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.subcategories.id, subcategoryId), (0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId)))
        .limit(1);
    if (!sub)
        throw new NotFound_1.NotFound("Subcategory not found or does not belong to your restaurant");
    // جلب جميع فروع المطعم النشطة
    const allBranches = await connection_1.db
        .select({
        id: schema_1.branches.id,
        name: schema_1.branches.name,
        nameAr: schema_1.branches.nameAr,
        nameFr: schema_1.branches.nameFr,
        status: schema_1.branches.status,
    })
        .from(schema_1.branches)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.branches.status, "active")));
    // جلب سجلات تخصيص الفرع لهذا الـ Subcategory
    const overrides = await connection_1.db
        .select({
        branchId: schema_1.branchSubcategories.branchId,
        status: schema_1.branchSubcategories.status,
    })
        .from(schema_1.branchSubcategories)
        .where((0, drizzle_orm_1.eq)(schema_1.branchSubcategories.subcategoryId, subcategoryId));
    const overrideMap = new Map(overrides.map((o) => [o.branchId, o.status]));
    const branchList = allBranches.map((b) => {
        const branchStatus = overrideMap.has(b.id)
            ? overrideMap.get(b.id)
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
    return (0, response_1.SuccessResponse)(res, {
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
exports.getSubcategoryBranchAvailability = getSubcategoryBranchAvailability;
// ============================================================================
// 3. جلب التصنيفات الفرعية المفتوحة والنشطة فقط لفرع معين
// GET /subcategories/branch/:branchId/active
// ============================================================================
const getActiveSubcategoriesByBranch = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const { branchId } = req.params;
    const categoryId = req.query.categoryId?.trim() || null;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant context is missing or unauthorized");
    if (!branchId)
        throw new BadRequest_1.BadRequest("Branch ID is required");
    const conditions = [
        (0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId),
        (0, drizzle_orm_1.eq)(schema_1.subcategories.status, "active"),
    ];
    if (categoryId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.subcategories.categoryId, categoryId));
    }
    const rows = await connection_1.db
        .select({
        id: schema_1.subcategories.id,
        name: schema_1.subcategories.name,
        nameAr: schema_1.subcategories.nameAr,
        nameFr: schema_1.subcategories.nameFr,
        image: schema_1.subcategories.image,
        categoryId: schema_1.subcategories.categoryId,
        addonsIds: schema_1.subcategories.addonsIds,
        priority: schema_1.subcategories.priority,
        order_level: schema_1.subcategories.order_Level,
        status: schema_1.subcategories.status,
        branchStatus: schema_1.branchSubcategories.status,
    })
        .from(schema_1.subcategories)
        .leftJoin(schema_1.branchSubcategories, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchSubcategories.subcategoryId, schema_1.subcategories.id), (0, drizzle_orm_1.eq)(schema_1.branchSubcategories.branchId, branchId)))
        .where((0, drizzle_orm_1.and)(...conditions, (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(schema_1.branchSubcategories.id), (0, drizzle_orm_1.eq)(schema_1.branchSubcategories.status, "active"))))
        .orderBy((0, drizzle_orm_1.asc)(schema_1.subcategories.order_Level));
    return (0, response_1.SuccessResponse)(res, {
        message: "Active subcategories for branch fetched successfully",
        data: rows,
    });
};
exports.getActiveSubcategoriesByBranch = getActiveSubcategoriesByBranch;
// ============================================================================
// 4. جعل كل منتجات التصنيف الفرعي / الرئيسي Out of Stock
// PUT /subcategories/:id/branch/:branchId/out-of-stock
// PUT /subcategories/:id/out-of-stock
// Body: { isOutOfStock?: boolean } (Default: true)
// ============================================================================
const updateBranchSubcategoryOutOfStock = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const userBranchId = req.user?.branchId;
    const subcategoryId = req.params.id || req.params.subcategoryId || req.body?.subcategoryId || req.query?.subcategoryId;
    const branchId = req.params.branchId || req.body?.branchId || req.query?.branchId || userBranchId;
    const isOutOfStock = req.body?.isOutOfStock !== undefined ? Boolean(req.body.isOutOfStock) : true;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant context is missing or unauthorized");
    if (!subcategoryId) {
        throw new BadRequest_1.BadRequest("subcategoryId is required");
    }
    if (branchId && userBranchId && userBranchId !== branchId) {
        throw new BadRequest_1.BadRequest("Unauthorized: You cannot manage another branch's stock");
    }
    let branchName = "";
    if (branchId) {
        const [branch] = await connection_1.db
            .select({ id: schema_1.branches.id, name: schema_1.branches.name })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.id, branchId), (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId)))
            .limit(1);
        if (!branch)
            throw new NotFound_1.NotFound("Branch not found or does not belong to your restaurant");
        branchName = branch.name;
    }
    let subcategoryName = "";
    if (subcategoryId) {
        const [sub] = await connection_1.db
            .select({ id: schema_1.subcategories.id, name: schema_1.subcategories.name })
            .from(schema_1.subcategories)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.subcategories.id, subcategoryId), (0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId)))
            .limit(1);
        if (!sub)
            throw new NotFound_1.NotFound("Subcategory not found or does not belong to your restaurant");
        subcategoryName = sub.name;
    }
    // بناء شروط البحث عن المنتجات
    const foodConditions = [(0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)];
    if (subcategoryId)
        foodConditions.push((0, drizzle_orm_1.eq)(schema_1.food.subcategoryid, subcategoryId));
    const targetFoods = await connection_1.db
        .select({
        id: schema_1.food.id,
        name: schema_1.food.name,
        isOutOfStock: schema_1.food.isOutOfStock,
    })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)(...foodConditions));
    if (targetFoods.length === 0) {
        return (0, response_1.SuccessResponse)(res, {
            message: "No foods found for the specified subcategory/category",
            data: { updatedCount: 0, isOutOfStock },
        });
    }
    const foodIds = targetFoods.map((f) => f.id);
    // 1. تحديث حقل isOutOfStock في جدول food (food.isOutOfStock = true / false)
    await connection_1.db
        .update(schema_1.food)
        .set({
        isOutOfStock,
        updatedAt: new Date(),
    })
        .where((0, drizzle_orm_1.and)(...foodConditions));
    // 2. تحديث الـ stored flag مباشرة على جدول subcategories (global)
    await connection_1.db
        .update(schema_1.subcategories)
        .set({ isOutOfStock, updatedAt: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.subcategories.id, subcategoryId));
    // 3. إذا تم تحديد فرع، نحدث branchSubcategories.isOutOfStock + branch_menu_items stock
    if (branchId) {
        // 3a. Upsert branchSubcategories.isOutOfStock
        const [existingBranchSub] = await connection_1.db
            .select({ id: schema_1.branchSubcategories.id })
            .from(schema_1.branchSubcategories)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchSubcategories.subcategoryId, subcategoryId), (0, drizzle_orm_1.eq)(schema_1.branchSubcategories.branchId, branchId)))
            .limit(1);
        if (existingBranchSub) {
            await connection_1.db
                .update(schema_1.branchSubcategories)
                .set({ isOutOfStock, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema_1.branchSubcategories.id, existingBranchSub.id));
        }
        else {
            await connection_1.db.insert(schema_1.branchSubcategories).values({
                id: (0, uuid_1.v4)(),
                branchId,
                subcategoryId,
                isOutOfStock,
            });
        }
        // 3b. Update branch_menu_items stock for each food
        const existingBranchItems = await connection_1.db
            .select({ id: schema_1.branchMenuItems.id, foodId: schema_1.branchMenuItems.foodId })
            .from(schema_1.branchMenuItems)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.branchId, branchId), (0, drizzle_orm_1.inArray)(schema_1.branchMenuItems.foodId, foodIds)));
        const existingMap = new Map(existingBranchItems.map((item) => [item.foodId, item.id]));
        const targetStockType = isOutOfStock ? "limited" : "unlimited";
        const targetStockQty = isOutOfStock ? 0 : (req.body?.stockQty ?? 0);
        for (const fId of foodIds) {
            const existingId = existingMap.get(fId);
            if (existingId) {
                await connection_1.db
                    .update(schema_1.branchMenuItems)
                    .set({
                    stockType: targetStockType,
                    stockQty: targetStockQty,
                    updatedAt: new Date(),
                })
                    .where((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.id, existingId));
            }
            else {
                await connection_1.db.insert(schema_1.branchMenuItems).values({
                    id: (0, uuid_1.v4)(),
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
            await redis_1.default.del(`admin:branch_menu:${branchId}`);
            const userCacheKey = `restaurant_details:${restaurantId}:branch:${branchId}`;
            await redis_1.default.del(userCacheKey);
        }
        const homeMenuKeys = await redis_1.default.keys("restaurant_details:*");
        if (homeMenuKeys.length > 0)
            await redis_1.default.del(...homeMenuKeys);
        const categoryKeys = await redis_1.default.keys("foods_category:*");
        if (categoryKeys.length > 0)
            await redis_1.default.del(...categoryKeys);
        const branchMenuKeys = await redis_1.default.keys("admin:branch_menu:*");
        if (branchMenuKeys.length > 0)
            await redis_1.default.del(...branchMenuKeys);
    }
    catch (e) {
        // Cache error is non-blocking
    }
    const targetLabel = subcategoryName
        ? `Subcategory "${subcategoryName}"`
        : "";
    const branchLabel = branchName ? ` in branch "${branchName}"` : "";
    return (0, response_1.SuccessResponse)(res, {
        message: `All ${targetFoods.length} products in ${targetLabel}${branchLabel} are now marked as ${isOutOfStock ? "out of stock" : "in stock"} (food.isOutOfStock = ${isOutOfStock})`,
        data: {
            subcategoryId: subcategoryId || null,
            branchId: branchId || null,
            isOutOfStock,
            updatedCount: targetFoods.length,
            affectedProductIds: foodIds,
        },
    });
};
exports.updateBranchSubcategoryOutOfStock = updateBranchSubcategoryOutOfStock;
