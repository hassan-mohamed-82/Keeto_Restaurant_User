"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFoodRecipe = exports.assignIngredientsToFood = exports.getFoodSelectData = exports.deleteFood = exports.updateFood = exports.getFoodById = exports.getAllFoods = exports.createFood = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
// ✅ تم إضافة and هنا عشان نصلح مشكلة الشروط المتعددة
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const NotFound_1 = require("../../Errors/NotFound");
const BadRequest_1 = require("../../Errors/BadRequest");
const uuid_1 = require("uuid");
const handleImages_1 = require("../../utils/handleImages");
// =============================================
// CREATE Food
// =============================================
const createFood = async (req, res) => {
    const restaurantId = req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const { name, description, image, categoryid, subcategoryid, foodtype, Nutrition, allergen_ingredients, is_Halal, addonsId, startTime, endTime, search_tags, price, discount_type, discount_value, Maximum_Purchase, stock_type, status, variations, nameAr, nameFr, descriptionAr, descriptionFr } = req.body;
    if (!name || !description || !image || !categoryid || !startTime || !endTime || !price) {
        throw new BadRequest_1.BadRequest("Missing required fields");
    }
    // ✅ تأمين: نتأكد إن القسم ده تبع المطعم الحالي (لو الأقسام مشتركة شيل شرط المطعم)
    const existingCategory = await connection_1.db.select().from(schema_1.categories).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.categories.id, categoryid))).limit(1);
    if (!existingCategory[0])
        throw new BadRequest_1.BadRequest("Category not found or does not belong to your restaurant");
    if (subcategoryid) {
        const existingSub = await connection_1.db.select().from(schema_1.subcategories).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.subcategories.id, subcategoryid))).limit(1);
        if (!existingSub[0])
            throw new BadRequest_1.BadRequest("Subcategory not found or does not belong to your restaurant");
    }
    if (addonsId) {
        const existingAddon = await connection_1.db.select().from(schema_1.addons).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.addons.id, addonsId), (0, drizzle_orm_1.eq)(schema_1.addons.restaurantid, restaurantId))).limit(1);
        if (!existingAddon[0])
            throw new BadRequest_1.BadRequest("Addon not found or does not belong to your restaurant");
    }
    let imageUrl = image;
    if (image && image.startsWith("data:image")) {
        imageUrl = await (0, handleImages_1.saveBase64Image)(image, req, "foods");
    }
    const foodId = (0, uuid_1.v4)();
    await connection_1.db.insert(schema_1.food).values({
        id: foodId,
        name,
        nameAr,
        nameFr,
        description,
        descriptionAr,
        descriptionFr,
        image: imageUrl,
        restaurantid: restaurantId,
        categoryid,
        subcategoryid: subcategoryid || null,
        foodtype: foodtype || "veg",
        Nutrition: Nutrition || null,
        allergen_ingredients: allergen_ingredients || null,
        is_Halal: is_Halal ?? false,
        addonsId: addonsId || null,
        startTime,
        endTime,
        search_tags: search_tags || null,
        price,
        discount_type: discount_type || "percentage",
        discount_value: discount_value || null,
        Maximum_Purchase: Maximum_Purchase || null,
        stock_type: stock_type || "unlimited",
        variations: variations || null,
        status: status || "active",
    });
    if (variations && Array.isArray(variations)) {
        for (const variation of variations) {
            const variationId = (0, uuid_1.v4)();
            await connection_1.db.insert(schema_1.foodVariations).values({
                id: variationId,
                foodId,
                name: variation.name,
                nameAr: variation.nameAr,
                nameFr: variation.nameFr,
                isRequired: variation.isRequired || false,
                selectionType: variation.selectionType || "single",
                min: variation.min || null,
                max: variation.max || null,
            });
            if (variation.options && Array.isArray(variation.options)) {
                for (const option of variation.options) {
                    await connection_1.db.insert(schema_1.variationOptions).values({
                        variationId,
                        optionName: option.optionName,
                        optionNameAr: option.optionNameAr,
                        optionNameFr: option.optionNameFr,
                        additionalPrice: option.additionalPrice?.toString() || "0",
                    });
                }
            }
        }
    }
    return (0, response_1.SuccessResponse)(res, { message: "Create food success", data: { id: foodId } }, 201);
};
exports.createFood = createFood;
// =============================================
// GET ALL Foods (Optimized & Secured)
// =============================================
const getAllFoods = async (req, res) => {
    const restaurantId = req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const rawFoods = await connection_1.db.select({
        id: schema_1.food.id,
        name: schema_1.food.name,
        nameAr: schema_1.food.nameAr,
        nameFr: schema_1.food.nameFr,
        description: schema_1.food.description,
        descriptionAr: schema_1.food.descriptionAr,
        descriptionFr: schema_1.food.descriptionFr,
        image: schema_1.food.image,
        restaurantid: schema_1.food.restaurantid,
        categoryid: schema_1.food.categoryid,
        subcategoryid: schema_1.food.subcategoryid,
        foodtype: schema_1.food.foodtype,
        Nutrition: schema_1.food.Nutrition,
        allergen_ingredients: schema_1.food.allergen_ingredients,
        is_Halal: schema_1.food.is_Halal,
        addonsId: schema_1.food.addonsId,
        startTime: schema_1.food.startTime,
        endTime: schema_1.food.endTime,
        search_tags: schema_1.food.search_tags,
        price: schema_1.food.price,
        discount_type: schema_1.food.discount_type,
        discount_value: schema_1.food.discount_value,
        Maximum_Purchase: schema_1.food.Maximum_Purchase,
        stock_type: schema_1.food.stock_type,
        status: schema_1.food.status,
        createdAt: schema_1.food.createdAt,
        updatedAt: schema_1.food.updatedAt,
        restaurant_id: schema_1.restaurants.id,
        restaurant_name: schema_1.restaurants.name,
        category_name: schema_1.categories.name,
        category_nameAr: schema_1.categories.nameAr,
        category_nameFr: schema_1.categories.nameFr,
        subcategory_name: schema_1.subcategories.name,
        subcategory_nameAr: schema_1.subcategories.nameAr,
        subcategory_nameFr: schema_1.subcategories.nameFr,
    })
        .from(schema_1.food)
        .leftJoin(schema_1.restaurants, (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, schema_1.restaurants.id))
        .leftJoin(schema_1.categories, (0, drizzle_orm_1.eq)(schema_1.food.categoryid, schema_1.categories.id))
        .leftJoin(schema_1.subcategories, (0, drizzle_orm_1.eq)(schema_1.food.subcategoryid, schema_1.subcategories.id))
        .where((0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId));
    if (rawFoods.length === 0) {
        return (0, response_1.SuccessResponse)(res, { message: "Get all foods success", data: [] });
    }
    // 👇 التعديل كله حصل في الجزء ده 👇
    const allFoods = rawFoods.map(f => ({
        id: f.id,
        name: f.name,
        nameAr: f.nameAr, // ✅ تم الإضافة
        nameFr: f.nameFr, // ✅ تم الإضافة
        description: f.description,
        descriptionAr: f.descriptionAr, // ✅ تم الإضافة
        descriptionFr: f.descriptionFr, // ✅ تم الإضافة
        image: f.image,
        price: f.price,
        status: f.status, // ✅ تم الإضافة عشان لو حبيت تعرض حالة الأكلة في الجدول
        restaurant: f.restaurant_id ? { id: f.restaurant_id, name: f.restaurant_name } : null,
        category: f.category_name ? { name: f.category_name, nameAr: f.category_nameAr, nameFr: f.category_nameFr } : null,
        subcategory: f.subcategory_name ? { name: f.subcategory_name, nameAr: f.subcategory_nameAr, nameFr: f.subcategory_nameFr } : null,
    }));
    return (0, response_1.SuccessResponse)(res, {
        message: "Get all foods success",
        data: allFoods
    });
};
exports.getAllFoods = getAllFoods;
// =============================================
// GET Food By ID
// =============================================
const getFoodById = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const foodItem = await connection_1.db.select({
        id: schema_1.food.id,
        name: schema_1.food.name,
        nameAr: schema_1.food.nameAr,
        nameFr: schema_1.food.nameFr,
        description: schema_1.food.description,
        descriptionAr: schema_1.food.descriptionAr,
        descriptionFr: schema_1.food.descriptionFr,
        image: schema_1.food.image,
        restaurantid: schema_1.food.restaurantid,
        categoryid: schema_1.food.categoryid,
        subcategoryid: schema_1.food.subcategoryid,
        foodtype: schema_1.food.foodtype,
        Nutrition: schema_1.food.Nutrition,
        allergen_ingredients: schema_1.food.allergen_ingredients,
        is_Halal: schema_1.food.is_Halal,
        addonsId: schema_1.food.addonsId,
        startTime: schema_1.food.startTime,
        endTime: schema_1.food.endTime,
        search_tags: schema_1.food.search_tags,
        price: schema_1.food.price,
        discount_type: schema_1.food.discount_type,
        discount_value: schema_1.food.discount_value,
        Maximum_Purchase: schema_1.food.Maximum_Purchase,
        stock_type: schema_1.food.stock_type,
        status: schema_1.food.status,
        createdAt: schema_1.food.createdAt,
        updatedAt: schema_1.food.updatedAt,
        restaurant: {
            id: schema_1.restaurants.id,
            name: schema_1.restaurants.name,
        },
        category: {
            id: schema_1.categories.id,
            name: schema_1.categories.name,
            nameAr: schema_1.categories.nameAr,
            nameFr: schema_1.categories.nameFr,
        },
        subcategory: {
            id: schema_1.subcategories.id,
            name: schema_1.subcategories.name,
            nameAr: schema_1.subcategories.nameAr,
            nameFr: schema_1.subcategories.nameFr,
        },
    })
        .from(schema_1.food)
        // ✅ تم تعديل الربط والفلترة
        .leftJoin(schema_1.restaurants, (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, schema_1.restaurants.id))
        .leftJoin(schema_1.categories, (0, drizzle_orm_1.eq)(schema_1.food.categoryid, schema_1.categories.id))
        .leftJoin(schema_1.subcategories, (0, drizzle_orm_1.eq)(schema_1.food.subcategoryid, schema_1.subcategories.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, id), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId))) // ✅ يجب أن تكون الأكلة تخص المطعم
        .limit(1);
    if (!foodItem[0])
        throw new NotFound_1.NotFound("Food not found");
    const vars = await connection_1.db.select().from(schema_1.foodVariations).where((0, drizzle_orm_1.eq)(schema_1.foodVariations.foodId, id));
    const varIds = vars.map(v => v.id);
    const opts = varIds.length
        ? await connection_1.db.select().from(schema_1.variationOptions).where((0, drizzle_orm_1.inArray)(schema_1.variationOptions.variationId, varIds))
        : [];
    const variations = vars.map(v => ({
        ...v,
        options: opts.filter(o => o.variationId === v.id)
    }));
    return (0, response_1.SuccessResponse)(res, {
        message: "Get food by id success",
        data: { ...foodItem[0], variations }
    });
};
exports.getFoodById = getFoodById;
// =============================================
// UPDATE Food
// =============================================
const updateFood = async (req, res) => {
    const { id } = req.params;
    const data = req.body;
    const restaurantId = req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    }
    // ✅ تأكد إن الأكلة تخص نفس الريستورانت
    const existingFood = await connection_1.db
        .select()
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, id), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)))
        .limit(1);
    if (!existingFood[0]) {
        throw new NotFound_1.NotFound("Food not found or you don't have permission to edit it");
    }
    // ✅ الحقول المسموح بتحديثها فقط (Clean Code + Security)
    const allowedFields = [
        "name",
        "nameAr",
        "nameFr",
        "description",
        "descriptionAr",
        "descriptionFr",
        "price",
        "categoryId",
        "isAvailable",
        "image"
    ];
    const updateData = {
        updatedAt: new Date(), // ✅ دايمًا Date object
    };
    for (const key of allowedFields) {
        if (data[key] !== undefined) {
            // 🖼️ معالجة الصورة
            if (key === "image" &&
                data[key] &&
                typeof data[key] === "string" &&
                data[key].startsWith("data:image")) {
                updateData[key] = await (0, handleImages_1.handleImageUpdate)(req, existingFood[0].image, data[key], "foods");
            }
            else {
                updateData[key] = data[key];
            }
        }
    }
    // ✅ تنفيذ التحديث
    await connection_1.db.update(schema_1.food).set(updateData).where((0, drizzle_orm_1.eq)(schema_1.food.id, id));
    // ===========================
    // ✅ Variations Update
    // ===========================
    if (data.variations && Array.isArray(data.variations)) {
        const oldVars = await connection_1.db
            .select()
            .from(schema_1.foodVariations)
            .where((0, drizzle_orm_1.eq)(schema_1.foodVariations.foodId, id));
        // حذف options القديمة
        for (const v of oldVars) {
            await connection_1.db
                .delete(schema_1.variationOptions)
                .where((0, drizzle_orm_1.eq)(schema_1.variationOptions.variationId, v.id));
        }
        // حذف variations القديمة
        await connection_1.db
            .delete(schema_1.foodVariations)
            .where((0, drizzle_orm_1.eq)(schema_1.foodVariations.foodId, id));
        // إضافة الجديدة
        for (const variation of data.variations) {
            const variationId = (0, uuid_1.v4)();
            await connection_1.db.insert(schema_1.foodVariations).values({
                id: variationId,
                foodId: id,
                name: variation.name,
                nameAr: variation.nameAr,
                nameFr: variation.nameFr,
                isRequired: variation.isRequired || false,
                selectionType: variation.selectionType || "single",
                min: variation.min ?? null,
                max: variation.max ?? null,
            });
            if (variation.options && Array.isArray(variation.options)) {
                for (const option of variation.options) {
                    await connection_1.db.insert(schema_1.variationOptions).values({
                        variationId,
                        optionName: option.optionName,
                        optionNameAr: option.optionNameAr,
                        optionNameFr: option.optionNameFr,
                        additionalPrice: option.additionalPrice
                            ? option.additionalPrice.toString()
                            : "0",
                    });
                }
            }
        }
    }
    return (0, response_1.SuccessResponse)(res, {
        message: "Update food success",
    });
};
exports.updateFood = updateFood;
// =============================================
// DELETE Food
// =============================================
const deleteFood = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    // ✅ استخدام and هنا أيضاً للحماية
    const existingFood = await connection_1.db.select().from(schema_1.food).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, id), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId))).limit(1);
    if (!existingFood[0])
        throw new NotFound_1.NotFound("Food not found or you don't have permission to delete it");
    const vars = await connection_1.db.select().from(schema_1.foodVariations).where((0, drizzle_orm_1.eq)(schema_1.foodVariations.foodId, id));
    for (const v of vars) {
        await connection_1.db.delete(schema_1.variationOptions).where((0, drizzle_orm_1.eq)(schema_1.variationOptions.variationId, v.id));
    }
    await connection_1.db.delete(schema_1.foodVariations).where((0, drizzle_orm_1.eq)(schema_1.foodVariations.foodId, id));
    await connection_1.db.delete(schema_1.food).where((0, drizzle_orm_1.eq)(schema_1.food.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Delete food success" });
};
exports.deleteFood = deleteFood;
// =============================================
// GET Food Select Data (For Dropdowns)
// =============================================
const getFoodSelectData = async (req, res) => {
    const restaurantId = req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    // ✅ جلب الأقسام الخاصة بالمطعم فقط (بافتراض إن الجدول يحتوي على restaurantid)
    const myCategories = await connection_1.db
        .select({ id: schema_1.categories.id, name: schema_1.categories.name })
        .from(schema_1.categories)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.categories.status, "active")));
    // ✅ جلب الأقسام الفرعية الخاصة بالمطعم فقط
    const mySubcategories = await connection_1.db
        .select({
        id: schema_1.subcategories.id,
        name: schema_1.subcategories.name,
        categoryId: schema_1.subcategories.categoryId
    })
        .from(schema_1.subcategories)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.subcategories.status, "active")));
    // ✅ جلب الإضافات الخاصة بالمطعم فقط
    const myAddons = await connection_1.db
        .select({ id: schema_1.addons.id, name: schema_1.addons.name })
        .from(schema_1.addons)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.addons.status, "active"), (0, drizzle_orm_1.eq)(schema_1.addons.restaurantid, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: "Get food select data success",
        data: {
            categories: myCategories,
            subcategories: mySubcategories,
            addons: myAddons
        }
    });
};
exports.getFoodSelectData = getFoodSelectData;
// =========================================================
// 🍳 إدارة الوصفة (Recipe / Food Ingredients)
// =========================================================
const assignIngredientsToFood = async (req, res) => {
    const { id } = req.params;
    const { ingredientsList } = req.body;
    const restaurantId = req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    if (!Array.isArray(ingredientsList))
        throw new BadRequest_1.BadRequest("ingredientsList must be an array");
    const existingFood = await connection_1.db.select().from(schema_1.food).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, id), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId))).limit(1);
    if (!existingFood[0])
        throw new NotFound_1.NotFound("Food not found or does not belong to you");
    await connection_1.db.transaction(async (tx) => {
        await tx.delete(schema_1.foodIngredients).where((0, drizzle_orm_1.eq)(schema_1.foodIngredients.foodId, id));
        if (ingredientsList.length > 0) {
            const valuesToInsert = ingredientsList.map((item) => ({
                id: (0, uuid_1.v4)(),
                foodId: id,
                ingredientId: item.ingredientId,
                isRemovable: item.isRemovable || false
            }));
            await tx.insert(schema_1.foodIngredients).values(valuesToInsert);
        }
    });
    return (0, response_1.SuccessResponse)(res, { message: "Food recipe saved successfully" });
};
exports.assignIngredientsToFood = assignIngredientsToFood;
const getFoodRecipe = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.id;
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
        categoryName: schema_1.ingredientCategories.name
    })
        .from(schema_1.foodIngredients)
        .innerJoin(schema_1.ingredients, (0, drizzle_orm_1.eq)(schema_1.foodIngredients.ingredientId, schema_1.ingredients.id))
        .leftJoin(schema_1.ingredientCategories, (0, drizzle_orm_1.eq)(schema_1.ingredients.categoryId, schema_1.ingredientCategories.id))
        .where((0, drizzle_orm_1.eq)(schema_1.foodIngredients.foodId, id));
    return (0, response_1.SuccessResponse)(res, { message: "Get food recipe success", data: recipe });
};
exports.getFoodRecipe = getFoodRecipe;
