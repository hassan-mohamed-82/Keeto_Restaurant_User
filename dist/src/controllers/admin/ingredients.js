"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFoodsByIngredient = exports.getallactiveingredientscategory = exports.getIngredientById = exports.deleteIngredient = exports.toggleIngredientStock = exports.updateIngredient = exports.getIngredients = exports.createIngredient = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const uuid_1 = require("uuid");
// =========================================================
// 🍓 القسم الثاني: CRUD للمكونات نفسها (Ingredients)
// =========================================================
// 1. Create - إضافة مكون جديد
const createIngredient = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const { name, categoryId } = req.body;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    if (!name || !categoryId)
        throw new BadRequest_1.BadRequest("Name and Category ID are required");
    const id = (0, uuid_1.v4)();
    await connection_1.db.insert(schema_1.ingredients).values({
        id,
        restaurantId,
        categoryId,
        name,
        inStock: true
    });
    return (0, response_1.SuccessResponse)(res, { message: "Ingredient created successfully", data: { id } }, 201);
};
exports.createIngredient = createIngredient;
// 2. Read - عرض كل المكونات 
const getIngredients = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const list = await connection_1.db.select({
        id: schema_1.ingredients.id,
        name: schema_1.ingredients.name,
        inStock: schema_1.ingredients.inStock,
        categoryId: schema_1.ingredients.categoryId,
        categoryName: schema_1.ingredientCategories.name
    })
        .from(schema_1.ingredients)
        .leftJoin(schema_1.ingredientCategories, (0, drizzle_orm_1.eq)(schema_1.ingredients.categoryId, schema_1.ingredientCategories.id))
        .where((0, drizzle_orm_1.eq)(schema_1.ingredients.restaurantId, restaurantId));
    return (0, response_1.SuccessResponse)(res, { data: list });
};
exports.getIngredients = getIngredients;
// 3. Update (Normal) - تعديل اسم المكون أو التصنيف بتاعه
const updateIngredient = async (req, res) => {
    const { id } = req.params;
    const { name, categoryId } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const updateData = { updatedAt: new Date() };
    if (name)
        updateData.name = name;
    if (categoryId)
        updateData.categoryId = categoryId;
    await connection_1.db.update(schema_1.ingredients)
        .set(updateData)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ingredients.id, id), (0, drizzle_orm_1.eq)(schema_1.ingredients.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, { message: "Ingredient updated successfully" });
};
exports.updateIngredient = updateIngredient;
// 4. Update (Magic/Toggle) - 🚨 زرار المخزون اللي بيقفل الأكل 
const toggleIngredientStock = async (req, res) => {
    const { id } = req.params;
    const { inStock } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (inStock === undefined)
        throw new BadRequest_1.BadRequest("inStock boolean is required");
    await connection_1.db.transaction(async (tx) => {
        // تحديث المكون نفسه
        await tx.update(schema_1.ingredients)
            .set({ inStock, updatedAt: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ingredients.id, id), (0, drizzle_orm_1.eq)(schema_1.ingredients.restaurantId, restaurantId)));
        // لو المكون خلص (false)، نقفل الأكل المربوط بيه
        if (inStock === false) {
            const relatedFoods = await tx.select({ foodId: schema_1.foodIngredients.foodId })
                .from(schema_1.foodIngredients)
                .where((0, drizzle_orm_1.eq)(schema_1.foodIngredients.ingredientId, id));
            const foodIdsToDisable = relatedFoods.map(f => f.foodId);
            if (foodIdsToDisable.length > 0) {
                await tx.update(schema_1.food)
                    .set({ status: "inactive" })
                    .where((0, drizzle_orm_1.inArray)(schema_1.food.id, foodIdsToDisable));
            }
        }
    });
    return (0, response_1.SuccessResponse)(res, { message: `Stock updated. Related products adjusted automatically.` });
};
exports.toggleIngredientStock = toggleIngredientStock;
// 5. Delete - مسح المكون نهائياً
const deleteIngredient = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    await connection_1.db.transaction(async (tx) => {
        // خطوة 1: لازم نمسح المكون من جدول الربط (الوصفات) الأول عشان نتجنب الـ Foreign Key Error
        await tx.delete(schema_1.foodIngredients).where((0, drizzle_orm_1.eq)(schema_1.foodIngredients.ingredientId, id));
        // خطوة 2: نمسح المكون نفسه
        await tx.delete(schema_1.ingredients)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ingredients.id, id), (0, drizzle_orm_1.eq)(schema_1.ingredients.restaurantId, restaurantId)));
    });
    return (0, response_1.SuccessResponse)(res, { message: "Ingredient and its recipe links deleted successfully" });
};
exports.deleteIngredient = deleteIngredient;
const getIngredientById = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const ingredient = await connection_1.db.select()
        .from(schema_1.ingredients)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ingredients.id, id), (0, drizzle_orm_1.eq)(schema_1.ingredients.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, { data: ingredient });
};
exports.getIngredientById = getIngredientById;
const getallactiveingredientscategory = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const categories = await connection_1.db.select()
        .from(schema_1.ingredientCategories)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ingredientCategories.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.ingredientCategories.status, "active")));
    return (0, response_1.SuccessResponse)(res, { data: categories });
};
exports.getallactiveingredientscategory = getallactiveingredientscategory;
const getFoodsByIngredient = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const relatedFoods = await connection_1.db.select({
        foodId: schema_1.food.id,
        foodName: schema_1.food.name,
        foodStatus: schema_1.food.status,
        isRemovable: schema_1.foodIngredients.isRemovable
    })
        .from(schema_1.foodIngredients)
        .innerJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.foodIngredients.foodId, schema_1.food.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.foodIngredients.ingredientId, id), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: "Fetched related foods successfully",
        count: relatedFoods.length,
        data: relatedFoods
    });
};
exports.getFoodsByIngredient = getFoodsByIngredient;
