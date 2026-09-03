"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFoodRecipe = exports.assignIngredientsToFood = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const BadRequest_1 = require("../../Errors/BadRequest");
const NotFound_1 = require("../../Errors/NotFound");
const response_1 = require("../../utils/response");
// =========================================================
// 🍳 إدارة الوصفة (Recipe / Food Ingredients)
// =========================================================
const assignIngredientsToFood = async (req, res) => {
    const { id } = req.params;
    const { ingredientsList } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    if (!Array.isArray(ingredientsList))
        throw new BadRequest_1.BadRequest("ingredientsList must be an array");
    // 1. التأكد من وجود الوجبة وتبعيتا للمطعم
    const existingFood = await connection_1.db.select().from(schema_1.food).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, id), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId))).limit(1);
    if (!existingFood[0])
        throw new NotFound_1.NotFound("Food not found or does not belong to you");
    if (ingredientsList.length > 0) {
        // 2. فحص أمني: التأكد من أن جميع المكونات الممررة تنتمي لنفس المطعم
        const passedIngredientIds = ingredientsList.map((item) => item.ingredientId);
        const validIngredients = await connection_1.db
            .select({ id: schema_1.ingredients.id })
            .from(schema_1.ingredients)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.ingredients.id, passedIngredientIds), (0, drizzle_orm_1.eq)(schema_1.ingredients.restaurantId, restaurantId)));
        if (validIngredients.length !== passedIngredientIds.length) {
            throw new BadRequest_1.BadRequest("One or more ingredients are invalid or do not belong to this restaurant");
        }
    }
    // 3. مسح المكونات القديمة وإعادة إضافة المكونات الجديدة داخل Transaction
    await connection_1.db.transaction(async (tx) => {
        await tx.delete(schema_1.foodIngredients).where((0, drizzle_orm_1.eq)(schema_1.foodIngredients.foodId, id));
        if (ingredientsList.length > 0) {
            const valuesToInsert = ingredientsList.map((item) => ({
                foodId: id,
                ingredientId: item.ingredientId,
                isRemovable: item.isRemovable ?? false,
                isEssential: item.isEssential ?? true, // 👈 تم إضافة isEssential بالقيم الافتراضية الصحيحة
            }));
            await tx.insert(schema_1.foodIngredients).values(valuesToInsert);
        }
    });
    return (0, response_1.SuccessResponse)(res, { message: "Food recipe saved successfully" });
};
exports.assignIngredientsToFood = assignIngredientsToFood;
const getFoodRecipe = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const existingFood = await connection_1.db.select().from(schema_1.food).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, id), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId))).limit(1);
    if (!existingFood[0])
        throw new NotFound_1.NotFound("Food not found");
    const recipe = await connection_1.db.select({
        id: schema_1.foodIngredients.id,
        ingredientId: schema_1.ingredients.id,
        name: schema_1.ingredients.name,
        inStock: schema_1.ingredients.inStock,
        isRemovable: schema_1.foodIngredients.isRemovable,
        isEssential: schema_1.foodIngredients.isEssential,
        categoryName: schema_1.ingredientCategories.name
    })
        .from(schema_1.foodIngredients)
        .innerJoin(schema_1.ingredients, (0, drizzle_orm_1.eq)(schema_1.foodIngredients.ingredientId, schema_1.ingredients.id))
        .leftJoin(schema_1.ingredientCategories, (0, drizzle_orm_1.eq)(schema_1.ingredients.categoryId, schema_1.ingredientCategories.id))
        .where((0, drizzle_orm_1.eq)(schema_1.foodIngredients.foodId, id));
    return (0, response_1.SuccessResponse)(res, { message: "Get food recipe success", data: recipe });
};
exports.getFoodRecipe = getFoodRecipe;
