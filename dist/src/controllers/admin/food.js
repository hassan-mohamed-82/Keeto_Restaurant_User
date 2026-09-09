"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOutOfStockFoods = exports.toggleFoodOutOfStock = exports.changeFoodStatus = exports.toggleVariationOptionStatus = exports.toggleVariationStatus = exports.getFoodSelectData = exports.deleteFood = exports.updateFood = exports.getFoodById = exports.getAllFoods = exports.createFood = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const food_helper_1 = require("../../helpers/food.helper");
// ✅ تم إضافة and, or, isNull هنا عشان نصلح مشكلة الشروط المتعددة
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
    try {
        const restaurantId = req.user?.restaurantId || req.user?.id;
        if (!restaurantId) {
            throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
        }
        const { name, description, image, categoryid, subcategoryid, foodtype, Nutrition, allergen_ingredients, is_Halal, startTime, endTime, search_tags, price, discount_type, discount_value, Maximum_Purchase, stock_type, status, variations, points, nameAr, nameFr, descriptionAr, descriptionFr, isOutOfStock } = req.body;
        const incomingAddons = req.body.addonsId ?? req.body.addons ?? req.body.addonIds ?? req.body['addonsId[]'] ?? req.body['addons[]'];
        // 1. التحقق من الحقول المطلوبة
        if (!name || !description || !image || !categoryid || !startTime || !endTime || !price) {
            throw new BadRequest_1.BadRequest("Missing required fields");
        }
        // 2. التحقق من وجود العلاقات
        const existingCategory = await connection_1.db.select().from(schema_1.categories).where((0, drizzle_orm_1.eq)(schema_1.categories.id, categoryid)).limit(1);
        if (!existingCategory[0])
            throw new BadRequest_1.BadRequest("Category not found");
        if (subcategoryid) {
            const existingSub = await connection_1.db
                .select({ id: schema_1.subcategories.id, status: schema_1.subcategories.status })
                .from(schema_1.subcategories)
                .where((0, drizzle_orm_1.eq)(schema_1.subcategories.id, subcategoryid))
                .limit(1);
            if (!existingSub[0])
                throw new BadRequest_1.BadRequest("Subcategory not found");
            // ✅ Block creating an active food under an inactive subcategory
            const incomingStatus = status || "active";
            if (incomingStatus === "active" && existingSub[0].status === "inactive") {
                throw new BadRequest_1.BadRequest("Cannot create an active food under an inactive subcategory. Please activate the subcategory first.");
            }
        }
        // ==========================================
        // ✅ 3. معالجة الإضافات (Addons) بشكل آمن
        // ==========================================
        let parsedAddons = incomingAddons;
        if (typeof incomingAddons === "string") {
            try {
                parsedAddons = JSON.parse(incomingAddons);
            }
            catch (e) {
                if (incomingAddons.includes(",")) {
                    parsedAddons = incomingAddons.split(",");
                }
                else {
                    parsedAddons = [incomingAddons];
                }
            }
        }
        parsedAddons = Array.isArray(parsedAddons) ? parsedAddons : [];
        // 🔥 استخراج الـ ID لو الفرونت إند باعت Objects بدل Strings
        const finalAddonsIds = parsedAddons.map((item) => {
            if (typeof item === 'object' && item !== null) {
                return item.id || item.value || item.addonId || item._id;
            }
            return item;
        }).filter((id) => typeof id === 'string' && id.trim() !== '');
        if (finalAddonsIds.length > 0) {
            const existingAddons = await connection_1.db.select({ id: schema_1.addons.id }).from(schema_1.addons)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.addons.id, finalAddonsIds), (0, drizzle_orm_1.eq)(schema_1.addons.restaurantid, restaurantId)));
            if (existingAddons.length !== finalAddonsIds.length) {
                throw new BadRequest_1.BadRequest("One or more Addon IDs are invalid");
            }
        }
        // 4. معالجة الصورة
        let imageUrl = image;
        if (image && image.startsWith("data:image")) {
            imageUrl = await (0, handleImages_1.saveBase64Image)(image, req, "foods");
        }
        const foodId = (0, uuid_1.v4)();
        // 5. بدء المعاملة (Transaction) لحفظ البيانات
        await connection_1.db.transaction(async (tx) => {
            await tx.insert(schema_1.food).values({
                id: foodId,
                name, nameAr, nameFr,
                description, descriptionAr, descriptionFr,
                image: imageUrl,
                restaurantid: restaurantId,
                categoryid,
                subcategoryid: subcategoryid || null,
                foodtype: foodtype || "veg",
                Nutrition: Nutrition || null,
                allergen_ingredients: allergen_ingredients || null,
                is_Halal: is_Halal ?? false,
                addonsId: finalAddonsIds, // ✅ حفظ المصفوفة النظيفة
                startTime, endTime, search_tags: search_tags || null,
                price, discount_type: discount_type || "percentage",
                discount_value: discount_value || null,
                Maximum_Purchase: Maximum_Purchase || null,
                stock_type: stock_type || "unlimited", status: status || "active",
                isOutOfStock: isOutOfStock ?? false,
                points: points ?? 0,
            });
            // إدخال الخيارات (Variations) إن وجدت
            if (variations && Array.isArray(variations) && variations.length > 0) {
                for (const variation of variations) {
                    const variationId = (0, uuid_1.v4)();
                    await tx.insert(schema_1.foodVariations).values({
                        id: variationId,
                        foodId,
                        name: variation.name, nameAr: variation.nameAr, nameFr: variation.nameFr,
                        isRequired: variation.isRequired ?? false,
                        selectionType: variation.selectionType || "single",
                        min: variation.min || null, max: variation.max || null,
                    });
                    if (variation.options && Array.isArray(variation.options)) {
                        const optionsToInsert = variation.options.map((option) => ({
                            variationId,
                            optionName: option.optionName, optionNameAr: option.optionNameAr, optionNameFr: option.optionNameFr,
                            additionalPrice: option.additionalPrice?.toString() || "0",
                        }));
                        if (optionsToInsert.length > 0) {
                            await tx.insert(schema_1.variationOptions).values(optionsToInsert);
                        }
                    }
                }
            }
            // ✅ حفظ branches في branchMenuItems إن وُجدت وغير فارغة
            const incomingBranches = req.body.branches;
            if (Array.isArray(incomingBranches) && incomingBranches.length > 0) {
                const activeBranches = await tx
                    .select({ id: schema_1.branches.id })
                    .from(schema_1.branches)
                    .where((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId));
                const activeBranchIds = new Set(activeBranches.map((b) => b.id));
                for (const b of incomingBranches) {
                    if (!b.branchId || !activeBranchIds.has(b.branchId))
                        continue;
                    await tx.insert(schema_1.branchMenuItems).values({
                        id: (0, uuid_1.v4)(),
                        branchId: b.branchId,
                        foodId,
                        price: b.price !== undefined && b.price !== null ? String(b.price) : "0.00",
                        status: b.status === "inactive" ? "inactive" : "active",
                    });
                }
            }
        });
        return (0, response_1.SuccessResponse)(res, {
            message: "Create food success",
            data: { id: foodId }
        });
    }
    catch (error) {
        console.error("🔥 DATABASE ERROR DETAILED:", error.sqlMessage || error.message || error);
        throw new BadRequest_1.BadRequest(error.sqlMessage || error.message || "Failed to create food item");
    }
};
exports.createFood = createFood;
// =============================================
// GET All Foods
// =============================================
const getAllFoods = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    // 1. Extract query params
    const { categoryId, subCategoryId } = req.query;
    // 2. Build dynamic conditions
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)];
    if (categoryId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.food.categoryid, categoryId));
    }
    if (subCategoryId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.food.subcategoryid, subCategoryId));
    }
    const rawFoods = await connection_1.db.select({
        id: schema_1.food.id, name: schema_1.food.name, nameAr: schema_1.food.nameAr, nameFr: schema_1.food.nameFr,
        description: schema_1.food.description, descriptionAr: schema_1.food.descriptionAr, descriptionFr: schema_1.food.descriptionFr,
        image: schema_1.food.image, restaurantid: schema_1.food.restaurantid, categoryid: schema_1.food.categoryid, subcategoryid: schema_1.food.subcategoryid,
        foodtype: schema_1.food.foodtype, Nutrition: schema_1.food.Nutrition, allergen_ingredients: schema_1.food.allergen_ingredients,
        is_Halal: schema_1.food.is_Halal, isOutOfStock: schema_1.food.isOutOfStock, addonsId: schema_1.food.addonsId, startTime: schema_1.food.startTime, endTime: schema_1.food.endTime,
        search_tags: schema_1.food.search_tags, price: schema_1.food.price, discount_type: schema_1.food.discount_type, discount_value: schema_1.food.discount_value,
        Maximum_Purchase: schema_1.food.Maximum_Purchase, points: schema_1.food.points, stock_type: schema_1.food.stock_type, status: schema_1.food.status,
        createdAt: schema_1.food.createdAt, updatedAt: schema_1.food.updatedAt,
        restaurant: schema_1.restaurants,
        category_name: schema_1.categories.name, category_nameAr: schema_1.categories.nameAr, category_nameFr: schema_1.categories.nameFr,
        subcategory_name: schema_1.subcategories.name, subcategory_nameAr: schema_1.subcategories.nameAr, subcategory_nameFr: schema_1.subcategories.nameFr,
    })
        .from(schema_1.food)
        .leftJoin(schema_1.restaurants, (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, schema_1.restaurants.id))
        .leftJoin(schema_1.categories, (0, drizzle_orm_1.eq)(schema_1.food.categoryid, schema_1.categories.id))
        .leftJoin(schema_1.subcategories, (0, drizzle_orm_1.eq)(schema_1.food.subcategoryid, schema_1.subcategories.id))
        .where((0, drizzle_orm_1.and)(...conditions)); // 3. Pass packed conditions here
    if (rawFoods.length === 0) {
        return (0, response_1.SuccessResponse)(res, { message: "Get all foods success", data: [] });
    }
    const foodIds = rawFoods.map(f => f.id);
    const allVars = await connection_1.db.select().from(schema_1.foodVariations).where((0, drizzle_orm_1.inArray)(schema_1.foodVariations.foodId, foodIds));
    const allVarIds = allVars.map(v => v.id);
    const allOpts = allVarIds.length > 0
        ? await connection_1.db.select().from(schema_1.variationOptions).where((0, drizzle_orm_1.inArray)(schema_1.variationOptions.variationId, allVarIds))
        : [];
    const allAddonsIdsToFetch = new Set();
    rawFoods.forEach(f => {
        let safeAddons = f.addonsId;
        if (typeof safeAddons === 'string') {
            try {
                safeAddons = JSON.parse(safeAddons);
            }
            catch (e) {
                safeAddons = [];
            }
        }
        const cleanAddonsArray = Array.isArray(safeAddons) ? safeAddons.filter((id) => typeof id === 'string' && id.trim() !== '') : [];
        cleanAddonsArray.forEach(id => allAddonsIdsToFetch.add(id));
    });
    const uniqueAddonsIds = Array.from(allAddonsIdsToFetch);
    let allAddonsDetails = [];
    if (uniqueAddonsIds.length > 0) {
        allAddonsDetails = await connection_1.db.select().from(schema_1.addons).where((0, drizzle_orm_1.inArray)(schema_1.addons.id, uniqueAddonsIds));
    }
    const allIngredients = foodIds.length > 0
        ? await connection_1.db.select({
            foodId: schema_1.foodIngredients.foodId,
            ingredientId: schema_1.ingredients.id,
            name: schema_1.ingredients.name,
            nameAr: schema_1.ingredients.nameAr,
            inStock: schema_1.ingredients.inStock,
            isRemovable: schema_1.foodIngredients.isRemovable
        })
            .from(schema_1.foodIngredients)
            .innerJoin(schema_1.ingredients, (0, drizzle_orm_1.eq)(schema_1.foodIngredients.ingredientId, schema_1.ingredients.id))
            .where((0, drizzle_orm_1.inArray)(schema_1.foodIngredients.foodId, foodIds))
        : [];
    const allFoods = rawFoods.map(f => {
        const foodVars = allVars.filter(v => v.foodId === f.id).map(v => ({
            ...v, options: allOpts.filter(o => o.variationId === v.id)
        }));
        let safeAddons = f.addonsId;
        if (typeof safeAddons === 'string') {
            try {
                safeAddons = JSON.parse(safeAddons);
            }
            catch (e) {
                safeAddons = [];
            }
        }
        const cleanAddonsArray = Array.isArray(safeAddons) ? safeAddons.filter((id) => typeof id === 'string' && id.trim() !== '') : [];
        const foodAddonsDetails = allAddonsDetails.filter(a => cleanAddonsArray.includes(a.id));
        const assignedIngredients = allIngredients.filter(i => i.foodId === f.id).map(i => ({
            id: i.ingredientId,
            name: i.name,
            nameAr: i.nameAr,
            inStock: i.inStock,
            isRemovable: i.isRemovable
        }));
        return {
            id: f.id, name: f.name, nameAr: f.nameAr, nameFr: f.nameFr,
            description: f.description, descriptionAr: f.descriptionAr, descriptionFr: f.descriptionFr,
            image: f.image, price: f.price, status: f.status,
            addonsId: cleanAddonsArray,
            addonsDetails: foodAddonsDetails,
            foodtype: f.foodtype, Nutrition: f.Nutrition, allergen_ingredients: f.allergen_ingredients,
            is_Halal: f.is_Halal, isOutOfStock: f.isOutOfStock, startTime: f.startTime, endTime: f.endTime, search_tags: f.search_tags,
            discount_type: f.discount_type, discount_value: f.discount_value, Maximum_Purchase: f.Maximum_Purchase,
            points: f.points ?? 0,
            stock_type: f.stock_type, createdAt: f.createdAt, updatedAt: f.updatedAt,
            variations: foodVars, restaurant: f.restaurant,
            ingredients: assignedIngredients,
            category: f.category_name ? { name: f.category_name, nameAr: f.category_nameAr, nameFr: f.category_nameFr } : null,
            subcategory: f.subcategory_name ? { name: f.subcategory_name, nameAr: f.subcategory_nameAr, nameFr: f.subcategory_nameFr } : null,
        };
    });
    return (0, response_1.SuccessResponse)(res, { message: "Get all foods success", data: allFoods });
};
exports.getAllFoods = getAllFoods;
// =============================================
// GET Food By ID
// =============================================
const getFoodById = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const foodItem = await connection_1.db.select({
        id: schema_1.food.id, name: schema_1.food.name, nameAr: schema_1.food.nameAr, nameFr: schema_1.food.nameFr,
        description: schema_1.food.description, descriptionAr: schema_1.food.descriptionAr, descriptionFr: schema_1.food.descriptionFr,
        image: schema_1.food.image, restaurantid: schema_1.food.restaurantid, categoryid: schema_1.food.categoryid, subcategoryid: schema_1.food.subcategoryid,
        foodtype: schema_1.food.foodtype, Nutrition: schema_1.food.Nutrition, allergen_ingredients: schema_1.food.allergen_ingredients,
        is_Halal: schema_1.food.is_Halal, isOutOfStock: schema_1.food.isOutOfStock, addonsId: schema_1.food.addonsId, startTime: schema_1.food.startTime, endTime: schema_1.food.endTime,
        search_tags: schema_1.food.search_tags, price: schema_1.food.price, discount_type: schema_1.food.discount_type, discount_value: schema_1.food.discount_value,
        Maximum_Purchase: schema_1.food.Maximum_Purchase, points: schema_1.food.points, stock_type: schema_1.food.stock_type, status: schema_1.food.status,
        createdAt: schema_1.food.createdAt, updatedAt: schema_1.food.updatedAt,
        restaurant: { id: schema_1.restaurants.id, name: schema_1.restaurants.name },
        category: { id: schema_1.categories.id, name: schema_1.categories.name, nameAr: schema_1.categories.nameAr, nameFr: schema_1.categories.nameFr },
        subcategory: { id: schema_1.subcategories.id, name: schema_1.subcategories.name, nameAr: schema_1.subcategories.nameAr, nameFr: schema_1.subcategories.nameFr },
    })
        .from(schema_1.food)
        .leftJoin(schema_1.restaurants, (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, schema_1.restaurants.id))
        .leftJoin(schema_1.categories, (0, drizzle_orm_1.eq)(schema_1.food.categoryid, schema_1.categories.id))
        .leftJoin(schema_1.subcategories, (0, drizzle_orm_1.eq)(schema_1.food.subcategoryid, schema_1.subcategories.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, id), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)))
        .limit(1);
    if (!foodItem[0])
        throw new NotFound_1.NotFound("Food not found");
    // 1. جلب أسعار الفروع الاستثنائية للوجبة (Branch Overrides)
    const branchPrices = await connection_1.db
        .select({
        branchId: schema_1.branchMenuItems.branchId,
        price: schema_1.branchMenuItems.price,
        status: schema_1.branchMenuItems.status
    })
        .from(schema_1.branchMenuItems)
        .where((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.foodId, id));
    // 2. جلب الـ Variations والـ Options
    const vars = await connection_1.db.select().from(schema_1.foodVariations).where((0, drizzle_orm_1.eq)(schema_1.foodVariations.foodId, id));
    const varIds = vars.map(v => v.id);
    const opts = varIds.length ? await connection_1.db.select().from(schema_1.variationOptions).where((0, drizzle_orm_1.inArray)(schema_1.variationOptions.variationId, varIds)) : [];
    const variations = vars.map(v => ({ ...v, options: opts.filter(o => o.variationId === v.id) }));
    // 3. فك تشفير الإضافات
    let safeAddons = foodItem[0].addonsId;
    if (typeof safeAddons === 'string') {
        try {
            safeAddons = JSON.parse(safeAddons);
        }
        catch (e) {
            safeAddons = [];
        }
    }
    const addonsArray = Array.isArray(safeAddons) ? safeAddons : [];
    const cleanAddonsArray = addonsArray.filter((id) => typeof id === 'string' && id.trim() !== '');
    let addonsDetails = [];
    if (cleanAddonsArray.length > 0) {
        addonsDetails = await connection_1.db.select().from(schema_1.addons).where((0, drizzle_orm_1.inArray)(schema_1.addons.id, cleanAddonsArray));
    }
    return (0, response_1.SuccessResponse)(res, {
        message: "Get food by id success",
        data: {
            ...foodItem[0],
            branches: branchPrices, // 🔥 إرجاع أسعار الفروع للأدمن
            addonsId: cleanAddonsArray,
            addonsDetails: addonsDetails,
            variations
        }
    });
};
exports.getFoodById = getFoodById;
// =============================================
// UPDATE Food
// =============================================
const updateFood = async (req, res) => {
    const { id } = req.params;
    const data = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
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
    // ✅ الحقول المسموح بتحديثها
    const allowedFields = [
        "name", "nameAr", "nameFr",
        "description", "descriptionAr", "descriptionFr",
        "price", "status", "image",
        "foodtype", "Nutrition", "allergen_ingredients", "is_Halal",
        "startTime", "endTime", "search_tags",
        "discount_type", "discount_value", "Maximum_Purchase", "stock_type",
        "points", "isOutOfStock"
    ];
    const updateData = {
        updatedAt: new Date(),
    };
    // 1️⃣ معالجة الحقول العادية والصورة
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
    // ==========================================
    // 2️⃣ معالجة الـ Addons بشكل مخصص وآمن 
    // ==========================================
    const incomingAddons = data.addonsId ?? data.addons ?? data.addonIds ?? data['addonsId[]'] ?? data['addons[]'];
    if (incomingAddons !== undefined) {
        let parsedAddons = incomingAddons;
        if (typeof incomingAddons === "string") {
            try {
                parsedAddons = JSON.parse(incomingAddons);
            }
            catch (e) {
                if (incomingAddons.includes(",")) {
                    parsedAddons = incomingAddons.split(",");
                }
                else {
                    parsedAddons = [incomingAddons];
                }
            }
        }
        parsedAddons = Array.isArray(parsedAddons) ? parsedAddons : [];
        // 🔥 استخراج الـ ID لو الفرونت إند باعت Objects بدل Strings
        const finalAddonsIds = parsedAddons.map((item) => {
            if (typeof item === 'object' && item !== null) {
                return item.id || item.value || item.addonId || item._id;
            }
            return item;
        }).filter((id) => typeof id === 'string' && id.trim() !== '');
        if (finalAddonsIds.length > 0) {
            const existingAddons = await connection_1.db.select({ id: schema_1.addons.id }).from(schema_1.addons)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.addons.id, finalAddonsIds), (0, drizzle_orm_1.eq)(schema_1.addons.restaurantid, restaurantId)));
            if (existingAddons.length !== finalAddonsIds.length) {
                throw new BadRequest_1.BadRequest("One or more Addon IDs are invalid");
            }
        }
        updateData.addonsId = finalAddonsIds; // ✅ تحديث البيانات بالمصفوفة النظيفة
    }
    // 3️⃣ معالجة الـ Categories بشكل مخصص 
    const incomingCategoryId = data.categoryid ?? data.categoryId;
    if (incomingCategoryId !== undefined) {
        updateData.categoryid = incomingCategoryId;
    }
    const incomingSubcategoryId = data.subcategoryid ?? data.subcategoryId;
    if (incomingSubcategoryId !== undefined) {
        updateData.subcategoryid = incomingSubcategoryId === "" ? null : incomingSubcategoryId;
    }
    // ✅ Block setting an active food under an inactive subcategory
    const effectiveSubcategoryId = updateData.subcategoryid ?? existingFood[0].subcategoryid;
    const effectiveStatus = updateData.status ?? existingFood[0].status;
    if (effectiveSubcategoryId && effectiveStatus === "active") {
        const subCheck = await connection_1.db
            .select({ status: schema_1.subcategories.status })
            .from(schema_1.subcategories)
            .where((0, drizzle_orm_1.eq)(schema_1.subcategories.id, effectiveSubcategoryId))
            .limit(1);
        if (subCheck[0] && subCheck[0].status === "inactive") {
            throw new BadRequest_1.BadRequest("Cannot set food as active while its subcategory is inactive. Please activate the subcategory first.");
        }
    }
    // ✅ تنفيذ التحديث الرئيسي للأكلة
    if (Object.keys(updateData).length > 1) {
        await connection_1.db.update(schema_1.food).set(updateData).where((0, drizzle_orm_1.eq)(schema_1.food.id, id));
    }
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
                        additionalPrice: option.additionalPrice ? option.additionalPrice.toString() : "0",
                    });
                }
            }
        }
    }
    // ===========================
    // ✅ Branch Menu Items Update (if branches array provided and non-empty)
    // ===========================
    if (data.branches && Array.isArray(data.branches) && data.branches.length > 0) {
        const activeBranches = await connection_1.db
            .select({ id: schema_1.branches.id })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId));
        const activeBranchIds = new Set(activeBranches.map((b) => b.id));
        for (const b of data.branches) {
            if (!b.branchId || !activeBranchIds.has(b.branchId))
                continue;
            const priceVal = b.price !== undefined && b.price !== null ? String(b.price) : "0.00";
            const statusVal = b.status === "inactive" ? "inactive" : "active";
            const [existing] = await connection_1.db
                .select({ id: schema_1.branchMenuItems.id })
                .from(schema_1.branchMenuItems)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.branchId, b.branchId), (0, drizzle_orm_1.eq)(schema_1.branchMenuItems.foodId, id)))
                .limit(1);
            if (existing) {
                await connection_1.db.update(schema_1.branchMenuItems)
                    .set({ price: priceVal, status: statusVal, updatedAt: new Date() })
                    .where((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.id, existing.id));
            }
            else {
                await connection_1.db.insert(schema_1.branchMenuItems).values({
                    id: (0, uuid_1.v4)(),
                    branchId: b.branchId,
                    foodId: id,
                    price: priceVal,
                    status: statusVal,
                });
            }
        }
    }
    // ===========================
    // ✅ Product Channel Pricing Update (if channels provided)
    // ===========================
    if (data.channels && Array.isArray(data.channels) && data.channels.length > 0) {
        for (const ch of data.channels) {
            const { serviceModule, price, status, branchId: chBranchId } = ch;
            if (!serviceModule || price === undefined)
                continue;
            const priceVal = String(price);
            const targetBranchId = chBranchId || null;
            const statusVal = status === "inactive" ? "inactive" : "active";
            const whereClause = targetBranchId
                ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.productChannelPricing.foodId, id), (0, drizzle_orm_1.eq)(schema_1.productChannelPricing.branchId, targetBranchId), (0, drizzle_orm_1.eq)(schema_1.productChannelPricing.serviceModule, serviceModule))
                : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.productChannelPricing.foodId, id), (0, drizzle_orm_1.isNull)(schema_1.productChannelPricing.branchId), (0, drizzle_orm_1.eq)(schema_1.productChannelPricing.serviceModule, serviceModule));
            const [existing] = await connection_1.db.select({ id: schema_1.productChannelPricing.id }).from(schema_1.productChannelPricing).where(whereClause).limit(1);
            if (existing) {
                await connection_1.db.update(schema_1.productChannelPricing)
                    .set({ price: priceVal, status: statusVal, updatedAt: new Date() })
                    .where((0, drizzle_orm_1.eq)(schema_1.productChannelPricing.id, existing.id));
            }
            else {
                await connection_1.db.insert(schema_1.productChannelPricing).values({
                    id: (0, uuid_1.v4)(), foodId: id, branchId: targetBranchId,
                    serviceModule, price: priceVal, status: statusVal,
                });
            }
        }
    }
    // ===========================
    // ✅ Variant Channel Pricing Update (if variantChannels provided)
    // ===========================
    if (data.variantChannels && Array.isArray(data.variantChannels) && data.variantChannels.length > 0) {
        for (const vc of data.variantChannels) {
            const { variantId, serviceModule, price, status, branchId: vcBranchId } = vc;
            if (!variantId || !serviceModule || price === undefined)
                continue;
            const priceVal = String(price);
            const targetBranchId = vcBranchId || null;
            const statusVal = status === "inactive" ? "inactive" : "active";
            const whereClause = targetBranchId
                ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.variantChannelPricing.variantId, variantId), (0, drizzle_orm_1.eq)(schema_1.variantChannelPricing.branchId, targetBranchId), (0, drizzle_orm_1.eq)(schema_1.variantChannelPricing.serviceModule, serviceModule))
                : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.variantChannelPricing.variantId, variantId), (0, drizzle_orm_1.isNull)(schema_1.variantChannelPricing.branchId), (0, drizzle_orm_1.eq)(schema_1.variantChannelPricing.serviceModule, serviceModule));
            const [existing] = await connection_1.db.select({ id: schema_1.variantChannelPricing.id }).from(schema_1.variantChannelPricing).where(whereClause).limit(1);
            if (existing) {
                await connection_1.db.update(schema_1.variantChannelPricing)
                    .set({ price: priceVal, status: statusVal, updatedAt: new Date() })
                    .where((0, drizzle_orm_1.eq)(schema_1.variantChannelPricing.id, existing.id));
            }
            else {
                await connection_1.db.insert(schema_1.variantChannelPricing).values({
                    id: (0, uuid_1.v4)(), variantId, branchId: targetBranchId,
                    serviceModule, price: priceVal, status: statusVal,
                });
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
    const restaurantId = req.user?.restaurantId || req.user?.id;
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
    // ✅ استخدام نفس الطريقة اللي في subcategory.ts
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    // ✅ جلب الأقسام الخاصة بالمطعم فقط (بافتراض إن الجدول يحتوي على restaurantid)
    // ✅ Categories - عام لجميع المطاعم (لأن الجدول ليس له restaurantId)
    const myCategories = await connection_1.db
        .select({ id: schema_1.categories.id, name: schema_1.categories.name })
        .from(schema_1.categories)
        .where((0, drizzle_orm_1.eq)(schema_1.categories.status, "active"));
    // ✅ Subcategories - الخاصة بالمطعم أو العامة (restaurantId = null)
    const mySubcategories = await connection_1.db
        .select({
        id: schema_1.subcategories.id,
        name: schema_1.subcategories.name,
        categoryId: schema_1.subcategories.categoryId,
        restaurantId: schema_1.subcategories.restaurantId, // ✅ للتأكد من القيمة
        status: schema_1.subcategories.status // ✅ للتأكد من القيمة
    })
        .from(schema_1.subcategories)
        .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId), (0, drizzle_orm_1.isNull)(schema_1.subcategories.restaurantId)));
    // ✅ Addons - فقط الخاصة بالمطعم
    const myAddons = await connection_1.db
        .select({ id: schema_1.addons.id, name: schema_1.addons.name })
        .from(schema_1.addons)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.addons.status, "active"), (0, drizzle_orm_1.eq)(schema_1.addons.restaurantid, restaurantId)));
    // ✅ جلب المكونات الخاصة بالمطعم فقط
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
    // GET ALL ACTIVE BRANCHES 
    const activeBranches = await connection_1.db
        .select({ id: schema_1.branches.id, name: schema_1.branches.name })
        .from(schema_1.branches)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.status, "active"), (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: "Get food select data success",
        data: {
            categories: myCategories,
            subcategories: mySubcategories,
            addons: myAddons,
            ingredients: list,
            branches: activeBranches,
        }
    });
};
exports.getFoodSelectData = getFoodSelectData;
// =========================================================
// 🍳 Toggle Variation Status
// =========================================================
const toggleVariationStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    if (typeof status !== "boolean")
        throw new BadRequest_1.BadRequest("Status must be a boolean");
    const existingVariation = await connection_1.db.select({ id: schema_1.foodVariations.id })
        .from(schema_1.foodVariations)
        .innerJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.foodVariations.foodId, schema_1.food.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.foodVariations.id, id), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)))
        .limit(1);
    if (!existingVariation[0])
        throw new NotFound_1.NotFound("Variation not found or does not belong to your restaurant");
    await connection_1.db.update(schema_1.foodVariations)
        .set({ status })
        .where((0, drizzle_orm_1.eq)(schema_1.foodVariations.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Variation status updated successfully" });
};
exports.toggleVariationStatus = toggleVariationStatus;
// =========================================================
// 🍳 Toggle Variation Option Status
// =========================================================
const toggleVariationOptionStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    if (typeof status !== "boolean")
        throw new BadRequest_1.BadRequest("Status must be a boolean");
    const existingOption = await connection_1.db.select({ id: schema_1.variationOptions.id })
        .from(schema_1.variationOptions)
        .innerJoin(schema_1.foodVariations, (0, drizzle_orm_1.eq)(schema_1.variationOptions.variationId, schema_1.foodVariations.id))
        .innerJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.foodVariations.foodId, schema_1.food.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.variationOptions.id, id), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)))
        .limit(1);
    if (!existingOption[0])
        throw new NotFound_1.NotFound("Variation option not found or does not belong to your restaurant");
    await connection_1.db.update(schema_1.variationOptions)
        .set({ status })
        .where((0, drizzle_orm_1.eq)(schema_1.variationOptions.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Variation option status updated successfully" });
};
exports.toggleVariationOptionStatus = toggleVariationOptionStatus;
const changeFoodStatus = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const branchId = req.params.branchId ||
        req.body?.branchId ||
        req.query?.branchId ||
        req.user?.branchId || undefined;
    // Accept explicit status or toggle
    const { status: rawStatus } = req.body;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const [existingFood] = await connection_1.db
        .select({
        id: schema_1.food.id,
        status: schema_1.food.status,
        subcategoryid: schema_1.food.subcategoryid,
    })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, id), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)))
        .limit(1);
    if (!existingFood)
        throw new NotFound_1.NotFound("Food not found or does not belong to you");
    // ── Branch-level toggle ────────────────────────────────────────
    if (branchId) {
        // Determine new status
        let newStatus;
        if (rawStatus === "active" || rawStatus === "inactive") {
            newStatus = rawStatus;
        }
        else {
            // Toggle from current branch override, fallback to global status
            const [branchItem] = await connection_1.db
                .select({ status: schema_1.branchMenuItems.status })
                .from(schema_1.branchMenuItems)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.foodId, id), (0, drizzle_orm_1.eq)(schema_1.branchMenuItems.branchId, branchId)))
                .limit(1);
            const current = branchItem?.status ?? existingFood.status;
            newStatus = current === "active" ? "inactive" : "active";
        }
        // Upsert branchMenuItems
        const [existingBranchItem] = await connection_1.db
            .select({ id: schema_1.branchMenuItems.id })
            .from(schema_1.branchMenuItems)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.foodId, id), (0, drizzle_orm_1.eq)(schema_1.branchMenuItems.branchId, branchId)))
            .limit(1);
        if (existingBranchItem) {
            await connection_1.db
                .update(schema_1.branchMenuItems)
                .set({ status: newStatus, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.id, existingBranchItem.id));
        }
        else {
            await connection_1.db.insert(schema_1.branchMenuItems).values({
                id: (0, uuid_1.v4)(),
                branchId,
                foodId: id,
                status: newStatus,
            });
        }
        // ── Recompute subcategory branch-level status after food toggle ──
        if (existingFood.subcategoryid) {
            await recomputeSubcategoryBranchStatus(existingFood.subcategoryid, branchId, restaurantId);
        }
        return (0, response_1.SuccessResponse)(res, {
            message: `Food status in branch updated to "${newStatus}"`,
            data: { foodId: id, branchId, status: newStatus },
        });
    }
    // ── Global toggle ──────────────────────────────────────────────
    let newStatus;
    if (rawStatus === "active" || rawStatus === "inactive") {
        newStatus = rawStatus;
    }
    else {
        newStatus = existingFood.status === "active" ? "inactive" : "active";
    }
    await connection_1.db.update(schema_1.food).set({ status: newStatus, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.food.id, id));
    // ── Recompute subcategory global status after food toggle ──
    if (existingFood.subcategoryid) {
        await recomputeSubcategoryGlobalStatus(existingFood.subcategoryid, restaurantId);
    }
    return (0, response_1.SuccessResponse)(res, {
        message: `Food status updated to "${newStatus}"`,
        data: { foodId: id, status: newStatus },
    });
};
exports.changeFoodStatus = changeFoodStatus;
// ============================================================================
// TOGGLE FOOD OUT-OF-STOCK
// PUT /foods/:id/branch/:branchId/out-of-stock
// Body: { isOutOfStock?: boolean } — if omitted, toggles current value
// branchId in params → updates both global food + branch-level branchMenuItems
// ============================================================================
const toggleFoodOutOfStock = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const branchId = req.params.branchId ||
        req.body?.branchId ||
        req.query?.branchId ||
        req.user?.branchId || undefined;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const [existingFood] = await connection_1.db
        .select({ id: schema_1.food.id, isOutOfStock: schema_1.food.isOutOfStock, subcategoryid: schema_1.food.subcategoryid })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, id), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)))
        .limit(1);
    if (!existingFood)
        throw new NotFound_1.NotFound("Food not found or does not belong to you");
    // Determine new OOS value
    const newIsOOS = req.body?.isOutOfStock !== undefined
        ? Boolean(req.body.isOutOfStock)
        : !existingFood.isOutOfStock;
    // ── 1. Update food.isOutOfStock globally (kitchen state) ──────────────────
    await connection_1.db.update(schema_1.food).set({ isOutOfStock: newIsOOS, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.food.id, id));
    // ── 2. If branchId provided → also update branchMenuItems for that branch ─
    if (branchId) {
        // OOS  → stockType=limited / stockQty=0 (hides item from branch menu)
        // Back → stockType=unlimited / stockQty=0 (restores item)
        const targetStockType = newIsOOS ? "limited" : "unlimited";
        const targetStockQty = 0;
        const [existingBranchItem] = await connection_1.db
            .select({ id: schema_1.branchMenuItems.id })
            .from(schema_1.branchMenuItems)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.foodId, id), (0, drizzle_orm_1.eq)(schema_1.branchMenuItems.branchId, branchId)))
            .limit(1);
        if (existingBranchItem) {
            await connection_1.db
                .update(schema_1.branchMenuItems)
                .set({ stockType: targetStockType, stockQty: targetStockQty, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.id, existingBranchItem.id));
        }
        else {
            await connection_1.db.insert(schema_1.branchMenuItems).values({
                id: (0, uuid_1.v4)(),
                branchId,
                foodId: id,
                stockType: targetStockType,
                stockQty: targetStockQty,
                status: "active",
            });
        }
    }
    // ── 3. Recompute subcategory isOutOfStock (stored flag, global + branch) ──
    if (existingFood.subcategoryid) {
        await recomputeSubcategoryOOS(existingFood.subcategoryid, restaurantId, branchId);
    }
    return (0, response_1.SuccessResponse)(res, {
        message: `Food isOutOfStock set to ${newIsOOS}`,
        data: { foodId: id, isOutOfStock: newIsOOS, branchId: branchId || null },
    });
};
exports.toggleFoodOutOfStock = toggleFoodOutOfStock;
// ============================================================================
// HELPER: Recompute & store subcategory.isOutOfStock
// Called after any food OOS toggle — checks all foods in the subcategory.
// If ALL foods are OOS → subcategory.isOutOfStock = true, else false.
// If branchId given → also updates branchSubcategories.isOutOfStock
// ============================================================================
async function recomputeSubcategoryOOS(subcategoryId, restaurantId, branchId) {
    const allFoods = await connection_1.db
        .select({ isOutOfStock: schema_1.food.isOutOfStock })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.subcategoryid, subcategoryId), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)));
    if (allFoods.length === 0)
        return;
    const allOOS = allFoods.every((f) => f.isOutOfStock);
    // Update subcategories table (global stored flag)
    await connection_1.db
        .update(schema_1.subcategories)
        .set({ isOutOfStock: allOOS, updatedAt: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.subcategories.id, subcategoryId));
    // If branchId provided, also update branchSubcategories.isOutOfStock
    if (branchId) {
        const [existing] = await connection_1.db
            .select({ id: schema_1.branchSubcategories.id })
            .from(schema_1.branchSubcategories)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchSubcategories.subcategoryId, subcategoryId), (0, drizzle_orm_1.eq)(schema_1.branchSubcategories.branchId, branchId)))
            .limit(1);
        if (existing) {
            await connection_1.db
                .update(schema_1.branchSubcategories)
                .set({ isOutOfStock: allOOS, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema_1.branchSubcategories.id, existing.id));
        }
        else {
            await connection_1.db.insert(schema_1.branchSubcategories).values({
                id: (0, uuid_1.v4)(),
                branchId,
                subcategoryId,
                isOutOfStock: allOOS,
            });
        }
    }
}
// ============================================================================
// HELPER: Recompute & store subcategory global status
// Called after toggling a food's global status.
// - subcategory.status  → "active" if ANY food is active, else "inactive"
// - subcategory.isOutOfStock → true only if ALL foods are OOS
// ============================================================================
async function recomputeSubcategoryGlobalStatus(subcategoryId, restaurantId) {
    const allFoods = await connection_1.db
        .select({ status: schema_1.food.status, isOutOfStock: schema_1.food.isOutOfStock })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.subcategoryid, subcategoryId), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)));
    if (allFoods.length === 0)
        return;
    const allOOS = allFoods.every((f) => f.isOutOfStock);
    // If at least one food is active → subcategory should be active
    const hasActiveFood = allFoods.some((f) => f.status === "active");
    const newStatus = hasActiveFood ? "active" : "inactive";
    await connection_1.db
        .update(schema_1.subcategories)
        .set({ status: newStatus, isOutOfStock: allOOS, updatedAt: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.subcategories.id, subcategoryId));
}
// ============================================================================
// HELPER: Recompute subcategory branch-level status after a food status change
// If at least one food is active in the branch (no override = use global status)
// then branchSubcategory can remain active; otherwise mark inactive.
// Also recomputes isOutOfStock for the branch record.
// NOTE: branch subcategory status is capped by the global subcategory status.
// ============================================================================
async function recomputeSubcategoryBranchStatus(subcategoryId, branchId, restaurantId) {
    // Get all foods in this subcategory
    const allFoods = await connection_1.db
        .select({ id: schema_1.food.id, status: schema_1.food.status, isOutOfStock: schema_1.food.isOutOfStock })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.subcategoryid, subcategoryId), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)));
    if (allFoods.length === 0)
        return;
    const foodIds = allFoods.map((f) => f.id);
    // Get branch-level overrides for these foods (status + stock for OOS check)
    const branchOverrides = await connection_1.db
        .select({
        foodId: schema_1.branchMenuItems.foodId,
        status: schema_1.branchMenuItems.status,
        stockType: schema_1.branchMenuItems.stockType,
        stockQty: schema_1.branchMenuItems.stockQty,
    })
        .from(schema_1.branchMenuItems)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.branchId, branchId), (0, drizzle_orm_1.inArray)(schema_1.branchMenuItems.foodId, foodIds)));
    const overrideMap = new Map(branchOverrides.map((b) => [b.foodId, b]));
    // Effective status per food: branch override or global
    const effectiveStatuses = allFoods.map((f) => overrideMap.get(f.id)?.status ?? f.status);
    // Effective OOS per food:
    // - If branch has an override → OOS = stockType=limited && stockQty<=0
    // - If no branch override → fall back to global food.isOutOfStock
    const allOOS = allFoods.every((f) => {
        const branchItem = overrideMap.get(f.id);
        if (branchItem) {
            return branchItem.stockType === "limited" && (branchItem.stockQty ?? 0) <= 0;
        }
        return Boolean(f.isOutOfStock);
    });
    // If at least one food is active in branch → subcategory should be active
    const hasActiveFood = effectiveStatuses.some((s) => s === "active");
    // ── Respect global subcategory status as ceiling ─────────────────────────
    // Even if foods are active in branch, the subcategory cannot be active
    // if the admin explicitly set the global subcategory to inactive.
    const [globalSub] = await connection_1.db
        .select({ status: schema_1.subcategories.status })
        .from(schema_1.subcategories)
        .where((0, drizzle_orm_1.eq)(schema_1.subcategories.id, subcategoryId))
        .limit(1);
    const globalSubcatIsActive = globalSub?.status === "active";
    const newBranchSubcatStatus = globalSubcatIsActive && hasActiveFood ? "active" : "inactive";
    const [existing] = await connection_1.db
        .select({ id: schema_1.branchSubcategories.id })
        .from(schema_1.branchSubcategories)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchSubcategories.subcategoryId, subcategoryId), (0, drizzle_orm_1.eq)(schema_1.branchSubcategories.branchId, branchId)))
        .limit(1);
    if (existing) {
        await connection_1.db
            .update(schema_1.branchSubcategories)
            .set({ status: newBranchSubcatStatus, isOutOfStock: allOOS, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.branchSubcategories.id, existing.id));
    }
    else {
        await connection_1.db.insert(schema_1.branchSubcategories).values({
            id: (0, uuid_1.v4)(),
            branchId,
            subcategoryId,
            status: newBranchSubcatStatus,
            isOutOfStock: allOOS,
        });
    }
}
// =============================================
// GET Out-Of-Stock Foods
// =============================================
/**
 * - Restaurant login (owner / subadmin without branchId):
 *   Returns all foods where isOutOfStock = true (global OOS),
 *   each food carries `unavailableBranches` from the food.helper.
 *
 * - Branch login (branch_manager / any user with branchId):
 *   Returns foods that are out-of-stock for THIS branch only
 *   (stockType='limited' && stockQty<=0  OR  status='inactive' in branch_menu_items).
 */
const getOutOfStockFoods = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    // 🟢 1. Extract branchId from user session OR URL query parameter
    const branchId = (req.user?.branchId || req.query.branchId);
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    // =========================================================
    // BRANCH VIEW: Return foods OOS for this specific branch
    // =========================================================
    if (branchId) {
        // Verify the branch belongs to this restaurant
        const branchCheck = await connection_1.db
            .select({ id: schema_1.branches.id })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.id, branchId), (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId)))
            .limit(1);
        if (!branchCheck[0])
            throw new BadRequest_1.BadRequest("Branch not found or does not belong to your restaurant");
        // Foods that are OOS (limited stock exhausted) or inactive in branch_menu_items
        const oosItems = await connection_1.db
            .select({
            foodId: schema_1.branchMenuItems.foodId,
            branchStockType: schema_1.branchMenuItems.stockType,
            branchStockQty: schema_1.branchMenuItems.stockQty,
            branchStatus: schema_1.branchMenuItems.status,
            // Food fields
            id: schema_1.food.id,
            name: schema_1.food.name,
            nameAr: schema_1.food.nameAr,
            nameFr: schema_1.food.nameFr,
            description: schema_1.food.description,
            descriptionAr: schema_1.food.descriptionAr,
            descriptionFr: schema_1.food.descriptionFr,
            image: schema_1.food.image,
            price: schema_1.food.price,
            status: schema_1.food.status,
            isOutOfStock: schema_1.food.isOutOfStock,
            stock_type: schema_1.food.stock_type,
            foodtype: schema_1.food.foodtype,
            startTime: schema_1.food.startTime,
            endTime: schema_1.food.endTime,
            discount_type: schema_1.food.discount_type,
            discount_value: schema_1.food.discount_value,
            Maximum_Purchase: schema_1.food.Maximum_Purchase,
            points: schema_1.food.points,
            createdAt: schema_1.food.createdAt,
            updatedAt: schema_1.food.updatedAt,
            category_name: schema_1.categories.name,
            category_nameAr: schema_1.categories.nameAr,
            category_nameFr: schema_1.categories.nameFr,
        })
            .from(schema_1.branchMenuItems)
            .innerJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.branchMenuItems.foodId, schema_1.food.id))
            .leftJoin(schema_1.categories, (0, drizzle_orm_1.eq)(schema_1.food.categoryid, schema_1.categories.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.branchId, branchId), (0, drizzle_orm_1.or)(
        // Limited stock exhausted
        (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.stockType, "limited"), (0, drizzle_orm_1.lte)(schema_1.branchMenuItems.stockQty, 0)), 
        // Manually marked as inactive in this branch
        (0, drizzle_orm_1.eq)(schema_1.branchMenuItems.status, "inactive"))));
        const result = oosItems.map((item) => ({
            id: item.id,
            name: item.name,
            nameAr: item.nameAr,
            nameFr: item.nameFr,
            description: item.description,
            descriptionAr: item.descriptionAr,
            descriptionFr: item.descriptionFr,
            image: item.image,
            price: item.price,
            isOutOfStock: item.isOutOfStock,
            globalStock_type: item.stock_type,
            foodtype: item.foodtype,
            startTime: item.startTime,
            endTime: item.endTime,
            discount_type: item.discount_type,
            discount_value: item.discount_value,
            Maximum_Purchase: item.Maximum_Purchase,
            points: item.points ?? 0,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            category: item.category_name
                ? { name: item.category_name, nameAr: item.category_nameAr, nameFr: item.category_nameFr }
                : null,
            // Branch-level stock info
            branch: {
                id: branchId,
                stockType: item.branchStockType,
                stockQty: item.branchStockQty,
                status: item.branchStatus,
                reason: item.branchStatus === "inactive"
                    ? "inactive_in_branch"
                    : "stock_exhausted",
            },
        }));
        return (0, response_1.SuccessResponse)(res, {
            message: "Get out-of-stock foods for branch success",
            data: result,
        });
    }
    // =========================================================
    // RESTAURANT VIEW: Return globally OOS foods + foods with unavailable branches
    // =========================================================
    const rawFoods = await connection_1.db
        .select({
        id: schema_1.food.id,
        name: schema_1.food.name,
        nameAr: schema_1.food.nameAr,
        nameFr: schema_1.food.nameFr,
        description: schema_1.food.description,
        descriptionAr: schema_1.food.descriptionAr,
        descriptionFr: schema_1.food.descriptionFr,
        image: schema_1.food.image,
        price: schema_1.food.price,
        status: schema_1.food.status,
        isOutOfStock: schema_1.food.isOutOfStock,
        stock_type: schema_1.food.stock_type,
        foodtype: schema_1.food.foodtype,
        startTime: schema_1.food.startTime,
        endTime: schema_1.food.endTime,
        discount_type: schema_1.food.discount_type,
        discount_value: schema_1.food.discount_value,
        Maximum_Purchase: schema_1.food.Maximum_Purchase,
        points: schema_1.food.points,
        createdAt: schema_1.food.createdAt,
        updatedAt: schema_1.food.updatedAt,
        category_name: schema_1.categories.name,
        category_nameAr: schema_1.categories.nameAr,
        category_nameFr: schema_1.categories.nameFr,
        subcategory_name: schema_1.subcategories.name,
        subcategory_nameAr: schema_1.subcategories.nameAr,
        subcategory_nameFr: schema_1.subcategories.nameFr,
    })
        .from(schema_1.food)
        .leftJoin(schema_1.categories, (0, drizzle_orm_1.eq)(schema_1.food.categoryid, schema_1.categories.id))
        .leftJoin(schema_1.subcategories, (0, drizzle_orm_1.eq)(schema_1.food.subcategoryid, schema_1.subcategories.id))
        .where((0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId));
    if (rawFoods.length === 0) {
        return (0, response_1.SuccessResponse)(res, {
            message: "Get out-of-stock foods success",
            data: [],
        });
    }
    const foodIds = rawFoods.map((f) => f.id);
    const unavailableBranchesMap = await (0, food_helper_1.getUnavailableBranchesForFoods)(foodIds);
    const filtered = rawFoods.filter((f) => f.isOutOfStock || (unavailableBranchesMap.get(f.id)?.length ?? 0) > 0);
    if (filtered.length === 0) {
        return (0, response_1.SuccessResponse)(res, {
            message: "Get out-of-stock foods success",
            data: [],
        });
    }
    const result = filtered.map((f) => ({
        id: f.id,
        name: f.name,
        nameAr: f.nameAr,
        nameFr: f.nameFr,
        description: f.description,
        descriptionAr: f.descriptionAr,
        descriptionFr: f.descriptionFr,
        image: f.image,
        price: f.price,
        status: f.status,
        isOutOfStock: f.isOutOfStock,
        stock_type: f.stock_type,
        foodtype: f.foodtype,
        startTime: f.startTime,
        endTime: f.endTime,
        discount_type: f.discount_type,
        discount_value: f.discount_value,
        Maximum_Purchase: f.Maximum_Purchase,
        points: f.points ?? 0,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
        category: f.category_name
            ? { name: f.category_name, nameAr: f.category_nameAr, nameFr: f.category_nameFr }
            : null,
        subcategory: f.subcategory_name
            ? { name: f.subcategory_name, nameAr: f.subcategory_nameAr, nameFr: f.subcategory_nameFr }
            : null,
        unavailableBranches: unavailableBranchesMap.get(f.id) ?? [],
    }));
    return (0, response_1.SuccessResponse)(res, {
        message: "Get out-of-stock foods success",
        data: result,
    });
};
exports.getOutOfStockFoods = getOutOfStockFoods;
