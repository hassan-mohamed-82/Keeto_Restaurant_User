"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.changeFoodOrderLevel = exports.bulkApplyFoodDiscount = exports.getActiveInStockFoods = exports.getOutOfStockFoods = exports.toggleFoodOutOfStock = exports.changeFoodStatus = exports.toggleVariationOptionStatus = exports.toggleVariationStatus = exports.getFoodSelectData = exports.restoreFoodById = exports.deleteFood = exports.updateFood = exports.getFoodById = exports.getAllFoods = exports.createFood = void 0;
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
const foodConditions_1 = require("../../helpers/foodConditions");
const pricing_overrides_1 = require("../../helpers/pricing.overrides");
const menu_rules_1 = require("../../helpers/menu.rules");
const menu_insert_1 = require("../../helpers/menu.insert");
const menuSoftDelete_service_1 = require("../../services/menuSoftDelete.service");
const weightPricing_helper_1 = require("../../helpers/weightPricing.helper");
// =============================================
// CREATE Food
// =============================================
/**
 * Normalises the weight-group fields of incoming variations (booleans may arrive as strings).
 * Accepts isWeightGroup / is_weight_group and weightValue / weight_value.
 */
const normalizeWeightVariationInput = (variations) => {
    let list = variations;
    if (typeof list === "string") {
        try {
            list = JSON.parse(list);
        }
        catch {
            return variations;
        }
    }
    if (!Array.isArray(list))
        return variations;
    return list.map((v) => {
        if (!v || typeof v !== "object")
            return v;
        const isWeightGroup = (0, weightPricing_helper_1.parseBooleanInput)(v.isWeightGroup ?? v.is_weight_group);
        return {
            ...v,
            ...(isWeightGroup !== undefined ? { isWeightGroup } : {}),
            options: Array.isArray(v.options)
                ? v.options.map((o) => (o && typeof o === "object" && o.weightValue === undefined && o.weight_value !== undefined
                    ? { ...o, weightValue: o.weight_value }
                    : o))
                : v.options,
        };
    });
};
const createFood = async (req, res) => {
    try {
        const restaurantId = req.user?.restaurantId || req.user?.id;
        if (!restaurantId) {
            throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
        }
        const { name, description, image, categoryid, subcategoryid, foodtype, Nutrition, allergen_ingredients, is_Halal, startTime, endTime, search_tags, price, discount_type, discount_value, Maximum_Purchase, stock_type, status, variations, points, nameAr, nameFr, descriptionAr, descriptionFr, isOutOfStock, sold_by, weight_unit, allow_custom_weight, channel, } = req.body;
        const finalChannel = (channel && ["all", "online", "pos"].includes(String(channel).trim().toLowerCase()))
            ? String(channel).trim().toLowerCase()
            : "all";
        const incomingAddons = req.body.addonsId ?? req.body.addons ?? req.body.addonIds ?? req.body['addonsId[]'] ?? req.body['addons[]'];
        // 1. التحقق من الحقول المطلوبة (الصورة مطلوبة هنا، واختيارية في الـ bulk import)
        if ((0, menu_rules_1.getMissingFoodFields)({ name, description, image, categoryid, price }, { requireImage: true }).length > 0) {
            throw new BadRequest_1.BadRequest(menu_rules_1.MENU_MESSAGES.foodRequiredFields);
        }
        // 2. التحقق من وجود العلاقات
        const existingCategory = await connection_1.db.select().from(schema_1.categories).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.categories.id, categoryid), (0, drizzle_orm_1.eq)(schema_1.categories.isDeleted, false))).limit(1);
        if (!existingCategory[0])
            throw new BadRequest_1.BadRequest(menu_rules_1.MENU_MESSAGES.categoryNotFound);
        if (subcategoryid) {
            const existingSub = await connection_1.db
                .select({ id: schema_1.subcategories.id, status: schema_1.subcategories.status })
                .from(schema_1.subcategories)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.subcategories.id, subcategoryid), (0, drizzle_orm_1.eq)(schema_1.subcategories.isDeleted, false)))
                .limit(1);
            if (!existingSub[0])
                throw new BadRequest_1.BadRequest(menu_rules_1.MENU_MESSAGES.subcategoryNotFound);
            // ✅ Block creating an active food under an inactive subcategory
            if ((0, menu_rules_1.blocksActiveFoodUnderInactiveSubcategory)(status, existingSub[0].status)) {
                throw new BadRequest_1.BadRequest(menu_rules_1.MENU_MESSAGES.activeFoodUnderInactiveSubcategory);
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
                throw new BadRequest_1.BadRequest(menu_rules_1.MENU_MESSAGES.foodAddonsInvalid);
            }
        }
        // 4. معالجة الصورة
        let imageUrl = image;
        if (image && image.startsWith("data:image")) {
            imageUrl = await (0, handleImages_1.saveBase64Image)(image, req, "foods");
        }
        // 5. بدء المعاملة (Transaction) لحفظ البيانات
        // Weight selling cross-validation
        if (sold_by === "weight" && !weight_unit) {
            throw new BadRequest_1.BadRequest("weight_unit is required when sold_by is 'weight'");
        }
        if (sold_by !== "weight" && weight_unit) {
            throw new BadRequest_1.BadRequest("weight_unit must be null when sold_by is 'unit'");
        }
        // الـ insert نفسه (الأكلة + variations + options + branchMenuItems) في helper مشترك مع الـ bulk import
        const foodId = await connection_1.db.transaction((tx) => (0, menu_insert_1.insertFood)(tx, restaurantId, {
            name, nameAr, nameFr,
            description, descriptionAr, descriptionFr,
            image: imageUrl,
            categoryid,
            subcategoryid,
            foodtype,
            Nutrition,
            allergen_ingredients,
            is_Halal,
            addonsIds: finalAddonsIds, // ✅ حفظ المصفوفة النظيفة
            startTime, endTime, search_tags,
            price, discount_type, discount_value,
            Maximum_Purchase,
            stock_type, status,
            isOutOfStock,
            points,
            sold_by: sold_by || "unit",
            weight_unit: sold_by === "weight" ? weight_unit : null,
            allow_custom_weight: (0, weightPricing_helper_1.parseBooleanInput)(allow_custom_weight),
            channel: finalChannel,
            variations: normalizeWeightVariationInput(variations),
            branches: req.body.branches,
        }));
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
    const { categoryId, subCategoryId, channel } = req.query;
    // 2. Build dynamic conditions
    // ?deleted=true -> trash list, otherwise only non-deleted foods
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.food.isDeleted, (0, menuSoftDelete_service_1.isTrashRequest)(req)), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)];
    if (categoryId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.food.categoryid, categoryId));
    }
    if (subCategoryId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.food.subcategoryid, subCategoryId));
    }
    if (channel && typeof channel === "string") {
        const cleanChannel = channel.trim().toLowerCase();
        if (cleanChannel === "online" || cleanChannel === "pos") {
            conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.food.channel, cleanChannel), (0, drizzle_orm_1.eq)(schema_1.food.channel, "all")));
        }
    }
    const rawFoods = await connection_1.db.select({
        id: schema_1.food.id, name: schema_1.food.name, nameAr: schema_1.food.nameAr, nameFr: schema_1.food.nameFr, order_level: schema_1.food.order_level,
        description: schema_1.food.description, descriptionAr: schema_1.food.descriptionAr, descriptionFr: schema_1.food.descriptionFr,
        image: schema_1.food.image, restaurantid: schema_1.food.restaurantid, categoryid: schema_1.food.categoryid, subcategoryid: schema_1.food.subcategoryid,
        foodtype: schema_1.food.foodtype, Nutrition: schema_1.food.Nutrition, allergen_ingredients: schema_1.food.allergen_ingredients,
        is_Halal: schema_1.food.is_Halal, isOutOfStock: schema_1.food.isOutOfStock, addonsId: schema_1.food.addonsId, startTime: schema_1.food.startTime, endTime: schema_1.food.endTime,
        search_tags: schema_1.food.search_tags, price: schema_1.food.price, discount_type: schema_1.food.discount_type, discount_value: schema_1.food.discount_value,
        Maximum_Purchase: schema_1.food.Maximum_Purchase, points: schema_1.food.points, stock_type: schema_1.food.stock_type, status: schema_1.food.status,
        channel: schema_1.food.channel,
        sold_by: schema_1.food.sold_by, weight_unit: schema_1.food.weight_unit, allow_custom_weight: schema_1.food.allow_custom_weight,
        isDeleted: schema_1.food.isDeleted, deletedAt: schema_1.food.deletedAt,
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
            id: f.id, name: f.name, nameAr: f.nameAr, nameFr: f.nameFr, order_level: f.order_level,
            description: f.description, descriptionAr: f.descriptionAr, descriptionFr: f.descriptionFr,
            image: f.image, price: f.price, status: f.status,
            addonsId: cleanAddonsArray,
            addonsDetails: foodAddonsDetails,
            foodtype: f.foodtype, Nutrition: f.Nutrition, allergen_ingredients: f.allergen_ingredients,
            is_Halal: f.is_Halal, isOutOfStock: f.isOutOfStock, startTime: f.startTime, endTime: f.endTime, search_tags: f.search_tags,
            discount_type: f.discount_type, discount_value: f.discount_value, Maximum_Purchase: f.Maximum_Purchase,
            points: f.points ?? 0,
            sold_by: f.sold_by, weight_unit: f.weight_unit, allow_custom_weight: f.allow_custom_weight,
            stock_type: f.stock_type, createdAt: f.createdAt, updatedAt: f.updatedAt,
            isDeleted: f.isDeleted, deletedAt: f.deletedAt,
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
        id: schema_1.food.id, name: schema_1.food.name, nameAr: schema_1.food.nameAr, nameFr: schema_1.food.nameFr, order_level: schema_1.food.order_level,
        description: schema_1.food.description, descriptionAr: schema_1.food.descriptionAr, descriptionFr: schema_1.food.descriptionFr,
        image: schema_1.food.image, restaurantid: schema_1.food.restaurantid, categoryid: schema_1.food.categoryid, subcategoryid: schema_1.food.subcategoryid,
        foodtype: schema_1.food.foodtype, Nutrition: schema_1.food.Nutrition, allergen_ingredients: schema_1.food.allergen_ingredients,
        is_Halal: schema_1.food.is_Halal, isOutOfStock: schema_1.food.isOutOfStock, addonsId: schema_1.food.addonsId, startTime: schema_1.food.startTime, endTime: schema_1.food.endTime,
        search_tags: schema_1.food.search_tags, price: schema_1.food.price, discount_type: schema_1.food.discount_type, discount_value: schema_1.food.discount_value,
        Maximum_Purchase: schema_1.food.Maximum_Purchase, points: schema_1.food.points, stock_type: schema_1.food.stock_type, status: schema_1.food.status,
        channel: schema_1.food.channel,
        sold_by: schema_1.food.sold_by, weight_unit: schema_1.food.weight_unit, allow_custom_weight: schema_1.food.allow_custom_weight,
        createdAt: schema_1.food.createdAt, updatedAt: schema_1.food.updatedAt,
        restaurant: { id: schema_1.restaurants.id, name: schema_1.restaurants.name },
        category: { id: schema_1.categories.id, name: schema_1.categories.name, nameAr: schema_1.categories.nameAr, nameFr: schema_1.categories.nameFr },
        subcategory: { id: schema_1.subcategories.id, name: schema_1.subcategories.name, nameAr: schema_1.subcategories.nameAr, nameFr: schema_1.subcategories.nameFr },
    })
        .from(schema_1.food)
        .leftJoin(schema_1.restaurants, (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, schema_1.restaurants.id))
        .leftJoin(schema_1.categories, (0, drizzle_orm_1.eq)(schema_1.food.categoryid, schema_1.categories.id))
        .leftJoin(schema_1.subcategories, (0, drizzle_orm_1.eq)(schema_1.food.subcategoryid, schema_1.subcategories.id))
        .where((0, drizzle_orm_1.and)(foodConditions_1.activeFoodCondition, (0, drizzle_orm_1.eq)(schema_1.food.id, id), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)))
        .limit(1);
    if (!foodItem[0])
        throw new NotFound_1.NotFound("Food not found");
    // 1. جلب أسعار الفروع الاستثنائية للوجبة (Branch Overrides)
    const branchPrices = await connection_1.db
        .select({
        branchId: schema_1.foodPricingOverrides.branchId,
        price: schema_1.foodPricingOverrides.price,
        status: schema_1.foodPricingOverrides.status,
        serviceModule: schema_1.foodPricingOverrides.serviceModule,
    })
        .from(schema_1.foodPricingOverrides)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.foodPricingOverrides.foodId, id), (0, drizzle_orm_1.isNull)(schema_1.foodPricingOverrides.serviceModule)));
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
    // ✅ تأكد إن الأكلة تخص نفس الريستورانت وغير محذوفة
    const existingFood = await connection_1.db
        .select()
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, id), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), foodConditions_1.activeFoodCondition))
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
        "points", "isOutOfStock",
        "sold_by", "weight_unit",
        "order_level",
        "channel",
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
    if (updateData.channel !== undefined) {
        const cleanChan = String(updateData.channel).trim().toLowerCase();
        if (!["all", "online", "pos"].includes(cleanChan)) {
            throw new BadRequest_1.BadRequest("channel must be 'all', 'online', or 'pos'");
        }
        updateData.channel = cleanChan;
    }
    // Weight selling cross-validation on update — four cases:
    //
    // 1. weight → unit  (sold_by='unit' explicitly sent)  → clear weight_unit silently ✅
    // 2. unit  → weight without weight_unit               → reject ✅
    // 3. weight_unit sent alone on a unit food            → reject ✅
    // 4. Other fields updated on existing unit food       → unchanged ✅
    const effectiveSoldBy = updateData.sold_by ?? existingFood[0].sold_by;
    const effectiveWeightUnit = updateData.weight_unit !== undefined ? updateData.weight_unit : existingFood[0].weight_unit;
    if (effectiveSoldBy === "weight" && !effectiveWeightUnit) {
        // Case 2: unit → weight without weight_unit
        throw new BadRequest_1.BadRequest("weight_unit is required when sold_by is 'weight'");
    }
    if (effectiveSoldBy !== "weight" && updateData.weight_unit) {
        // Case 1 vs Case 3: check whether sold_by was explicitly sent
        if (updateData.sold_by !== undefined) {
            // Case 1: explicit sold_by transition → clear weight_unit silently
            updateData.weight_unit = null;
        }
        else {
            // Case 3: weight_unit sent alone on a unit food → reject
            throw new BadRequest_1.BadRequest("Cannot set weight_unit on a food that is sold by unit");
        }
    }
    if (updateData.sold_by === "unit" && existingFood[0].sold_by === "weight") {
        const existingPerWeight = await connection_1.db
            .select({ id: schema_1.variationOptions.id })
            .from(schema_1.variationOptions)
            .innerJoin(schema_1.foodVariations, (0, drizzle_orm_1.eq)(schema_1.variationOptions.variationId, schema_1.foodVariations.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.foodVariations.foodId, id), (0, drizzle_orm_1.eq)(schema_1.variationOptions.priceMode, "per_weight")))
            .limit(1);
        const incomingVars = data.variations ?? data['variations[]'];
        if (existingPerWeight.length > 0 && incomingVars === undefined) {
            throw new BadRequest_1.BadRequest("Cannot switch food to unit while it has per_weight variation options. Update options to fixed first.");
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
    // ⚖️ Weight groups / custom weight / fixed discount on per-gram foods.
    // Validated on the EFFECTIVE result (incoming values over the stored ones) before any write.
    const incomingVariationsForWeight = Array.isArray(data.variations)
        ? normalizeWeightVariationInput(data.variations)
        : null;
    if (incomingVariationsForWeight)
        data.variations = incomingVariationsForWeight;
    const storedVars = await connection_1.db.select().from(schema_1.foodVariations).where((0, drizzle_orm_1.eq)(schema_1.foodVariations.foodId, id));
    const storedOpts = storedVars.length > 0
        ? await connection_1.db.select().from(schema_1.variationOptions).where((0, drizzle_orm_1.inArray)(schema_1.variationOptions.variationId, storedVars.map((v) => v.id)))
        : [];
    const effectiveWeightVariations = incomingVariationsForWeight
        ? incomingVariationsForWeight.map((v) => {
            const stored = v.id ? storedVars.find((sv) => sv.id === v.id) : undefined;
            return {
                name: v.name ?? stored?.name,
                isWeightGroup: v.isWeightGroup !== undefined ? v.isWeightGroup : Boolean(stored?.isWeightGroup),
                selectionType: v.selectionType ?? stored?.selectionType,
                options: (Array.isArray(v.options) ? v.options : []).map((o) => {
                    const storedOpt = o.id ? storedOpts.find((so) => so.id === o.id) : undefined;
                    return {
                        optionName: o.optionName ?? storedOpt?.optionName,
                        weightValue: o.weightValue !== undefined ? o.weightValue : (storedOpt?.weightValue ?? null),
                    };
                }),
            };
        })
        : storedVars.map((sv) => ({
            name: sv.name,
            isWeightGroup: Boolean(sv.isWeightGroup),
            selectionType: sv.selectionType,
            options: storedOpts.filter((so) => so.variationId === sv.id).map((so) => ({ optionName: so.optionName, weightValue: so.weightValue })),
        }));
    const incomingAllowCustom = (0, weightPricing_helper_1.parseBooleanInput)(data.allow_custom_weight);
    const weightConfig = (0, weightPricing_helper_1.validateWeightGroupConfig)({
        soldBy: effectiveSoldBy,
        weightUnit: effectiveSoldBy === "weight" ? (updateData.weight_unit !== undefined ? updateData.weight_unit : existingFood[0].weight_unit) : null,
        // switching a food back to unit resets it to true (validateWeightGroupConfig returns true for unit foods)
        allowCustomWeight: effectiveSoldBy === "weight"
            ? (incomingAllowCustom !== undefined ? incomingAllowCustom : existingFood[0].allow_custom_weight)
            : (incomingAllowCustom === false ? false : true),
        variations: effectiveWeightVariations,
    });
    updateData.allow_custom_weight = weightConfig.allowCustomWeight;
    if ((0, weightPricing_helper_1.isFixedDiscountOnGramFood)({
        soldBy: effectiveSoldBy,
        weightUnit: effectiveSoldBy === "weight" ? (updateData.weight_unit !== undefined ? updateData.weight_unit : existingFood[0].weight_unit) : null,
        discountType: updateData.discount_type !== undefined ? updateData.discount_type : existingFood[0].discount_type,
        discountValue: updateData.discount_value !== undefined ? updateData.discount_value : existingFood[0].discount_value,
    })) {
        throw new BadRequest_1.BadRequest(weightPricing_helper_1.FIXED_DISCOUNT_ON_GRAM_MESSAGE);
    }
    // ✅ تنفيذ التحديث الرئيسي للأكلة
    if (Object.keys(updateData).length > 1) {
        await connection_1.db.update(schema_1.food).set(updateData).where((0, drizzle_orm_1.eq)(schema_1.food.id, id));
    }
    // Variations not sent: keep the stored weight group's "required" in line with allow_custom_weight.
    if (!incomingVariationsForWeight && weightConfig.weightGroups.size > 0) {
        await connection_1.db.update(schema_1.foodVariations)
            .set({ isRequired: !weightConfig.allowCustomWeight, selectionType: "single" })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.foodVariations.foodId, id), (0, drizzle_orm_1.eq)(schema_1.foodVariations.isWeightGroup, true)));
    }
    // ===========================
    // ✅ Variations Update (Non-destructive Upsert)
    // ===========================
    if (data.variations && Array.isArray(data.variations)) {
        const oldVars = await connection_1.db
            .select()
            .from(schema_1.foodVariations)
            .where((0, drizzle_orm_1.eq)(schema_1.foodVariations.foodId, id));
        const oldVarIds = oldVars.map(v => v.id);
        const oldOptions = oldVarIds.length > 0
            ? await connection_1.db.select().from(schema_1.variationOptions).where((0, drizzle_orm_1.inArray)(schema_1.variationOptions.variationId, oldVarIds))
            : [];
        const incomingVarIds = new Set();
        const incomingOptIds = new Set();
        for (const [variationIndex, variation] of data.variations.entries()) {
            let variationId = variation.id;
            const existingVar = variationId ? oldVars.find(v => v.id === variationId) : null;
            const weightGroup = weightConfig.weightGroups.get(variationIndex);
            if (existingVar) {
                // Update existing variation
                await connection_1.db.update(schema_1.foodVariations).set({
                    name: variation.name,
                    nameAr: variation.nameAr ?? existingVar.nameAr,
                    nameFr: variation.nameFr ?? existingVar.nameFr,
                    isRequired: weightGroup ? weightGroup.isRequired : (variation.isRequired !== undefined ? variation.isRequired : existingVar.isRequired),
                    selectionType: weightGroup ? weightGroup.selectionType : (variation.selectionType || existingVar.selectionType),
                    min: weightGroup ? null : (variation.min !== undefined ? variation.min : existingVar.min),
                    max: weightGroup ? null : (variation.max !== undefined ? variation.max : existingVar.max),
                    status: variation.status !== undefined ? variation.status : existingVar.status,
                    isWeightGroup: Boolean(weightGroup),
                }).where((0, drizzle_orm_1.eq)(schema_1.foodVariations.id, variationId));
            }
            else {
                // Insert new variation
                variationId = variationId || (0, uuid_1.v4)();
                await connection_1.db.insert(schema_1.foodVariations).values({
                    id: variationId,
                    foodId: id,
                    name: variation.name,
                    nameAr: variation.nameAr || '',
                    nameFr: variation.nameFr || '',
                    isRequired: weightGroup ? weightGroup.isRequired : (variation.isRequired || false),
                    selectionType: weightGroup ? weightGroup.selectionType : (variation.selectionType || "single"),
                    min: weightGroup ? null : (variation.min ?? null),
                    max: weightGroup ? null : (variation.max ?? null),
                    status: variation.status !== undefined ? variation.status : true,
                    isWeightGroup: Boolean(weightGroup),
                });
            }
            incomingVarIds.add(variationId);
            // Handle options for this variation
            if (variation.options && Array.isArray(variation.options)) {
                for (const [optionIndex, option] of variation.options.entries()) {
                    let optionId = option.id;
                    const optionWeightValue = weightConfig.weightValues.get(`${variationIndex}:${optionIndex}`) ?? null;
                    const existingOpt = optionId ? oldOptions.find(o => o.id === optionId) : null;
                    const additionalPriceStr = option.additionalPrice !== undefined && option.additionalPrice !== null
                        ? option.additionalPrice.toString()
                        : "0";
                    const optionPriceMode = option.priceMode ?? (existingOpt?.priceMode ?? "fixed");
                    const resolvedPriceMode = (effectiveSoldBy !== "weight" && optionPriceMode === "per_weight")
                        ? "fixed"
                        : optionPriceMode;
                    const addPriceNum = parseFloat(additionalPriceStr);
                    if (isNaN(addPriceNum) || addPriceNum < 0) {
                        throw new BadRequest_1.BadRequest("Option additional price must be greater than or equal to 0");
                    }
                    if (existingOpt) {
                        // Update existing option (preserves UUID!)
                        await connection_1.db.update(schema_1.variationOptions).set({
                            variationId,
                            optionName: option.optionName,
                            optionNameAr: option.optionNameAr ?? existingOpt.optionNameAr,
                            optionNameFr: option.optionNameFr ?? existingOpt.optionNameFr,
                            additionalPrice: additionalPriceStr,
                            priceMode: resolvedPriceMode,
                            weightValue: optionWeightValue,
                            status: option.status !== undefined ? option.status : existingOpt.status,
                            isDefault: option.isDefault !== undefined ? option.isDefault : existingOpt.isDefault,
                        }).where((0, drizzle_orm_1.eq)(schema_1.variationOptions.id, optionId));
                    }
                    else {
                        // Insert new option
                        optionId = optionId || (0, uuid_1.v4)();
                        await connection_1.db.insert(schema_1.variationOptions).values({
                            id: optionId,
                            variationId,
                            optionName: option.optionName,
                            optionNameAr: option.optionNameAr || '',
                            optionNameFr: option.optionNameFr || '',
                            additionalPrice: additionalPriceStr,
                            priceMode: resolvedPriceMode,
                            weightValue: optionWeightValue,
                            status: option.status !== undefined ? option.status : true,
                            isDefault: option.isDefault !== undefined ? option.isDefault : false,
                        });
                    }
                    incomingOptIds.add(optionId);
                }
            }
        }
        // Delete options that were explicitly removed
        const optionsToDelete = oldOptions.filter(o => !incomingOptIds.has(o.id));
        if (optionsToDelete.length > 0) {
            await connection_1.db.delete(schema_1.variationOptions).where((0, drizzle_orm_1.inArray)(schema_1.variationOptions.id, optionsToDelete.map(o => o.id)));
        }
        // Delete variations that were explicitly removed
        const varsToDelete = oldVars.filter(v => !incomingVarIds.has(v.id));
        if (varsToDelete.length > 0) {
            await connection_1.db.delete(schema_1.foodVariations).where((0, drizzle_orm_1.inArray)(schema_1.foodVariations.id, varsToDelete.map(v => v.id)));
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
                    .set({ status: statusVal, updatedAt: new Date() })
                    .where((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.id, existing.id));
            }
            else {
                await connection_1.db.insert(schema_1.branchMenuItems).values({
                    id: (0, uuid_1.v4)(),
                    branchId: b.branchId,
                    foodId: id,
                    status: statusVal,
                });
            }
            if (b.price !== undefined && b.price !== null && b.price !== "") {
                await (0, pricing_overrides_1.upsertFoodPricingOverride)(connection_1.db, {
                    foodId: id,
                    branchId: b.branchId,
                    serviceModule: null,
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
            await (0, pricing_overrides_1.upsertFoodPricingOverride)(connection_1.db, {
                foodId: id,
                branchId: targetBranchId,
                serviceModule,
                price: priceVal,
                status: statusVal,
            });
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
            await (0, pricing_overrides_1.upsertVariantPricingOverride)(connection_1.db, {
                variantId,
                branchId: targetBranchId,
                serviceModule,
                price: priceVal,
                status: statusVal,
            });
        }
    }
    return (0, response_1.SuccessResponse)(res, {
        message: "Update food success",
    });
};
exports.updateFood = updateFood;
// =============================================
// SOFT DELETE Food
// Keeps the row (variations, pricing, order history) and hides it via isDeleted.
// =============================================
const deleteFood = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const data = await (0, menuSoftDelete_service_1.softDeleteFood)(restaurantId, req.params.id);
    return (0, response_1.SuccessResponse)(res, { message: "Food moved to trash", data });
};
exports.deleteFood = deleteFood;
// =============================================
// RESTORE Food
// =============================================
const restoreFoodById = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const data = await (0, menuSoftDelete_service_1.restoreFood)(restaurantId, req.params.id);
    return (0, response_1.SuccessResponse)(res, { message: "Food restored successfully", data });
};
exports.restoreFoodById = restoreFoodById;
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
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.categories.status, "active"), (0, drizzle_orm_1.eq)(schema_1.categories.isDeleted, false)));
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
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId)), (0, drizzle_orm_1.eq)(schema_1.subcategories.isDeleted, false)));
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
        .innerJoin(schema_1.food, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.foodVariations.foodId, schema_1.food.id), foodConditions_1.activeFoodCondition))
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
        .innerJoin(schema_1.food, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.foodVariations.foodId, schema_1.food.id), foodConditions_1.activeFoodCondition))
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
    const userBranchId = req.user?.branchId;
    const branchId = req.params.branchId ||
        req.body?.branchId ||
        req.query?.branchId ||
        userBranchId ||
        undefined;
    // Accept explicit status or toggle
    const { status: rawStatus } = req.body;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    if (branchId && userBranchId && userBranchId !== branchId) {
        throw new BadRequest_1.BadRequest("Unauthorized: You cannot manage another branch's status");
    }
    const [existingFood] = await connection_1.db
        .select({
        id: schema_1.food.id,
        status: schema_1.food.status,
        subcategoryid: schema_1.food.subcategoryid,
    })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, id), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), foodConditions_1.activeFoodCondition))
        .limit(1);
    if (!existingFood)
        throw new NotFound_1.NotFound("Food not found or does not belong to you");
    // ── Branch-level toggle / update ───────────────────────────────
    if (branchId) {
        const [branchCheck] = await connection_1.db
            .select({ id: schema_1.branches.id })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.id, branchId), (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId)))
            .limit(1);
        if (!branchCheck)
            throw new BadRequest_1.BadRequest("Branch not found or does not belong to your restaurant");
        const [existingBranchItem] = await connection_1.db
            .select({ id: schema_1.branchMenuItems.id, status: schema_1.branchMenuItems.status })
            .from(schema_1.branchMenuItems)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.foodId, id), (0, drizzle_orm_1.eq)(schema_1.branchMenuItems.branchId, branchId)))
            .limit(1);
        // Determine new status
        let newStatus;
        if (rawStatus === "active" || rawStatus === "inactive") {
            newStatus = rawStatus;
        }
        else {
            // Toggle from current branch override, fallback to global status
            const current = existingBranchItem?.status ?? existingFood.status;
            newStatus = current === "active" ? "inactive" : "active";
        }
        // Upsert branchMenuItems
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
    // ── Global toggle / update ─────────────────────────────────────
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
// PUT /foods/out-of-stock/:id
// PUT /foods/:id/out-of-stock
// PUT /foods/:id/branch/:branchId/out-of-stock
// Body: { isOutOfStock?: boolean, branchId?: string }
// - With branchId: Updates stockType & stockQty in branchMenuItems for this branch ONLY
// - Without branchId: Updates food.isOutOfStock globally for all branches
// ============================================================================
const toggleFoodOutOfStock = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const userBranchId = req.user?.branchId;
    const branchId = req.params.branchId ||
        req.body?.branchId ||
        req.query?.branchId ||
        userBranchId ||
        undefined;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    if (branchId && userBranchId && userBranchId !== branchId) {
        throw new BadRequest_1.BadRequest("Unauthorized: You cannot manage another branch's stock");
    }
    const [existingFood] = await connection_1.db
        .select({ id: schema_1.food.id, isOutOfStock: schema_1.food.isOutOfStock, subcategoryid: schema_1.food.subcategoryid })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, id), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), foodConditions_1.activeFoodCondition))
        .limit(1);
    if (!existingFood)
        throw new NotFound_1.NotFound("Food not found or does not belong to you");
    // ── Branch-level toggle / update ───────────────────────────────
    if (branchId) {
        const [branchCheck] = await connection_1.db
            .select({ id: schema_1.branches.id })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.id, branchId), (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId)))
            .limit(1);
        if (!branchCheck)
            throw new BadRequest_1.BadRequest("Branch not found or does not belong to your restaurant");
        const [existingBranchItem] = await connection_1.db
            .select({
            id: schema_1.branchMenuItems.id,
            stockType: schema_1.branchMenuItems.stockType,
            stockQty: schema_1.branchMenuItems.stockQty,
            status: schema_1.branchMenuItems.status,
        })
            .from(schema_1.branchMenuItems)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.foodId, id), (0, drizzle_orm_1.eq)(schema_1.branchMenuItems.branchId, branchId)))
            .limit(1);
        // Determine new OOS value for branch
        let newIsOOS;
        if (req.body?.isOutOfStock !== undefined) {
            newIsOOS = Boolean(req.body.isOutOfStock);
        }
        else if (existingBranchItem) {
            const isCurrentlyOOS = existingBranchItem.stockType === "limited" && (existingBranchItem.stockQty ?? 0) <= 0;
            newIsOOS = !isCurrentlyOOS;
        }
        else {
            // Fallback to current global food state
            newIsOOS = !existingFood.isOutOfStock;
        }
        const targetStockType = newIsOOS ? "limited" : "unlimited";
        const targetStockQty = 0;
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
        // Recompute subcategory branch-level status & OOS
        if (existingFood.subcategoryid) {
            await recomputeSubcategoryBranchStatus(existingFood.subcategoryid, branchId, restaurantId);
        }
        return (0, response_1.SuccessResponse)(res, {
            message: `Food isOutOfStock in branch updated to ${newIsOOS}`,
            data: { foodId: id, branchId, isOutOfStock: newIsOOS },
        });
    }
    // ── Global toggle / update ─────────────────────────────────────
    const newIsOOS = req.body?.isOutOfStock !== undefined
        ? Boolean(req.body.isOutOfStock)
        : !existingFood.isOutOfStock;
    // Update food.isOutOfStock globally
    await connection_1.db.update(schema_1.food).set({ isOutOfStock: newIsOOS, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.food.id, id));
    // Recompute subcategory global status & OOS
    if (existingFood.subcategoryid) {
        await recomputeSubcategoryGlobalStatus(existingFood.subcategoryid, restaurantId);
    }
    return (0, response_1.SuccessResponse)(res, {
        message: `Food isOutOfStock set to ${newIsOOS}`,
        data: { foodId: id, isOutOfStock: newIsOOS },
    });
};
exports.toggleFoodOutOfStock = toggleFoodOutOfStock;
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
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.subcategoryid, subcategoryId), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), foodConditions_1.activeFoodCondition));
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
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.subcategoryid, subcategoryId), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), foodConditions_1.activeFoodCondition));
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
            channel: schema_1.food.channel,
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
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.branchId, branchId), foodConditions_1.activeFoodCondition, (0, drizzle_orm_1.or)(
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
        channel: schema_1.food.channel,
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
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), foodConditions_1.activeFoodCondition));
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
/**
 * 🟢 Returns all active and in-stock foods with their active variations (and options with priceMode)
 * and addons, formatted for the staff UI selector when adding items to weight requests.
 */
const getActiveInStockFoods = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const conditions = [
        foodConditions_1.activeFoodCondition,
        (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId),
        (0, drizzle_orm_1.eq)(schema_1.food.status, "active"),
        (0, drizzle_orm_1.eq)(schema_1.food.isOutOfStock, false),
    ];
    if (req.query.sold_by) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.food.sold_by, req.query.sold_by));
    }
    if (req.query.categoryId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.food.categoryid, req.query.categoryId));
    }
    if (req.query.subCategoryId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.food.subcategoryid, req.query.subCategoryId));
    }
    if (req.query.channel && typeof req.query.channel === "string") {
        const cleanChannel = req.query.channel.trim().toLowerCase();
        if (cleanChannel === "online" || cleanChannel === "pos") {
            conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.food.channel, cleanChannel), (0, drizzle_orm_1.eq)(schema_1.food.channel, "all")));
        }
    }
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
        channel: schema_1.food.channel,
        sold_by: schema_1.food.sold_by,
        weight_unit: schema_1.food.weight_unit,
        allow_custom_weight: schema_1.food.allow_custom_weight,
        categoryid: schema_1.food.categoryid,
        subcategoryid: schema_1.food.subcategoryid,
        category_name: schema_1.categories.name,
        category_nameAr: schema_1.categories.nameAr,
        subcategory_name: schema_1.subcategories.name,
        subcategory_nameAr: schema_1.subcategories.nameAr,
        addonsId: schema_1.food.addonsId,
    })
        .from(schema_1.food)
        .leftJoin(schema_1.categories, (0, drizzle_orm_1.eq)(schema_1.food.categoryid, schema_1.categories.id))
        .leftJoin(schema_1.subcategories, (0, drizzle_orm_1.eq)(schema_1.food.subcategoryid, schema_1.subcategories.id))
        .where((0, drizzle_orm_1.and)(...conditions));
    if (rawFoods.length === 0) {
        return (0, response_1.SuccessResponse)(res, {
            message: "Active in-stock foods fetched successfully",
            data: [],
        });
    }
    const foodIds = rawFoods.map((f) => f.id);
    // Fetch active variations and their active options
    const allVars = await connection_1.db
        .select({
        id: schema_1.foodVariations.id,
        foodId: schema_1.foodVariations.foodId,
        name: schema_1.foodVariations.name,
        nameAr: schema_1.foodVariations.nameAr,
        nameFr: schema_1.foodVariations.nameFr,
        isRequired: schema_1.foodVariations.isRequired,
        selectionType: schema_1.foodVariations.selectionType,
        isWeightGroup: schema_1.foodVariations.isWeightGroup,
        status: schema_1.foodVariations.status,
    })
        .from(schema_1.foodVariations)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.foodVariations.foodId, foodIds), (0, drizzle_orm_1.eq)(schema_1.foodVariations.status, true)));
    const varIds = allVars.map((v) => v.id);
    const allOpts = varIds.length > 0
        ? await connection_1.db
            .select({
            id: schema_1.variationOptions.id,
            variationId: schema_1.variationOptions.variationId,
            optionName: schema_1.variationOptions.optionName,
            optionNameAr: schema_1.variationOptions.optionNameAr,
            optionNameFr: schema_1.variationOptions.optionNameFr,
            additionalPrice: schema_1.variationOptions.additionalPrice,
            priceMode: schema_1.variationOptions.priceMode,
            weightValue: schema_1.variationOptions.weightValue,
            status: schema_1.variationOptions.status,
        })
            .from(schema_1.variationOptions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.variationOptions.variationId, varIds), (0, drizzle_orm_1.eq)(schema_1.variationOptions.status, true)))
        : [];
    // Collect and fetch active addons
    const allAddonsIdsToFetch = new Set();
    rawFoods.forEach((f) => {
        let safeAddons = f.addonsId;
        if (typeof safeAddons === "string") {
            try {
                safeAddons = JSON.parse(safeAddons);
            }
            catch {
                safeAddons = [];
            }
        }
        const cleanAddons = Array.isArray(safeAddons) ? safeAddons : [];
        cleanAddons.forEach((id) => {
            if (typeof id === "string" && id.trim())
                allAddonsIdsToFetch.add(id.trim());
        });
    });
    const uniqueAddonIds = Array.from(allAddonsIdsToFetch);
    const dbAddons = uniqueAddonIds.length > 0
        ? await connection_1.db
            .select({
            id: schema_1.addons.id,
            name: schema_1.addons.name,
            nameAr: schema_1.addons.nameAr,
            nameFr: schema_1.addons.nameFr,
            price: schema_1.addons.price,
            status: schema_1.addons.status,
        })
            .from(schema_1.addons)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.addons.id, uniqueAddonIds), (0, drizzle_orm_1.eq)(schema_1.addons.status, "active")))
        : [];
    const addonsMap = new Map(dbAddons.map((a) => [a.id, a]));
    const data = rawFoods.map((f) => {
        const foodVars = allVars
            .filter((v) => v.foodId === f.id)
            .map((v) => ({
            id: v.id,
            name: v.name,
            nameAr: v.nameAr,
            nameFr: v.nameFr,
            isRequired: v.isRequired,
            selectionType: v.selectionType,
            isWeightGroup: Boolean(v.isWeightGroup),
            options: allOpts
                .filter((o) => o.variationId === v.id)
                .map((o) => ({
                id: o.id,
                optionName: o.optionName,
                optionNameAr: o.optionNameAr,
                optionNameFr: o.optionNameFr,
                additionalPrice: o.additionalPrice,
                priceMode: o.priceMode || "fixed",
                weightValue: o.weightValue ?? null,
            })),
        }));
        let parsedAddonsList = [];
        if (typeof f.addonsId === "string") {
            try {
                parsedAddonsList = JSON.parse(f.addonsId);
            }
            catch {
                parsedAddonsList = [];
            }
        }
        else if (Array.isArray(f.addonsId)) {
            parsedAddonsList = f.addonsId;
        }
        const foodAddons = parsedAddonsList
            .map((aid) => addonsMap.get(aid))
            .filter(Boolean)
            .map((a) => ({
            id: a.id,
            name: a.name,
            nameAr: a.nameAr,
            nameFr: a.nameFr,
            price: a.price,
        }));
        return {
            id: f.id,
            name: f.name,
            nameAr: f.nameAr,
            nameFr: f.nameFr,
            description: f.description,
            descriptionAr: f.descriptionAr,
            descriptionFr: f.descriptionFr,
            image: f.image,
            price: f.price,
            sold_by: f.sold_by || "unit",
            weight_unit: f.weight_unit || null,
            allow_custom_weight: f.allow_custom_weight ?? true,
            category: {
                id: f.categoryid,
                name: f.category_name,
                nameAr: f.category_nameAr,
            },
            subcategory: {
                id: f.subcategoryid,
                name: f.subcategory_name,
                nameAr: f.subcategory_nameAr,
            },
            variations: foodVars,
            addons: foodAddons,
        };
    });
    return (0, response_1.SuccessResponse)(res, {
        message: "Active in-stock foods fetched successfully",
        data,
    });
};
exports.getActiveInStockFoods = getActiveInStockFoods;
// =============================================
// BULK APPLY FOOD DISCOUNT
// =============================================
const bulkApplyFoodDiscount = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const discountType = (req.body.discountType || req.body.discount_type || "percentage");
    const rawVal = req.body.discountValue !== undefined ? req.body.discountValue : req.body.discount_value;
    const discountValNum = rawVal !== undefined && rawVal !== null && rawVal !== "" && !isNaN(Number(rawVal))
        ? Number(rawVal)
        : null;
    if (discountType === "percentage" && discountValNum !== null && (discountValNum < 0 || discountValNum > 100)) {
        throw new BadRequest_1.BadRequest("Discount percentage must be between 0 and 100");
    }
    if (discountType === "amount" && discountValNum !== null && discountValNum < 0) {
        throw new BadRequest_1.BadRequest("Discount amount must be non-negative");
    }
    const foodIds = Array.isArray(req.body.foodIds) ? req.body.foodIds.filter(Boolean) : [];
    const subCategoryIds = Array.isArray(req.body.subCategoryIds) ? req.body.subCategoryIds.filter(Boolean) : [];
    const categoryIds = Array.isArray(req.body.categoryIds) ? req.body.categoryIds.filter(Boolean) : [];
    const hasSpecificTarget = foodIds.length > 0 || subCategoryIds.length > 0 || categoryIds.length > 0;
    const targetConditions = [];
    if (foodIds.length > 0) {
        targetConditions.push((0, drizzle_orm_1.inArray)(schema_1.food.id, foodIds));
    }
    if (subCategoryIds.length > 0) {
        targetConditions.push((0, drizzle_orm_1.inArray)(schema_1.food.subcategoryid, subCategoryIds));
    }
    if (categoryIds.length > 0) {
        targetConditions.push((0, drizzle_orm_1.inArray)(schema_1.food.categoryid, categoryIds));
    }
    const whereClause = hasSpecificTarget
        ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), (0, drizzle_orm_1.or)(...targetConditions))
        : (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId);
    const discountValueToStore = discountValNum !== null && discountValNum > 0
        ? discountValNum.toFixed(2)
        : null;
    // ⚖️ A fixed-amount discount must not reach a product sold per gram (it is applied per gram).
    // Rejected as a whole, nothing applied, with the products that block it.
    if (discountType !== "percentage" && discountValueToStore !== null) {
        const gramFoods = await connection_1.db
            .select({ id: schema_1.food.id, name: schema_1.food.name })
            .from(schema_1.food)
            .where((0, drizzle_orm_1.and)(whereClause, (0, drizzle_orm_1.eq)(schema_1.food.sold_by, "weight"), (0, drizzle_orm_1.eq)(schema_1.food.weight_unit, "gm")))
            .limit(11);
        if (gramFoods.length > 0) {
            const names = gramFoods.slice(0, 10).map((f) => `"${f.name}"`).join(", ");
            throw new BadRequest_1.BadRequest(`${weightPricing_helper_1.FIXED_DISCOUNT_ON_GRAM_MESSAGE} Products sold per gram in this selection: ${names}${gramFoods.length > 10 ? ", ..." : ""}. Exclude them or use a percentage.`);
        }
    }
    await connection_1.db
        .update(schema_1.food)
        .set({
        discount_type: discountType,
        discount_value: discountValueToStore,
    })
        .where(whereClause);
    // Count affected items
    const [countResult] = await connection_1.db
        .select({ cnt: (0, drizzle_orm_1.sql) `count(*)` })
        .from(schema_1.food)
        .where(whereClause);
    const affectedCount = Number(countResult?.cnt || 0);
    return (0, response_1.SuccessResponse)(res, {
        message: discountValueToStore !== null
            ? `Discount applied successfully to ${affectedCount} items`
            : `Discount removed successfully from ${affectedCount} items`,
        data: {
            scope: hasSpecificTarget ? "targeted" : "all_restaurant_foods",
            affectedCount,
            discountType,
            discountValue: discountValueToStore,
            appliedFilters: {
                foodIds,
                subCategoryIds,
                categoryIds,
            },
        },
    });
};
exports.bulkApplyFoodDiscount = bulkApplyFoodDiscount;
// =============================================
// PATCH Food Order Level
// =============================================
const changeFoodOrderLevel = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const { order_level } = req.body;
    if (order_level === undefined || order_level === null) {
        throw new BadRequest_1.BadRequest("order_level is required");
    }
    const parsed = parseInt(order_level, 10);
    if (isNaN(parsed) || parsed < 0) {
        throw new BadRequest_1.BadRequest("order_level must be a non-negative integer");
    }
    const existing = await connection_1.db
        .select({ id: schema_1.food.id })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, id), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), foodConditions_1.activeFoodCondition))
        .limit(1);
    if (!existing[0])
        throw new NotFound_1.NotFound("Food not found or you don't have permission to edit it");
    await connection_1.db
        .update(schema_1.food)
        .set({ order_level: parsed, updatedAt: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.food.id, id));
    return (0, response_1.SuccessResponse)(res, {
        message: "Food order level updated successfully",
        data: { id, order_level: parsed },
    });
};
exports.changeFoodOrderLevel = changeFoodOrderLevel;
