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
    const { name, categoryId, priority, status, nameAr, nameFr } = req.body;
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
    // Check if subcategory already exists
    const existingSubcategory = await connection_1.db
        .select()
        .from(schema_1.subcategories)
        .where((0, drizzle_orm_1.eq)(schema_1.subcategories.name, name))
        .limit(1);
    if (existingSubcategory[0]) {
        throw new BadRequest_1.BadRequest("Subcategory already exists");
    }
    const id = (0, uuid_1.v4)();
    await connection_1.db.insert(schema_1.subcategories).values({
        id,
        name,
        nameAr,
        nameFr,
        categoryId,
        restaurantId: restaurantId,
        priority: priority || "low",
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
    const allSubcategories = await connection_1.db
        .select({
        id: schema_1.subcategories.id,
        name: schema_1.subcategories.name,
        nameAr: schema_1.subcategories.nameAr,
        nameFr: schema_1.subcategories.nameFr,
        categoryId: schema_1.subcategories.categoryId,
        priority: schema_1.subcategories.priority,
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
        .leftJoin(schema_1.categories, (0, drizzle_orm_1.eq)(schema_1.subcategories.categoryId, schema_1.categories.id));
    return (0, response_1.SuccessResponse)(res, { message: "Get all subcategories success", data: allSubcategories });
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
        priority: schema_1.subcategories.priority,
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
    return (0, response_1.SuccessResponse)(res, { message: "Get subcategory by id success", data: subcategory[0] });
};
exports.getSubcategoryById = getSubcategoryById;
const updateSubcategory = async (req, res) => {
    // 1. استخراج ID المطعم
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const { name, categoryId, priority, status, nameAr, nameFr } = req.body;
    // 2. التأكد إن الـ subcategory موجود ومملوك للمطعم ده
    const existingSubcategory = await connection_1.db
        .select()
        .from(schema_1.subcategories)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.subcategories.id, id), (0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId))) // التعديل هنا
        .limit(1);
    if (!existingSubcategory[0]) {
        throw new NotFound_1.NotFound("Subcategory not found or you don't have permission to edit it");
    }
    // التأكد إن القسم الأساسي موجود (إذا تم تمريره)
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
    if (priority)
        updateData.priority = priority;
    if (status)
        updateData.status = status;
    if (Object.keys(updateData).length === 1) {
        throw new BadRequest_1.BadRequest("No data to update");
    }
    // 3. التحديث بشرط أن يكون الـ ID خاص بنفس المطعم
    await connection_1.db.update(schema_1.subcategories)
        .set(updateData)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.subcategories.id, id), (0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId))); // التعديل هنا
    return (0, response_1.SuccessResponse)(res, { message: "Update subcategory success" });
};
exports.updateSubcategory = updateSubcategory;
const deleteSubcategory = async (req, res) => {
    // 1. استخراج ID المطعم
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    // 2. التأكد إن الـ subcategory موجود ومملوك للمطعم ده
    const existingSubcategory = await connection_1.db
        .select()
        .from(schema_1.subcategories)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.subcategories.id, id), (0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId))) // التعديل هنا
        .limit(1);
    if (!existingSubcategory[0]) {
        throw new NotFound_1.NotFound("Subcategory not found or you don't have permission to delete it");
    }
    // 3. الحذف بشرط أن يكون الـ ID خاص بنفس المطعم
    await connection_1.db.delete(schema_1.subcategories)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.subcategories.id, id), (0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId))); // التعديل هنا
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
