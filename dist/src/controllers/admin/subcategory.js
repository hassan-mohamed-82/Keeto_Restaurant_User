"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveSubcategoriesByBranch = exports.getSubcategoryBranchAvailability = exports.updateBranchSubcategoryStatus = exports.getallcategory = exports.deleteSubcategory = exports.updateSubcategory = exports.getSubcategoryById = exports.getAllSubcategories = exports.createSubcategory = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const NotFound_1 = require("../../Errors/NotFound");
const BadRequest_1 = require("../../Errors/BadRequest");
const uuid_1 = require("uuid");
const redis_1 = __importDefault(require("../../config/redis"));
const createSubcategory = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    // استقبلنا order_level و order_Level لدعم الحالتين
    const { name, categoryId, priority, status, nameAr, nameFr, addonsIds, order_level, order_Level } = req.body;
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
    await connection_1.db.insert(schema_1.subcategories).values({
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
    const { name, categoryId, priority, status, nameAr, nameFr, addonsIds, order_level, order_Level } = req.body;
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
    // مسح الكاش
    try {
        await redis_1.default.del(`admin:branch_menu:${branchId}`);
        const userCacheKey = `restaurant_details:${restaurantId}:branch:${branchId}`;
        await redis_1.default.del(userCacheKey);
    }
    catch (e) {
        // Cache error is non-blocking
    }
    return (0, response_1.SuccessResponse)(res, {
        message: `Subcategory "${sub.name}" is now ${newStatus} in branch "${branch.name}"`,
        data: {
            subcategoryId,
            branchId,
            status: newStatus,
            isAvailable: newStatus === "active",
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
