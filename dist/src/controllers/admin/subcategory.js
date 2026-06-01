"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getallcategory = exports.deleteSubcategory = exports.updateSubcategory = exports.getSubcategoryById = exports.getAllSubcategories = exports.createSubcategory = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const NotFound_1 = require("../../Errors/NotFound");
const BadRequest_1 = require("../../Errors/BadRequest");
const uuid_1 = require("uuid");
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
        order_Level: order_Level !== undefined ? order_Level : (order_level !== undefined ? order_level : 0), // ربط المتغير الجديد
        status: status || "active",
    });
    // ✅ نشر الأدونز على كل الأكل الموجود في الساب كاتيجوري
    if (addonsIds && Array.isArray(addonsIds) && addonsIds.length > 0) {
        await connection_1.db.update(schema_1.food)
            .set({ addonsId: addonsIds })
            .where((0, drizzle_orm_1.eq)(schema_1.food.subcategoryid, id));
    }
    return (0, response_1.SuccessResponse)(res, { message: "Create subcategory success", data: { id } }, 201);
};
exports.createSubcategory = createSubcategory;
const getAllSubcategories = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const allSubcategories = await connection_1.db
        .select({
        id: schema_1.subcategories.id,
        name: schema_1.subcategories.name,
        nameAr: schema_1.subcategories.nameAr,
        nameFr: schema_1.subcategories.nameFr,
        categoryId: schema_1.subcategories.categoryId,
        addonsIds: schema_1.subcategories.addonsIds,
        priority: schema_1.subcategories.priority,
        order_level: schema_1.subcategories.order_Level, // إرجاعه باسم order_level
        status: schema_1.subcategories.status,
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
        .where((0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId))
        .leftJoin(schema_1.categories, (0, drizzle_orm_1.eq)(schema_1.subcategories.categoryId, schema_1.categories.id))
        .orderBy((0, drizzle_orm_1.asc)(schema_1.subcategories.order_Level)); // الترتيب بناءً على orderLevel
    // Fetch all addons for this restaurant to map them
    const allAddons = await connection_1.db.select().from(schema_1.addons).where((0, drizzle_orm_1.eq)(schema_1.addons.restaurantid, restaurantId));
    const dataWithAddons = allSubcategories.map(sub => {
        const subAddons = sub.addonsIds && Array.isArray(sub.addonsIds)
            ? allAddons.filter(a => sub.addonsIds.includes(a.id))
            : [];
        return {
            ...sub,
            addons: subAddons
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
    const subcategory = await connection_1.db
        .select({
        id: schema_1.subcategories.id,
        name: schema_1.subcategories.name,
        nameAr: schema_1.subcategories.nameAr,
        nameFr: schema_1.subcategories.nameFr,
        categoryId: schema_1.subcategories.categoryId,
        addonsIds: schema_1.subcategories.addonsIds,
        priority: schema_1.subcategories.priority,
        order_level: schema_1.subcategories.order_Level, // إرجاعه باسم order_level
        status: schema_1.subcategories.status,
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
        .leftJoin(schema_1.categories, (0, drizzle_orm_1.eq)(schema_1.subcategories.categoryId, schema_1.categories.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.subcategories.id, id), (0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId)))
        .limit(1);
    if (!subcategory[0]) {
        throw new NotFound_1.NotFound("Subcategory not found");
    }
    const sub = subcategory[0];
    let subAddons = [];
    if (sub.addonsIds && Array.isArray(sub.addonsIds) && sub.addonsIds.length > 0) {
        subAddons = await connection_1.db
            .select()
            .from(schema_1.addons)
            .where((0, drizzle_orm_1.inArray)(schema_1.addons.id, sub.addonsIds));
    }
    const dataWithAddons = {
        ...sub,
        addons: subAddons
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
    // استقبال order_level
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
        updateData.order_Level = finalOrderLevel; // التحديث في حالة التمرير
    if (status)
        updateData.status = status;
    if (Object.keys(updateData).length === 1) {
        throw new BadRequest_1.BadRequest("No data to update");
    }
    await connection_1.db.update(schema_1.subcategories)
        .set(updateData)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.subcategories.id, id), (0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId)));
    // ✅ لو الأدونز اتغيرت، ننشرها على كل الأكل الموجود في الساب كاتيجوري
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
