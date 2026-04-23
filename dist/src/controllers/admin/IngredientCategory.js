"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIngredientCategoryById = exports.deleteIngredientCategory = exports.updateIngredientCategory = exports.getIngredientCategories = exports.createIngredientCategory = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const uuid_1 = require("uuid");
// =========================================================
// 📁 القسم الأول: CRUD لتصنيفات المكونات (Ingredient Categories)
// =========================================================
// 1. Create - إضافة تصنيف جديد
const createIngredientCategory = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const { name, status } = req.body;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    if (!name)
        throw new BadRequest_1.BadRequest("Category name is required");
    const id = (0, uuid_1.v4)();
    await connection_1.db.insert(schema_1.ingredientCategories).values({
        id,
        restaurantId,
        name,
        status: status || "active"
    });
    return (0, response_1.SuccessResponse)(res, { message: "Category created successfully", data: { id } }, 201);
};
exports.createIngredientCategory = createIngredientCategory;
// 2. Read - عرض كل التصنيفات للمطعم ده
const getIngredientCategories = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const categories = await connection_1.db.select()
        .from(schema_1.ingredientCategories)
        .where((0, drizzle_orm_1.eq)(schema_1.ingredientCategories.restaurantId, restaurantId));
    return (0, response_1.SuccessResponse)(res, { data: categories });
};
exports.getIngredientCategories = getIngredientCategories;
// 3. Update - تعديل اسم أو حالة التصنيف
const updateIngredientCategory = async (req, res) => {
    const { id } = req.params;
    const { name, status } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const updateData = { updatedAt: new Date() };
    if (name)
        updateData.name = name;
    if (status)
        updateData.status = status;
    await connection_1.db.update(schema_1.ingredientCategories)
        .set(updateData)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ingredientCategories.id, id), (0, drizzle_orm_1.eq)(schema_1.ingredientCategories.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, { message: "Category updated successfully" });
};
exports.updateIngredientCategory = updateIngredientCategory;
// 4. Delete - مسح التصنيف
const deleteIngredientCategory = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    // حماية: التأكد إن مفيش مكونات تابعة للتصنيف ده قبل ما نمسحه
    const existingIngredients = await connection_1.db.select().from(schema_1.ingredients).where((0, drizzle_orm_1.eq)(schema_1.ingredients.categoryId, id)).limit(1);
    if (existingIngredients.length > 0) {
        throw new BadRequest_1.BadRequest("Cannot delete this category because it contains active ingredients. Move or delete them first.");
    }
    await connection_1.db.delete(schema_1.ingredientCategories)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ingredientCategories.id, id), (0, drizzle_orm_1.eq)(schema_1.ingredientCategories.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, { message: "Category deleted successfully" });
};
exports.deleteIngredientCategory = deleteIngredientCategory;
const getIngredientCategoryById = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const category = await connection_1.db.select()
        .from(schema_1.ingredientCategories)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ingredientCategories.id, id), (0, drizzle_orm_1.eq)(schema_1.ingredientCategories.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, { data: category });
};
exports.getIngredientCategoryById = getIngredientCategoryById;
