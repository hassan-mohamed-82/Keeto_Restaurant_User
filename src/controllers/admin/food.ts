import { Request, Response } from "express";
import { db } from "../../models/connection";
import {
    food,
    foodVariations,
    variationOptions,
    restaurants,
    categories,
    subcategories,
    branchSubcategories,
    addons,
    foodIngredients,
    ingredients,
    ingredientCategories,
    branchMenuItems,
    branches,
    orderItems,
    cartItems,
    favorites,
    branchIngredientLocks,
    pointsProducts,
    redeemRequests,
    foodPricingOverrides,
    variantPricingOverrides,
} from "../../models/schema";
import { getUnavailableBranchesForFoods } from "../../helpers/food.helper";
// ✅ تم إضافة and, or, isNull هنا عشان نصلح مشكلة الشروط المتعددة
import { eq, inArray, and, or, isNull, lte, sql } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { NotFound } from "../../Errors/NotFound";
import { BadRequest } from "../../Errors/BadRequest";
import { v4 as uuidv4 } from "uuid";
import { saveBase64Image, handleImageUpdate } from "../../utils/handleImages";
import { activeFoodCondition } from "../../helpers/foodConditions";
import { upsertFoodPricingOverride, upsertVariantPricingOverride } from "../../helpers/pricing.overrides";
import {
    MENU_MESSAGES,
    blocksActiveFoodUnderInactiveSubcategory,
    getMissingFoodFields,
} from "../../helpers/menu.rules";
import { insertFood } from "../../helpers/menu.insert";
import {
    FIXED_DISCOUNT_ON_GRAM_MESSAGE,
    isFixedDiscountOnGramFood,
    parseBooleanInput,
    validateWeightGroupConfig,
    type WeightGroupVariationConfig,
} from "../../helpers/weightPricing.helper";

// =============================================
// CREATE Food
// =============================================
/**
 * Normalises the weight-group fields of incoming variations (booleans may arrive as strings).
 * Accepts isWeightGroup / is_weight_group and weightValue / weight_value.
 */
const normalizeWeightVariationInput = (variations: any): any => {
    let list = variations;
    if (typeof list === "string") {
        try { list = JSON.parse(list); } catch { return variations; }
    }
    if (!Array.isArray(list)) return variations;
    return list.map((v: any) => {
        if (!v || typeof v !== "object") return v;
        const isWeightGroup = parseBooleanInput(v.isWeightGroup ?? v.is_weight_group);
        return {
            ...v,
            ...(isWeightGroup !== undefined ? { isWeightGroup } : {}),
            options: Array.isArray(v.options)
                ? v.options.map((o: any) => (o && typeof o === "object" && o.weightValue === undefined && o.weight_value !== undefined
                    ? { ...o, weightValue: o.weight_value }
                    : o))
                : v.options,
        };
    });
};

export const createFood = async (req: Request, res: Response) => {
    try {
        const restaurantId = req.user?.restaurantId || req.user?.id;
        if (!restaurantId) {
            throw new BadRequest("Restaurant ID missing or unauthorized");
        }

        const {
            name, description, image,
            categoryid, subcategoryid,
            foodtype, Nutrition, allergen_ingredients, is_Halal,
            startTime, endTime, search_tags,
            price, discount_type, discount_value, Maximum_Purchase, stock_type,
            status, variations, points,
            nameAr, nameFr, descriptionAr, descriptionFr,
            isOutOfStock,
            sold_by,
            weight_unit,
            allow_custom_weight,
        } = req.body;

        const incomingAddons = req.body.addonsId ?? req.body.addons ?? req.body.addonIds ?? req.body['addonsId[]'] ?? req.body['addons[]'];

        // 1. التحقق من الحقول المطلوبة (الصورة مطلوبة هنا، واختيارية في الـ bulk import)
        if (getMissingFoodFields({ name, description, image, categoryid, price }, { requireImage: true }).length > 0) {
            throw new BadRequest(MENU_MESSAGES.foodRequiredFields);
        }

        // 2. التحقق من وجود العلاقات
        const existingCategory = await db.select().from(categories).where(eq(categories.id, categoryid)).limit(1);
        if (!existingCategory[0]) throw new BadRequest(MENU_MESSAGES.categoryNotFound);

        if (subcategoryid) {
            const existingSub = await db
                .select({ id: subcategories.id, status: subcategories.status })
                .from(subcategories)
                .where(eq(subcategories.id, subcategoryid))
                .limit(1);
            if (!existingSub[0]) throw new BadRequest(MENU_MESSAGES.subcategoryNotFound);

            // ✅ Block creating an active food under an inactive subcategory
            if (blocksActiveFoodUnderInactiveSubcategory(status, existingSub[0].status)) {
                throw new BadRequest(MENU_MESSAGES.activeFoodUnderInactiveSubcategory);
            }
        }

        // ==========================================
        // ✅ 3. معالجة الإضافات (Addons) بشكل آمن
        // ==========================================
        let parsedAddons = incomingAddons;
        if (typeof incomingAddons === "string") {
            try {
                parsedAddons = JSON.parse(incomingAddons);
            } catch (e) {
                if (incomingAddons.includes(",")) {
                    parsedAddons = incomingAddons.split(",");
                } else {
                    parsedAddons = [incomingAddons];
                }
            }
        }
        parsedAddons = Array.isArray(parsedAddons) ? parsedAddons : [];

        // 🔥 استخراج الـ ID لو الفرونت إند باعت Objects بدل Strings
        const finalAddonsIds = parsedAddons.map((item: any) => {
            if (typeof item === 'object' && item !== null) {
                return item.id || item.value || item.addonId || item._id;
            }
            return item;
        }).filter((id: any) => typeof id === 'string' && id.trim() !== '');

        if (finalAddonsIds.length > 0) {
            const existingAddons = await db.select({ id: addons.id }).from(addons)
                .where(and(
                    inArray(addons.id, finalAddonsIds),
                    eq(addons.restaurantid, restaurantId)
                ));

            if (existingAddons.length !== finalAddonsIds.length) {
                throw new BadRequest(MENU_MESSAGES.foodAddonsInvalid);
            }
        }

        // 4. معالجة الصورة
        let imageUrl = image;
        if (image && image.startsWith("data:image")) {
            imageUrl = await saveBase64Image(image, req, "foods");
        }

        // 5. بدء المعاملة (Transaction) لحفظ البيانات
        // Weight selling cross-validation
        if (sold_by === "weight" && !weight_unit) {
            throw new BadRequest("weight_unit is required when sold_by is 'weight'");
        }
        if (sold_by !== "weight" && weight_unit) {
            throw new BadRequest("weight_unit must be null when sold_by is 'unit'");
        }

        // الـ insert نفسه (الأكلة + variations + options + branchMenuItems) في helper مشترك مع الـ bulk import
        const foodId = await db.transaction((tx) =>
            insertFood(tx, restaurantId, {
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
                allow_custom_weight: parseBooleanInput(allow_custom_weight),
                variations: normalizeWeightVariationInput(variations),
                branches: req.body.branches,
            })
        );

        return SuccessResponse(res, {
            message: "Create food success",
            data: { id: foodId }
        });

    } catch (error: any) {
        console.error("🔥 DATABASE ERROR DETAILED:", error.sqlMessage || error.message || error);
        throw new BadRequest(error.sqlMessage || error.message || "Failed to create food item");
    }
};
// =============================================
// GET All Foods
// =============================================
export const getAllFoods = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    // 1. Extract query params
    const { categoryId, subCategoryId } = req.query;

    // 2. Build dynamic conditions
    const conditions = [activeFoodCondition, eq(food.restaurantid, restaurantId)];

    if (categoryId) {
        conditions.push(eq(food.categoryid, categoryId as string));
    }
    if (subCategoryId) {
        conditions.push(eq(food.subcategoryid, subCategoryId as string));
    }

    const rawFoods = await db.select({
        id: food.id, name: food.name, nameAr: food.nameAr, nameFr: food.nameFr,order_level:food.order_level,
        description: food.description, descriptionAr: food.descriptionAr, descriptionFr: food.descriptionFr,
        image: food.image, restaurantid: food.restaurantid, categoryid: food.categoryid, subcategoryid: food.subcategoryid,
        foodtype: food.foodtype, Nutrition: food.Nutrition, allergen_ingredients: food.allergen_ingredients,
        is_Halal: food.is_Halal, isOutOfStock: food.isOutOfStock, addonsId: food.addonsId, startTime: food.startTime, endTime: food.endTime,
        search_tags: food.search_tags, price: food.price, discount_type: food.discount_type, discount_value: food.discount_value,
        Maximum_Purchase: food.Maximum_Purchase, points: food.points, stock_type: food.stock_type, status: food.status,
        sold_by: food.sold_by, weight_unit: food.weight_unit, allow_custom_weight: food.allow_custom_weight,
        createdAt: food.createdAt, updatedAt: food.updatedAt,
        restaurant: restaurants,
        category_name: categories.name, category_nameAr: categories.nameAr, category_nameFr: categories.nameFr,
        subcategory_name: subcategories.name, subcategory_nameAr: subcategories.nameAr, subcategory_nameFr: subcategories.nameFr,
    })
        .from(food)
        .leftJoin(restaurants, eq(food.restaurantid, restaurants.id))
        .leftJoin(categories, eq(food.categoryid, categories.id))
        .leftJoin(subcategories, eq(food.subcategoryid, subcategories.id))
        .where(and(...conditions)); // 3. Pass packed conditions here

    if (rawFoods.length === 0) {
        return SuccessResponse(res, { message: "Get all foods success", data: [] });
    }

    const foodIds = rawFoods.map(f => f.id);
    const allVars = await db.select().from(foodVariations).where(inArray(foodVariations.foodId, foodIds));
    const allVarIds = allVars.map(v => v.id);
    const allOpts = allVarIds.length > 0
        ? await db.select().from(variationOptions).where(inArray(variationOptions.variationId, allVarIds))
        : [];

    const allAddonsIdsToFetch = new Set<string>();
    rawFoods.forEach(f => {
        let safeAddons = f.addonsId;
        if (typeof safeAddons === 'string') {
            try { safeAddons = JSON.parse(safeAddons); } catch (e) { safeAddons = []; }
        }
        const cleanAddonsArray = Array.isArray(safeAddons) ? safeAddons.filter((id: any) => typeof id === 'string' && id.trim() !== '') : [];
        cleanAddonsArray.forEach(id => allAddonsIdsToFetch.add(id));
    });

    const uniqueAddonsIds = Array.from(allAddonsIdsToFetch);
    let allAddonsDetails: any[] = [];
    if (uniqueAddonsIds.length > 0) {
        allAddonsDetails = await db.select().from(addons).where(inArray(addons.id, uniqueAddonsIds));
    }

    const allIngredients = foodIds.length > 0
        ? await db.select({
            foodId: foodIngredients.foodId,
            ingredientId: ingredients.id,
            name: ingredients.name,
            nameAr: ingredients.nameAr,
            inStock: ingredients.inStock,
            isRemovable: foodIngredients.isRemovable
        })
            .from(foodIngredients)
            .innerJoin(ingredients, eq(foodIngredients.ingredientId, ingredients.id))
            .where(inArray(foodIngredients.foodId, foodIds))
        : [];

    const allFoods = rawFoods.map(f => {
        const foodVars = allVars.filter(v => v.foodId === f.id).map(v => ({
            ...v, options: allOpts.filter(o => o.variationId === v.id)
        }));

        let safeAddons = f.addonsId;
        if (typeof safeAddons === 'string') {
            try { safeAddons = JSON.parse(safeAddons); } catch (e) { safeAddons = []; }
        }
        const cleanAddonsArray = Array.isArray(safeAddons) ? safeAddons.filter((id: any) => typeof id === 'string' && id.trim() !== '') : [];
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
            variations: foodVars, restaurant: f.restaurant,
            ingredients: assignedIngredients,
            category: f.category_name ? { name: f.category_name, nameAr: f.category_nameAr, nameFr: f.category_nameFr } : null,
            subcategory: f.subcategory_name ? { name: f.subcategory_name, nameAr: f.subcategory_nameAr, nameFr: f.subcategory_nameFr } : null,
        };
    });

    return SuccessResponse(res, { message: "Get all foods success", data: allFoods });
};
// =============================================
// GET Food By ID
// =============================================
export const getFoodById = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    const foodItem = await db.select({
        id: food.id, name: food.name, nameAr: food.nameAr, nameFr: food.nameFr, order_level:food.order_level,
        description: food.description, descriptionAr: food.descriptionAr, descriptionFr: food.descriptionFr,
        image: food.image, restaurantid: food.restaurantid, categoryid: food.categoryid, subcategoryid: food.subcategoryid,
        foodtype: food.foodtype, Nutrition: food.Nutrition, allergen_ingredients: food.allergen_ingredients,
        is_Halal: food.is_Halal, isOutOfStock: food.isOutOfStock, addonsId: food.addonsId, startTime: food.startTime, endTime: food.endTime,
        search_tags: food.search_tags, price: food.price, discount_type: food.discount_type, discount_value: food.discount_value,
        Maximum_Purchase: food.Maximum_Purchase, points: food.points, stock_type: food.stock_type, status: food.status,
        sold_by: food.sold_by, weight_unit: food.weight_unit, allow_custom_weight: food.allow_custom_weight,
        createdAt: food.createdAt, updatedAt: food.updatedAt,
        restaurant: { id: restaurants.id, name: restaurants.name },
        category: { id: categories.id, name: categories.name, nameAr: categories.nameAr, nameFr: categories.nameFr },
        subcategory: { id: subcategories.id, name: subcategories.name, nameAr: subcategories.nameAr, nameFr: subcategories.nameFr },
    })
        .from(food)
        .leftJoin(restaurants, eq(food.restaurantid, restaurants.id))
        .leftJoin(categories, eq(food.categoryid, categories.id))
        .leftJoin(subcategories, eq(food.subcategoryid, subcategories.id))
        .where(and(activeFoodCondition, eq(food.id, id), eq(food.restaurantid, restaurantId)))
        .limit(1);

    if (!foodItem[0]) throw new NotFound("Food not found");

    // 1. جلب أسعار الفروع الاستثنائية للوجبة (Branch Overrides)
    const branchPrices = await db
        .select({
            branchId: foodPricingOverrides.branchId,
            price: foodPricingOverrides.price,
            status: foodPricingOverrides.status,
            serviceModule: foodPricingOverrides.serviceModule,
        })
        .from(foodPricingOverrides)
        .where(and(eq(foodPricingOverrides.foodId, id), isNull(foodPricingOverrides.serviceModule)));

    // 2. جلب الـ Variations والـ Options
    const vars = await db.select().from(foodVariations).where(eq(foodVariations.foodId, id));
    const varIds = vars.map(v => v.id);
    const opts = varIds.length ? await db.select().from(variationOptions).where(inArray(variationOptions.variationId, varIds)) : [];
    const variations = vars.map(v => ({ ...v, options: opts.filter(o => o.variationId === v.id) }));

    // 3. فك تشفير الإضافات
    let safeAddons = foodItem[0].addonsId;
    if (typeof safeAddons === 'string') {
        try { safeAddons = JSON.parse(safeAddons); } catch (e) { safeAddons = []; }
    }
    const addonsArray = Array.isArray(safeAddons) ? safeAddons : [];
    const cleanAddonsArray = addonsArray.filter((id: any) => typeof id === 'string' && id.trim() !== '');

    let addonsDetails: any[] = [];
    if (cleanAddonsArray.length > 0) {
        addonsDetails = await db.select().from(addons).where(inArray(addons.id, cleanAddonsArray));
    }

    return SuccessResponse(res, {
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
// =============================================
// UPDATE Food
// =============================================
export const updateFood = async (req: Request, res: Response) => {
    const { id } = req.params;
    const data = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) {
        throw new BadRequest("Restaurant ID missing or unauthorized");
    }

    // ✅ تأكد إن الأكلة تخص نفس الريستورانت وغير محذوفة
    const existingFood = await db
        .select()
        .from(food)
        .where(and(eq(food.id, id), eq(food.restaurantid, restaurantId), activeFoodCondition))
        .limit(1);

    if (!existingFood[0]) {
        throw new NotFound("Food not found or you don't have permission to edit it");
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
    ];

    const updateData: any = {
        updatedAt: new Date(),
    };

    // 1️⃣ معالجة الحقول العادية والصورة
    for (const key of allowedFields) {
        if (data[key] !== undefined) {
            // 🖼️ معالجة الصورة
            if (
                key === "image" &&
                data[key] &&
                typeof data[key] === "string" &&
                data[key].startsWith("data:image")
            ) {
                updateData[key] = await handleImageUpdate(
                    req,
                    existingFood[0].image,
                    data[key],
                    "foods"
                );
            } else {
                updateData[key] = data[key];
            }
        }
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
        throw new BadRequest("weight_unit is required when sold_by is 'weight'");
    }
    if (effectiveSoldBy !== "weight" && updateData.weight_unit) {
        // Case 1 vs Case 3: check whether sold_by was explicitly sent
        if (updateData.sold_by !== undefined) {
            // Case 1: explicit sold_by transition → clear weight_unit silently
            updateData.weight_unit = null;
        } else {
            // Case 3: weight_unit sent alone on a unit food → reject
            throw new BadRequest("Cannot set weight_unit on a food that is sold by unit");
        }
    }

    if (updateData.sold_by === "unit" && existingFood[0].sold_by === "weight") {
        const existingPerWeight = await db
            .select({ id: variationOptions.id })
            .from(variationOptions)
            .innerJoin(foodVariations, eq(variationOptions.variationId, foodVariations.id))
            .where(and(eq(foodVariations.foodId, id), eq(variationOptions.priceMode, "per_weight")))
            .limit(1);
        const incomingVars = data.variations ?? data['variations[]'];
        if (existingPerWeight.length > 0 && incomingVars === undefined) {
            throw new BadRequest("Cannot switch food to unit while it has per_weight variation options. Update options to fixed first.");
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
            } catch (e) {
                if (incomingAddons.includes(",")) {
                    parsedAddons = incomingAddons.split(",");
                } else {
                    parsedAddons = [incomingAddons];
                }
            }
        }

        parsedAddons = Array.isArray(parsedAddons) ? parsedAddons : [];

        // 🔥 استخراج الـ ID لو الفرونت إند باعت Objects بدل Strings
        const finalAddonsIds = parsedAddons.map((item: any) => {
            if (typeof item === 'object' && item !== null) {
                return item.id || item.value || item.addonId || item._id;
            }
            return item;
        }).filter((id: any) => typeof id === 'string' && id.trim() !== '');

        if (finalAddonsIds.length > 0) {
            const existingAddons = await db.select({ id: addons.id }).from(addons)
                .where(and(
                    inArray(addons.id, finalAddonsIds),
                    eq(addons.restaurantid, restaurantId)
                ));

            if (existingAddons.length !== finalAddonsIds.length) {
                throw new BadRequest("One or more Addon IDs are invalid");
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
        const subCheck = await db
            .select({ status: subcategories.status })
            .from(subcategories)
            .where(eq(subcategories.id, effectiveSubcategoryId))
            .limit(1);
        if (subCheck[0] && subCheck[0].status === "inactive") {
            throw new BadRequest(
                "Cannot set food as active while its subcategory is inactive. Please activate the subcategory first."
            );
        }
    }

    // ⚖️ Weight groups / custom weight / fixed discount on per-gram foods.
    // Validated on the EFFECTIVE result (incoming values over the stored ones) before any write.
    const incomingVariationsForWeight: any[] | null = Array.isArray(data.variations)
        ? normalizeWeightVariationInput(data.variations)
        : null;
    if (incomingVariationsForWeight) data.variations = incomingVariationsForWeight;
    const storedVars = await db.select().from(foodVariations).where(eq(foodVariations.foodId, id));
    const storedOpts = storedVars.length > 0
        ? await db.select().from(variationOptions).where(inArray(variationOptions.variationId, storedVars.map((v) => v.id)))
        : [];
    const effectiveWeightVariations: WeightGroupVariationConfig[] = incomingVariationsForWeight
        ? incomingVariationsForWeight.map((v: any) => {
            const stored = v.id ? storedVars.find((sv) => sv.id === v.id) : undefined;
            return {
                name: v.name ?? stored?.name,
                isWeightGroup: v.isWeightGroup !== undefined ? v.isWeightGroup : Boolean(stored?.isWeightGroup),
                selectionType: v.selectionType ?? stored?.selectionType,
                options: (Array.isArray(v.options) ? v.options : []).map((o: any) => {
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
    const incomingAllowCustom = parseBooleanInput(data.allow_custom_weight);
    const weightConfig = validateWeightGroupConfig({
        soldBy: effectiveSoldBy,
        weightUnit: effectiveSoldBy === "weight" ? (updateData.weight_unit !== undefined ? updateData.weight_unit : existingFood[0].weight_unit) : null,
        // switching a food back to unit resets it to true (validateWeightGroupConfig returns true for unit foods)
        allowCustomWeight: effectiveSoldBy === "weight"
            ? (incomingAllowCustom !== undefined ? incomingAllowCustom : existingFood[0].allow_custom_weight)
            : (incomingAllowCustom === false ? false : true),
        variations: effectiveWeightVariations,
    });
    updateData.allow_custom_weight = weightConfig.allowCustomWeight;

    if (isFixedDiscountOnGramFood({
        soldBy: effectiveSoldBy,
        weightUnit: effectiveSoldBy === "weight" ? (updateData.weight_unit !== undefined ? updateData.weight_unit : existingFood[0].weight_unit) : null,
        discountType: updateData.discount_type !== undefined ? updateData.discount_type : existingFood[0].discount_type,
        discountValue: updateData.discount_value !== undefined ? updateData.discount_value : existingFood[0].discount_value,
    })) {
        throw new BadRequest(FIXED_DISCOUNT_ON_GRAM_MESSAGE);
    }

    // ✅ تنفيذ التحديث الرئيسي للأكلة
    if (Object.keys(updateData).length > 1) {
        await db.update(food).set(updateData).where(eq(food.id, id));
    }

    // Variations not sent: keep the stored weight group's "required" in line with allow_custom_weight.
    if (!incomingVariationsForWeight && weightConfig.weightGroups.size > 0) {
        await db.update(foodVariations)
            .set({ isRequired: !weightConfig.allowCustomWeight, selectionType: "single" })
            .where(and(eq(foodVariations.foodId, id), eq(foodVariations.isWeightGroup, true)));
    }

    // ===========================
    // ✅ Variations Update (Non-destructive Upsert)
    // ===========================
    if (data.variations && Array.isArray(data.variations)) {
        const oldVars = await db
            .select()
            .from(foodVariations)
            .where(eq(foodVariations.foodId, id));

        const oldVarIds = oldVars.map(v => v.id);
        const oldOptions = oldVarIds.length > 0
            ? await db.select().from(variationOptions).where(inArray(variationOptions.variationId, oldVarIds))
            : [];

        const incomingVarIds = new Set<string>();
        const incomingOptIds = new Set<string>();

        for (const [variationIndex, variation] of (data.variations as any[]).entries()) {
            let variationId = variation.id;
            const existingVar = variationId ? oldVars.find(v => v.id === variationId) : null;
            const weightGroup = weightConfig.weightGroups.get(variationIndex);

            if (existingVar) {
                // Update existing variation
                await db.update(foodVariations).set({
                    name: variation.name,
                    nameAr: variation.nameAr ?? existingVar.nameAr,
                    nameFr: variation.nameFr ?? existingVar.nameFr,
                    isRequired: weightGroup ? weightGroup.isRequired : (variation.isRequired !== undefined ? variation.isRequired : existingVar.isRequired),
                    selectionType: weightGroup ? weightGroup.selectionType : (variation.selectionType || existingVar.selectionType),
                    min: weightGroup ? null : (variation.min !== undefined ? variation.min : existingVar.min),
                    max: weightGroup ? null : (variation.max !== undefined ? variation.max : existingVar.max),
                    status: variation.status !== undefined ? variation.status : existingVar.status,
                    isWeightGroup: Boolean(weightGroup),
                }).where(eq(foodVariations.id, variationId));
            } else {
                // Insert new variation
                variationId = variationId || uuidv4();
                await db.insert(foodVariations).values({
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
                for (const [optionIndex, option] of (variation.options as any[]).entries()) {
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
                        throw new BadRequest("Option additional price must be greater than or equal to 0");
                    }

                    if (existingOpt) {
                        // Update existing option (preserves UUID!)
                        await db.update(variationOptions).set({
                            variationId,
                            optionName: option.optionName,
                            optionNameAr: option.optionNameAr ?? existingOpt.optionNameAr,
                            optionNameFr: option.optionNameFr ?? existingOpt.optionNameFr,
                            additionalPrice: additionalPriceStr,
                            priceMode: resolvedPriceMode,
                            weightValue: optionWeightValue,
                            status: option.status !== undefined ? option.status : existingOpt.status,
                            isDefault: option.isDefault !== undefined ? option.isDefault : existingOpt.isDefault,
                        }).where(eq(variationOptions.id, optionId));
                    } else {
                        // Insert new option
                        optionId = optionId || uuidv4();
                        await db.insert(variationOptions).values({
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
            await db.delete(variationOptions).where(inArray(variationOptions.id, optionsToDelete.map(o => o.id)));
        }

        // Delete variations that were explicitly removed
        const varsToDelete = oldVars.filter(v => !incomingVarIds.has(v.id));
        if (varsToDelete.length > 0) {
            await db.delete(foodVariations).where(inArray(foodVariations.id, varsToDelete.map(v => v.id)));
        }
    }

    // ===========================
    // ✅ Branch Menu Items Update (if branches array provided and non-empty)
    // ===========================
    if (data.branches && Array.isArray(data.branches) && data.branches.length > 0) {
        const activeBranches = await db
            .select({ id: branches.id })
            .from(branches)
            .where(eq(branches.restaurantId, restaurantId));
        const activeBranchIds = new Set(activeBranches.map((b: any) => b.id));

        for (const b of data.branches) {
            if (!b.branchId || !activeBranchIds.has(b.branchId)) continue;
            const priceVal = b.price !== undefined && b.price !== null ? String(b.price) : "0.00";
            const statusVal: "active" | "inactive" = b.status === "inactive" ? "inactive" : "active";

            const [existing] = await db
                .select({ id: branchMenuItems.id })
                .from(branchMenuItems)
                .where(and(eq(branchMenuItems.branchId, b.branchId), eq(branchMenuItems.foodId, id)))
                .limit(1);

            if (existing) {
                await db.update(branchMenuItems)
                    .set({ status: statusVal, updatedAt: new Date() })
                    .where(eq(branchMenuItems.id, existing.id));
            } else {
                await db.insert(branchMenuItems).values({
                    id: uuidv4(),
                    branchId: b.branchId,
                    foodId: id,
                    status: statusVal,
                });
            }
            if (b.price !== undefined && b.price !== null && b.price !== "") {
                await upsertFoodPricingOverride(db, {
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
            if (!serviceModule || price === undefined) continue;
            const priceVal = String(price);
            const targetBranchId = chBranchId || null;
            const statusVal: "active" | "inactive" = status === "inactive" ? "inactive" : "active";

            await upsertFoodPricingOverride(db, {
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
            if (!variantId || !serviceModule || price === undefined) continue;
            const priceVal = String(price);
            const targetBranchId = vcBranchId || null;
            const statusVal: "active" | "inactive" = status === "inactive" ? "inactive" : "active";

            await upsertVariantPricingOverride(db, {
                variantId,
                branchId: targetBranchId,
                serviceModule,
                price: priceVal,
                status: statusVal,
            });
        }
    }

    return SuccessResponse(res, {
        message: "Update food success",
    });
};
// =============================================
// HYBRID DELETE Food
// Archived when historical/operational references exist, otherwise deleted.
// =============================================
export const deleteFood = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    const [existingFood] = await db
        .select({ id: food.id, status: food.status, deletedAt: food.deletedAt })
        .from(food)
        .where(and(eq(food.id, id), eq(food.restaurantid, restaurantId), activeFoodCondition))
        .limit(1);

    if (!existingFood) {
        throw new NotFound("Food not found or you don't have permission to delete it");
    }

    const [
        orderReferences,
        cartReferences,
        redeemRequestReferences,
    ] = await Promise.all([
        db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.foodId, id)).limit(1),
        db.select({ id: cartItems.id }).from(cartItems).where(eq(cartItems.foodId, id)).limit(1),
        db.select({ id: redeemRequests.id }).from(redeemRequests).where(eq(redeemRequests.foodId, id)).limit(1),
    ]);

    const hasReferences = [
        orderReferences,
        cartReferences,
        redeemRequestReferences,
    ].some((references) => references.length > 0);

    if (hasReferences) {
        await db
            .update(food)
            .set({
                deletedAt: new Date(),
                status: "inactive",
                isOutOfStock: true,
                updatedAt: new Date(),
            })
            .where(and(eq(food.id, id), eq(food.restaurantid, restaurantId)));

        await db
            .update(branchMenuItems)
            .set({ status: "inactive", updatedAt: new Date() })
            .where(eq(branchMenuItems.foodId, id));

        return SuccessResponse(res, {
            message: "Food deactivated and archived successfully",
            data: { foodId: id, deletedAt: new Date(), deleteType: "soft" },
        });
    }

    await db.transaction(async (tx) => {
        // 1. Delete variant pricing overrides, variation options, and variations
        const variations = await tx
            .select({ id: foodVariations.id })
            .from(foodVariations)
            .where(eq(foodVariations.foodId, id));
        const variationIds = variations.map((variation) => variation.id);

        if (variationIds.length > 0) {
            const options = await tx
                .select({ id: variationOptions.id })
                .from(variationOptions)
                .where(inArray(variationOptions.variationId, variationIds));
            const optionIds = options.map((opt) => opt.id);

            if (optionIds.length > 0) {
                // Delete variant pricing overrides first
                await tx.delete(variantPricingOverrides).where(inArray(variantPricingOverrides.variantId, optionIds));
                // Delete variation options
                await tx.delete(variationOptions).where(inArray(variationOptions.id, optionIds));
            }

            // Delete food variations
            await tx.delete(foodVariations).where(inArray(foodVariations.id, variationIds));
        }

        // 2. Delete food pricing overrides
        await tx.delete(foodPricingOverrides).where(eq(foodPricingOverrides.foodId, id));

        // 3. Delete other child relations
        await tx.delete(branchIngredientLocks).where(eq(branchIngredientLocks.foodId, id));
        await tx.delete(foodIngredients).where(eq(foodIngredients.foodId, id));
        await tx.delete(branchMenuItems).where(eq(branchMenuItems.foodId, id));
        await tx.delete(favorites).where(eq(favorites.foodId, id));
        await tx.delete(pointsProducts).where(eq(pointsProducts.foodId, id));

        // 4. Delete the food record
        await tx.delete(food).where(and(eq(food.id, id), eq(food.restaurantid, restaurantId)));
    });

    return SuccessResponse(res, {
        message: "Food permanently deleted from database",
        data: { foodId: id, deleteType: "hard" },
    });
};



// =============================================
// GET Food Select Data (For Dropdowns)
// =============================================
export const getFoodSelectData = async (req: Request, res: Response) => {
    // ✅ استخدام نفس الطريقة اللي في subcategory.ts
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");


    // ✅ جلب الأقسام الخاصة بالمطعم فقط (بافتراض إن الجدول يحتوي على restaurantid)
    // ✅ Categories - عام لجميع المطاعم (لأن الجدول ليس له restaurantId)
    const myCategories = await db
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(eq(categories.status, "active"));

    // ✅ Subcategories - الخاصة بالمطعم أو العامة (restaurantId = null)
    const mySubcategories = await db
        .select({
            id: subcategories.id,
            name: subcategories.name,
            categoryId: subcategories.categoryId,
            restaurantId: subcategories.restaurantId, // ✅ للتأكد من القيمة
            status: subcategories.status // ✅ للتأكد من القيمة
        })
        .from(subcategories)
        .where(
            or(
                eq(subcategories.restaurantId, restaurantId),
                // isNull(subcategories.restaurantId)
            )
        );

    // ✅ Addons - فقط الخاصة بالمطعم
    const myAddons = await db
        .select({ id: addons.id, name: addons.name })
        .from(addons)
        .where(and(
            eq(addons.status, "active"),
            eq(addons.restaurantid, restaurantId)
        ));

    // ✅ جلب المكونات الخاصة بالمطعم فقط
    const list = await db.select({
        id: ingredients.id,
        name: ingredients.name,
        inStock: ingredients.inStock,
        categoryId: ingredients.categoryId,
        categoryName: ingredientCategories.name
    })
        .from(ingredients)
        .leftJoin(ingredientCategories, eq(ingredients.categoryId, ingredientCategories.id))
        .where(eq(ingredients.restaurantId, restaurantId));

    // GET ALL ACTIVE BRANCHES 
    const activeBranches = await db
        .select({ id: branches.id, name: branches.name })
        .from(branches)
        .where(and(
            eq(branches.status, "active"),
            eq(branches.restaurantId, restaurantId)
        ));

    return SuccessResponse(res, {
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

// =========================================================
// 🍳 Toggle Variation Status
// =========================================================
export const toggleVariationStatus = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");
    if (typeof status !== "boolean") throw new BadRequest("Status must be a boolean");

    const existingVariation = await db.select({ id: foodVariations.id })
        .from(foodVariations)
        .innerJoin(food, and(eq(foodVariations.foodId, food.id), activeFoodCondition))
        .where(and(eq(foodVariations.id, id), eq(food.restaurantid, restaurantId)))
        .limit(1);

    if (!existingVariation[0]) throw new NotFound("Variation not found or does not belong to your restaurant");

    await db.update(foodVariations)
        .set({ status })
        .where(eq(foodVariations.id, id));

    return SuccessResponse(res, { message: "Variation status updated successfully" });
};

// =========================================================
// 🍳 Toggle Variation Option Status
// =========================================================
export const toggleVariationOptionStatus = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");
    if (typeof status !== "boolean") throw new BadRequest("Status must be a boolean");

    const existingOption = await db.select({ id: variationOptions.id })
        .from(variationOptions)
        .innerJoin(foodVariations, eq(variationOptions.variationId, foodVariations.id))
        .innerJoin(food, and(eq(foodVariations.foodId, food.id), activeFoodCondition))
        .where(and(eq(variationOptions.id, id), eq(food.restaurantid, restaurantId)))
        .limit(1);

    if (!existingOption[0]) throw new NotFound("Variation option not found or does not belong to your restaurant");

    await db.update(variationOptions)
        .set({ status })
        .where(eq(variationOptions.id, id));

    return SuccessResponse(res, { message: "Variation option status updated successfully" });
};


export const changeFoodStatus = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const userBranchId = req.user?.branchId;
    const branchId: string | undefined =
        (req.params.branchId as string) ||
        (req.body?.branchId as string) ||
        (req.query?.branchId as string) ||
        userBranchId ||
        undefined;

    // Accept explicit status or toggle
    const { status: rawStatus } = req.body;

    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    if (branchId && userBranchId && userBranchId !== branchId) {
        throw new BadRequest("Unauthorized: You cannot manage another branch's status");
    }

    const [existingFood] = await db
        .select({
            id: food.id,
            status: food.status,
            subcategoryid: food.subcategoryid,
        })
        .from(food)
        .where(and(eq(food.id, id), eq(food.restaurantid, restaurantId), activeFoodCondition))
        .limit(1);

    if (!existingFood) throw new NotFound("Food not found or does not belong to you");

    // ── Branch-level toggle / update ───────────────────────────────
    if (branchId) {
        const [branchCheck] = await db
            .select({ id: branches.id })
            .from(branches)
            .where(and(eq(branches.id, branchId), eq(branches.restaurantId, restaurantId)))
            .limit(1);

        if (!branchCheck) throw new BadRequest("Branch not found or does not belong to your restaurant");

        const [existingBranchItem] = await db
            .select({ id: branchMenuItems.id, status: branchMenuItems.status })
            .from(branchMenuItems)
            .where(and(eq(branchMenuItems.foodId, id), eq(branchMenuItems.branchId, branchId)))
            .limit(1);

        // Determine new status
        let newStatus: "active" | "inactive";
        if (rawStatus === "active" || rawStatus === "inactive") {
            newStatus = rawStatus;
        } else {
            // Toggle from current branch override, fallback to global status
            const current = existingBranchItem?.status ?? existingFood.status;
            newStatus = current === "active" ? "inactive" : "active";
        }

        // Upsert branchMenuItems
        if (existingBranchItem) {
            await db
                .update(branchMenuItems)
                .set({ status: newStatus, updatedAt: new Date() })
                .where(eq(branchMenuItems.id, existingBranchItem.id));
        } else {
            await db.insert(branchMenuItems).values({
                id: uuidv4(),
                branchId,
                foodId: id,
                status: newStatus,
            });
        }

        // ── Recompute subcategory branch-level status after food toggle ──
        if (existingFood.subcategoryid) {
            await recomputeSubcategoryBranchStatus(existingFood.subcategoryid, branchId, restaurantId);
        }

        return SuccessResponse(res, {
            message: `Food status in branch updated to "${newStatus}"`,
            data: { foodId: id, branchId, status: newStatus },
        });
    }

    // ── Global toggle / update ─────────────────────────────────────
    let newStatus: "active" | "inactive";
    if (rawStatus === "active" || rawStatus === "inactive") {
        newStatus = rawStatus;
    } else {
        newStatus = existingFood.status === "active" ? "inactive" : "active";
    }

    await db.update(food).set({ status: newStatus, updatedAt: new Date() }).where(eq(food.id, id));

    // ── Recompute subcategory global status after food toggle ──
    if (existingFood.subcategoryid) {
        await recomputeSubcategoryGlobalStatus(existingFood.subcategoryid, restaurantId);
    }

    return SuccessResponse(res, {
        message: `Food status updated to "${newStatus}"`,
        data: { foodId: id, status: newStatus },
    });
};

// ============================================================================
// TOGGLE FOOD OUT-OF-STOCK
// PUT /foods/out-of-stock/:id
// PUT /foods/:id/out-of-stock
// PUT /foods/:id/branch/:branchId/out-of-stock
// Body: { isOutOfStock?: boolean, branchId?: string }
// - With branchId: Updates stockType & stockQty in branchMenuItems for this branch ONLY
// - Without branchId: Updates food.isOutOfStock globally for all branches
// ============================================================================
export const toggleFoodOutOfStock = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const userBranchId = req.user?.branchId;
    const branchId: string | undefined =
        (req.params.branchId as string) ||
        (req.body?.branchId as string) ||
        (req.query?.branchId as string) ||
        userBranchId ||
        undefined;

    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    if (branchId && userBranchId && userBranchId !== branchId) {
        throw new BadRequest("Unauthorized: You cannot manage another branch's stock");
    }

    const [existingFood] = await db
        .select({ id: food.id, isOutOfStock: food.isOutOfStock, subcategoryid: food.subcategoryid })
        .from(food)
        .where(and(eq(food.id, id), eq(food.restaurantid, restaurantId), activeFoodCondition))
        .limit(1);

    if (!existingFood) throw new NotFound("Food not found or does not belong to you");

    // ── Branch-level toggle / update ───────────────────────────────
    if (branchId) {
        const [branchCheck] = await db
            .select({ id: branches.id })
            .from(branches)
            .where(and(eq(branches.id, branchId), eq(branches.restaurantId, restaurantId)))
            .limit(1);

        if (!branchCheck) throw new BadRequest("Branch not found or does not belong to your restaurant");

        const [existingBranchItem] = await db
            .select({
                id: branchMenuItems.id,
                stockType: branchMenuItems.stockType,
                stockQty: branchMenuItems.stockQty,
                status: branchMenuItems.status,
            })
            .from(branchMenuItems)
            .where(
                and(
                    eq(branchMenuItems.foodId, id),
                    eq(branchMenuItems.branchId, branchId)
                )
            )
            .limit(1);

        // Determine new OOS value for branch
        let newIsOOS: boolean;
        if (req.body?.isOutOfStock !== undefined) {
            newIsOOS = Boolean(req.body.isOutOfStock);
        } else if (existingBranchItem) {
            const isCurrentlyOOS =
                existingBranchItem.stockType === "limited" && (existingBranchItem.stockQty ?? 0) <= 0;
            newIsOOS = !isCurrentlyOOS;
        } else {
            // Fallback to current global food state
            newIsOOS = !existingFood.isOutOfStock;
        }

        const targetStockType = newIsOOS ? "limited" : "unlimited";
        const targetStockQty = 0;

        if (existingBranchItem) {
            await db
                .update(branchMenuItems)
                .set({ stockType: targetStockType, stockQty: targetStockQty, updatedAt: new Date() })
                .where(eq(branchMenuItems.id, existingBranchItem.id));
        } else {
            await db.insert(branchMenuItems).values({
                id: uuidv4(),
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

        return SuccessResponse(res, {
            message: `Food isOutOfStock in branch updated to ${newIsOOS}`,
            data: { foodId: id, branchId, isOutOfStock: newIsOOS },
        });
    }

    // ── Global toggle / update ─────────────────────────────────────
    const newIsOOS: boolean =
        req.body?.isOutOfStock !== undefined
            ? Boolean(req.body.isOutOfStock)
            : !existingFood.isOutOfStock;

    // Update food.isOutOfStock globally
    await db.update(food).set({ isOutOfStock: newIsOOS, updatedAt: new Date() }).where(eq(food.id, id));

    // Recompute subcategory global status & OOS
    if (existingFood.subcategoryid) {
        await recomputeSubcategoryGlobalStatus(existingFood.subcategoryid, restaurantId);
    }

    return SuccessResponse(res, {
        message: `Food isOutOfStock set to ${newIsOOS}`,
        data: { foodId: id, isOutOfStock: newIsOOS },
    });
};


// ============================================================================
// HELPER: Recompute & store subcategory global status
// Called after toggling a food's global status.
// - subcategory.status  → "active" if ANY food is active, else "inactive"
// - subcategory.isOutOfStock → true only if ALL foods are OOS
// ============================================================================
async function recomputeSubcategoryGlobalStatus(
    subcategoryId: string,
    restaurantId: string
): Promise<void> {
    const allFoods = await db
        .select({ status: food.status, isOutOfStock: food.isOutOfStock })
        .from(food)
        .where(and(eq(food.subcategoryid, subcategoryId), eq(food.restaurantid, restaurantId), activeFoodCondition));

    if (allFoods.length === 0) return;

    const allOOS = allFoods.every((f) => f.isOutOfStock);
    // If at least one food is active → subcategory should be active
    const hasActiveFood = allFoods.some((f) => f.status === "active");
    const newStatus: "active" | "inactive" = hasActiveFood ? "active" : "inactive";

    await db
        .update(subcategories)
        .set({ status: newStatus, isOutOfStock: allOOS, updatedAt: new Date() })
        .where(eq(subcategories.id, subcategoryId));
}

// ============================================================================
// HELPER: Recompute subcategory branch-level status after a food status change
// If at least one food is active in the branch (no override = use global status)
// then branchSubcategory can remain active; otherwise mark inactive.
// Also recomputes isOutOfStock for the branch record.
// NOTE: branch subcategory status is capped by the global subcategory status.
// ============================================================================
async function recomputeSubcategoryBranchStatus(
    subcategoryId: string,
    branchId: string,
    restaurantId: string
): Promise<void> {
    // Get all foods in this subcategory
    const allFoods = await db
        .select({ id: food.id, status: food.status, isOutOfStock: food.isOutOfStock })
        .from(food)
        .where(and(eq(food.subcategoryid, subcategoryId), eq(food.restaurantid, restaurantId), activeFoodCondition));

    if (allFoods.length === 0) return;

    const foodIds = allFoods.map((f) => f.id);

    // Get branch-level overrides for these foods (status + stock for OOS check)
    const branchOverrides = await db
        .select({
            foodId: branchMenuItems.foodId,
            status: branchMenuItems.status,
            stockType: branchMenuItems.stockType,
            stockQty: branchMenuItems.stockQty,
        })
        .from(branchMenuItems)
        .where(and(eq(branchMenuItems.branchId, branchId), inArray(branchMenuItems.foodId, foodIds)));

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
    const [globalSub] = await db
        .select({ status: subcategories.status })
        .from(subcategories)
        .where(eq(subcategories.id, subcategoryId))
        .limit(1);

    const globalSubcatIsActive = globalSub?.status === "active";
    const newBranchSubcatStatus: "active" | "inactive" =
        globalSubcatIsActive && hasActiveFood ? "active" : "inactive";

    const [existing] = await db
        .select({ id: branchSubcategories.id })
        .from(branchSubcategories)
        .where(
            and(
                eq(branchSubcategories.subcategoryId, subcategoryId),
                eq(branchSubcategories.branchId, branchId)
            )
        )
        .limit(1);

    if (existing) {
        await db
            .update(branchSubcategories)
            .set({ status: newBranchSubcatStatus, isOutOfStock: allOOS, updatedAt: new Date() })
            .where(eq(branchSubcategories.id, existing.id));
    } else {
        await db.insert(branchSubcategories).values({
            id: uuidv4(),
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
export const getOutOfStockFoods = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    // 🟢 1. Extract branchId from user session OR URL query parameter
    const branchId = (req.user?.branchId || req.query.branchId) as string | undefined;

    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    // =========================================================
    // BRANCH VIEW: Return foods OOS for this specific branch
    // =========================================================
    if (branchId) {
        // Verify the branch belongs to this restaurant
        const branchCheck = await db
            .select({ id: branches.id })
            .from(branches)
            .where(and(eq(branches.id, branchId), eq(branches.restaurantId, restaurantId)))
            .limit(1);

        if (!branchCheck[0]) throw new BadRequest("Branch not found or does not belong to your restaurant");

        // Foods that are OOS (limited stock exhausted) or inactive in branch_menu_items
        const oosItems = await db
            .select({
                foodId: branchMenuItems.foodId,
                branchStockType: branchMenuItems.stockType,
                branchStockQty: branchMenuItems.stockQty,
                branchStatus: branchMenuItems.status,
                // Food fields
                id: food.id,
                name: food.name,
                nameAr: food.nameAr,
                nameFr: food.nameFr,
                description: food.description,
                descriptionAr: food.descriptionAr,
                descriptionFr: food.descriptionFr,
                image: food.image,
                price: food.price,
                status: food.status,
                isOutOfStock: food.isOutOfStock,
                stock_type: food.stock_type,
                foodtype: food.foodtype,
                startTime: food.startTime,
                endTime: food.endTime,
                discount_type: food.discount_type,
                discount_value: food.discount_value,
                Maximum_Purchase: food.Maximum_Purchase,
                points: food.points,
                createdAt: food.createdAt,
                updatedAt: food.updatedAt,
                category_name: categories.name,
                category_nameAr: categories.nameAr,
                category_nameFr: categories.nameFr,
            })
            .from(branchMenuItems)
            .innerJoin(food, eq(branchMenuItems.foodId, food.id))
            .leftJoin(categories, eq(food.categoryid, categories.id))
            .where(
                and(
                    eq(branchMenuItems.branchId, branchId),
                    activeFoodCondition,
                    or(
                        // Limited stock exhausted
                        and(
                            eq(branchMenuItems.stockType, "limited"),
                            lte(branchMenuItems.stockQty, 0)
                        ),
                        // Manually marked as inactive in this branch
                        eq(branchMenuItems.status, "inactive")
                    )
                )
            );

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
                reason:
                    item.branchStatus === "inactive"
                        ? "inactive_in_branch"
                        : "stock_exhausted",
            },
        }));

        return SuccessResponse(res, {
            message: "Get out-of-stock foods for branch success",
            data: result,
        });
    }

    // =========================================================
    // RESTAURANT VIEW: Return globally OOS foods + foods with unavailable branches
    // =========================================================
    const rawFoods = await db
        .select({
            id: food.id,
            name: food.name,
            nameAr: food.nameAr,
            nameFr: food.nameFr,
            description: food.description,
            descriptionAr: food.descriptionAr,
            descriptionFr: food.descriptionFr,
            image: food.image,
            price: food.price,
            status: food.status,
            isOutOfStock: food.isOutOfStock,
            stock_type: food.stock_type,
            foodtype: food.foodtype,
            startTime: food.startTime,
            endTime: food.endTime,
            discount_type: food.discount_type,
            discount_value: food.discount_value,
            Maximum_Purchase: food.Maximum_Purchase,
            points: food.points,
            createdAt: food.createdAt,
            updatedAt: food.updatedAt,
            category_name: categories.name,
            category_nameAr: categories.nameAr,
            category_nameFr: categories.nameFr,
            subcategory_name: subcategories.name,
            subcategory_nameAr: subcategories.nameAr,
            subcategory_nameFr: subcategories.nameFr,
        })
        .from(food)
        .leftJoin(categories, eq(food.categoryid, categories.id))
        .leftJoin(subcategories, eq(food.subcategoryid, subcategories.id))
        .where(and(eq(food.restaurantid, restaurantId), activeFoodCondition));

    if (rawFoods.length === 0) {
        return SuccessResponse(res, {
            message: "Get out-of-stock foods success",
            data: [],
        });
    }

    const foodIds = rawFoods.map((f) => f.id);
    const unavailableBranchesMap = await getUnavailableBranchesForFoods(foodIds);

    const filtered = rawFoods.filter(
        (f) => f.isOutOfStock || (unavailableBranchesMap.get(f.id)?.length ?? 0) > 0
    );

    if (filtered.length === 0) {
        return SuccessResponse(res, {
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

    return SuccessResponse(res, {
        message: "Get out-of-stock foods success",
        data: result,
    });
};

/**
 * 🟢 Returns all active and in-stock foods with their active variations (and options with priceMode)
 * and addons, formatted for the staff UI selector when adding items to weight requests.
 */
export const getActiveInStockFoods = async (req: Request | any, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    const conditions: any[] = [
        activeFoodCondition,
        eq(food.restaurantid, restaurantId),
        eq(food.status, "active"),
        eq(food.isOutOfStock, false),
    ];

    if (req.query.sold_by) {
        conditions.push(eq(food.sold_by, req.query.sold_by as any));
    }
    if (req.query.categoryId) {
        conditions.push(eq(food.categoryid, req.query.categoryId as string));
    }
    if (req.query.subCategoryId) {
        conditions.push(eq(food.subcategoryid, req.query.subCategoryId as string));
    }

    const rawFoods = await db
        .select({
            id: food.id,
            name: food.name,
            nameAr: food.nameAr,
            nameFr: food.nameFr,
            description: food.description,
            descriptionAr: food.descriptionAr,
            descriptionFr: food.descriptionFr,
            image: food.image,
            price: food.price,
            sold_by: food.sold_by,
            weight_unit: food.weight_unit,
            allow_custom_weight: food.allow_custom_weight,
            categoryid: food.categoryid,
            subcategoryid: food.subcategoryid,
            category_name: categories.name,
            category_nameAr: categories.nameAr,
            subcategory_name: subcategories.name,
            subcategory_nameAr: subcategories.nameAr,
            addonsId: food.addonsId,
        })
        .from(food)
        .leftJoin(categories, eq(food.categoryid, categories.id))
        .leftJoin(subcategories, eq(food.subcategoryid, subcategories.id))
        .where(and(...conditions));

    if (rawFoods.length === 0) {
        return SuccessResponse(res, {
            message: "Active in-stock foods fetched successfully",
            data: [],
        });
    }

    const foodIds = rawFoods.map((f) => f.id);

    // Fetch active variations and their active options
    const allVars = await db
        .select({
            id: foodVariations.id,
            foodId: foodVariations.foodId,
            name: foodVariations.name,
            nameAr: foodVariations.nameAr,
            nameFr: foodVariations.nameFr,
            isRequired: foodVariations.isRequired,
            selectionType: foodVariations.selectionType,
            isWeightGroup: foodVariations.isWeightGroup,
            status: foodVariations.status,
        })
        .from(foodVariations)
        .where(and(inArray(foodVariations.foodId, foodIds), eq(foodVariations.status, true)));

    const varIds = allVars.map((v) => v.id);

    const allOpts = varIds.length > 0
        ? await db
            .select({
                id: variationOptions.id,
                variationId: variationOptions.variationId,
                optionName: variationOptions.optionName,
                optionNameAr: variationOptions.optionNameAr,
                optionNameFr: variationOptions.optionNameFr,
                additionalPrice: variationOptions.additionalPrice,
                priceMode: variationOptions.priceMode,
                weightValue: variationOptions.weightValue,
                status: variationOptions.status,
            })
            .from(variationOptions)
            .where(and(inArray(variationOptions.variationId, varIds), eq(variationOptions.status, true)))
        : [];

    // Collect and fetch active addons
    const allAddonsIdsToFetch = new Set<string>();
    rawFoods.forEach((f) => {
        let safeAddons = f.addonsId;
        if (typeof safeAddons === "string") {
            try { safeAddons = JSON.parse(safeAddons); } catch { safeAddons = []; }
        }
        const cleanAddons = Array.isArray(safeAddons) ? safeAddons : [];
        cleanAddons.forEach((id: any) => {
            if (typeof id === "string" && id.trim()) allAddonsIdsToFetch.add(id.trim());
        });
    });

    const uniqueAddonIds = Array.from(allAddonsIdsToFetch);
    const dbAddons = uniqueAddonIds.length > 0
        ? await db
            .select({
                id: addons.id,
                name: addons.name,
                nameAr: addons.nameAr,
                nameFr: addons.nameFr,
                price: addons.price,
                status: addons.status,
            })
            .from(addons)
            .where(and(inArray(addons.id, uniqueAddonIds), eq(addons.status, "active")))
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

        let parsedAddonsList: string[] = [];
        if (typeof f.addonsId === "string") {
            try { parsedAddonsList = JSON.parse(f.addonsId); } catch { parsedAddonsList = []; }
        } else if (Array.isArray(f.addonsId)) {
            parsedAddonsList = f.addonsId as string[];
        }

        const foodAddons = parsedAddonsList
            .map((aid) => addonsMap.get(aid))
            .filter(Boolean)
            .map((a) => ({
                id: a!.id,
                name: a!.name,
                nameAr: a!.nameAr,
                nameFr: a!.nameFr,
                price: a!.price,
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

    return SuccessResponse(res, {
        message: "Active in-stock foods fetched successfully",
        data,
    });
};

// =============================================
// BULK APPLY FOOD DISCOUNT
// =============================================
export const bulkApplyFoodDiscount = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const discountType = (req.body.discountType || req.body.discount_type || "percentage") as "percentage" | "amount";
    const rawVal = req.body.discountValue !== undefined ? req.body.discountValue : req.body.discount_value;
    const discountValNum = rawVal !== undefined && rawVal !== null && rawVal !== "" && !isNaN(Number(rawVal))
        ? Number(rawVal)
        : null;

    if (discountType === "percentage" && discountValNum !== null && (discountValNum < 0 || discountValNum > 100)) {
        throw new BadRequest("Discount percentage must be between 0 and 100");
    }

    if (discountType === "amount" && discountValNum !== null && discountValNum < 0) {
        throw new BadRequest("Discount amount must be non-negative");
    }

    const foodIds: string[] = Array.isArray(req.body.foodIds) ? req.body.foodIds.filter(Boolean) : [];
    const subCategoryIds: string[] = Array.isArray(req.body.subCategoryIds) ? req.body.subCategoryIds.filter(Boolean) : [];
    const categoryIds: string[] = Array.isArray(req.body.categoryIds) ? req.body.categoryIds.filter(Boolean) : [];

    const hasSpecificTarget = foodIds.length > 0 || subCategoryIds.length > 0 || categoryIds.length > 0;

    const targetConditions: any[] = [];
    if (foodIds.length > 0) {
        targetConditions.push(inArray(food.id, foodIds));
    }
    if (subCategoryIds.length > 0) {
        targetConditions.push(inArray(food.subcategoryid, subCategoryIds));
    }
    if (categoryIds.length > 0) {
        targetConditions.push(inArray(food.categoryid, categoryIds));
    }

    const whereClause = hasSpecificTarget
        ? and(eq(food.restaurantid, restaurantId), or(...targetConditions))
        : eq(food.restaurantid, restaurantId);

    const discountValueToStore = discountValNum !== null && discountValNum > 0
        ? discountValNum.toFixed(2)
        : null;

    // ⚖️ A fixed-amount discount must not reach a product sold per gram (it is applied per gram).
    // Rejected as a whole, nothing applied, with the products that block it.
    if (discountType !== "percentage" && discountValueToStore !== null) {
        const gramFoods = await db
            .select({ id: food.id, name: food.name })
            .from(food)
            .where(and(whereClause, eq(food.sold_by, "weight"), eq(food.weight_unit, "gm")))
            .limit(11);
        if (gramFoods.length > 0) {
            const names = gramFoods.slice(0, 10).map((f) => `"${f.name}"`).join(", ");
            throw new BadRequest(
                `${FIXED_DISCOUNT_ON_GRAM_MESSAGE} Products sold per gram in this selection: ${names}${gramFoods.length > 10 ? ", ..." : ""}. Exclude them or use a percentage.`
            );
        }
    }

    await db
        .update(food)
        .set({
            discount_type: discountType,
            discount_value: discountValueToStore,
        })
        .where(whereClause);

    // Count affected items
    const [countResult] = await db
        .select({ cnt: sql<number>`count(*)` })
        .from(food)
        .where(whereClause);

    const affectedCount = Number(countResult?.cnt || 0);

    return SuccessResponse(res, {
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

// =============================================
// PATCH Food Order Level
// =============================================
export const changeFoodOrderLevel = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    const { order_level } = req.body;

    if (order_level === undefined || order_level === null) {
        throw new BadRequest("order_level is required");
    }

    const parsed = parseInt(order_level, 10);
    if (isNaN(parsed) || parsed < 0) {
        throw new BadRequest("order_level must be a non-negative integer");
    }

    const existing = await db
        .select({ id: food.id })
        .from(food)
        .where(and(eq(food.id, id), eq(food.restaurantid, restaurantId), activeFoodCondition))
        .limit(1);

    if (!existing[0]) throw new NotFound("Food not found or you don't have permission to edit it");

    await db
        .update(food)
        .set({ order_level: parsed, updatedAt: new Date() })
        .where(eq(food.id, id));

    return SuccessResponse(res, {
        message: "Food order level updated successfully",
        data: { id, order_level: parsed },
    });
};
