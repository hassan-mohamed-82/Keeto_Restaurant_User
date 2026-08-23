import { Request, Response } from "express";
import { db } from "../../models/connection";
import {
    food,
    foodVariations,
    variationOptions,
    restaurants,
    categories,
    subcategories,
    addons,
    foodIngredients,
    ingredients,
    ingredientCategories,
    branchMenuItems,
    branches,
} from "../../models/schema";
import { getUnavailableBranchesForFoods } from "../../helpers/food.helper";
// ✅ تم إضافة and, or, isNull هنا عشان نصلح مشكلة الشروط المتعددة
import { eq, inArray, and, or, isNull, lte } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { NotFound } from "../../Errors/NotFound";
import { BadRequest } from "../../Errors/BadRequest";
import { v4 as uuidv4 } from "uuid";
import { saveBase64Image, handleImageUpdate } from "../../utils/handleImages";

// =============================================
// CREATE Food
// =============================================
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
            isOutOfStock
        } = req.body;

        const incomingAddons = req.body.addonsId ?? req.body.addons ?? req.body.addonIds ?? req.body['addonsId[]'] ?? req.body['addons[]'];

        // 1. التحقق من الحقول المطلوبة
        if (!name || !description || !image || !categoryid || !startTime || !endTime || !price) {
            throw new BadRequest("Missing required fields");
        }

        // 2. التحقق من وجود العلاقات
        const existingCategory = await db.select().from(categories).where(eq(categories.id, categoryid)).limit(1);
        if (!existingCategory[0]) throw new BadRequest("Category not found");

        if (subcategoryid) {
            const existingSub = await db.select().from(subcategories).where(eq(subcategories.id, subcategoryid)).limit(1);
            if (!existingSub[0]) throw new BadRequest("Subcategory not found");
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
                throw new BadRequest("One or more Addon IDs are invalid");
            }
        }

        // 4. معالجة الصورة
        let imageUrl = image;
        if (image && image.startsWith("data:image")) {
            imageUrl = await saveBase64Image(image, req, "foods");
        }

        const foodId = uuidv4();

        // 5. بدء المعاملة (Transaction) لحفظ البيانات
        await db.transaction(async (tx) => {
            await tx.insert(food).values({
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
                discount_value: discount_value || null, Maximum_Purchase: Maximum_Purchase || null,
                stock_type: stock_type || "unlimited", status: status || "active",
                isOutOfStock: isOutOfStock ?? false,
                points: points ?? 0,
            });

            // إدخال الخيارات (Variations) إن وجدت
            if (variations && Array.isArray(variations) && variations.length > 0) {
                for (const variation of variations) {
                    const variationId = uuidv4();

                    await tx.insert(foodVariations).values({
                        id: variationId,
                        foodId,
                        name: variation.name, nameAr: variation.nameAr, nameFr: variation.nameFr,
                        isRequired: variation.isRequired ?? false,
                        selectionType: variation.selectionType || "single",
                        min: variation.min || null, max: variation.max || null,
                    });

                    if (variation.options && Array.isArray(variation.options)) {
                        const optionsToInsert = variation.options.map((option: any) => ({
                            variationId,
                            optionName: option.optionName, optionNameAr: option.optionNameAr, optionNameFr: option.optionNameFr,
                            additionalPrice: option.additionalPrice?.toString() || "0",
                        }));

                        if (optionsToInsert.length > 0) {
                            await tx.insert(variationOptions).values(optionsToInsert);
                        }
                    }
                }
            }
        });

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

    const rawFoods = await db.select({
        id: food.id, name: food.name, nameAr: food.nameAr, nameFr: food.nameFr,
        description: food.description, descriptionAr: food.descriptionAr, descriptionFr: food.descriptionFr,
        image: food.image, restaurantid: food.restaurantid, categoryid: food.categoryid, subcategoryid: food.subcategoryid,
        foodtype: food.foodtype, Nutrition: food.Nutrition, allergen_ingredients: food.allergen_ingredients,
        is_Halal: food.is_Halal, isOutOfStock: food.isOutOfStock, addonsId: food.addonsId, startTime: food.startTime, endTime: food.endTime,
        search_tags: food.search_tags, price: food.price, discount_type: food.discount_type, discount_value: food.discount_value,
        Maximum_Purchase: food.Maximum_Purchase, points: food.points, stock_type: food.stock_type, status: food.status,
        createdAt: food.createdAt, updatedAt: food.updatedAt,
        restaurant: restaurants,
        category_name: categories.name, category_nameAr: categories.nameAr, category_nameFr: categories.nameFr,
        subcategory_name: subcategories.name, subcategory_nameAr: subcategories.nameAr, subcategory_nameFr: subcategories.nameFr,
    })
        .from(food)
        .leftJoin(restaurants, eq(food.restaurantid, restaurants.id))
        .leftJoin(categories, eq(food.categoryid, categories.id))
        .leftJoin(subcategories, eq(food.subcategoryid, subcategories.id))
        .where(eq(food.restaurantid, restaurantId));

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

        // ✅ 2. فك تشفير الإضافات
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
            id: f.id, name: f.name, nameAr: f.nameAr, nameFr: f.nameFr,
            description: f.description, descriptionAr: f.descriptionAr, descriptionFr: f.descriptionFr,
            image: f.image, price: f.price, status: f.status,
            addonsId: cleanAddonsArray, // ✅ إرجاع الـ Array نظيفة
            addonsDetails: foodAddonsDetails, // 🔥 تفاصيل الإضافات
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
        id: food.id, name: food.name, nameAr: food.nameAr, nameFr: food.nameFr,
        description: food.description, descriptionAr: food.descriptionAr, descriptionFr: food.descriptionFr,
        image: food.image, restaurantid: food.restaurantid, categoryid: food.categoryid, subcategoryid: food.subcategoryid,
        foodtype: food.foodtype, Nutrition: food.Nutrition, allergen_ingredients: food.allergen_ingredients,
        is_Halal: food.is_Halal, isOutOfStock: food.isOutOfStock, addonsId: food.addonsId, startTime: food.startTime, endTime: food.endTime,
        search_tags: food.search_tags, price: food.price, discount_type: food.discount_type, discount_value: food.discount_value,
        Maximum_Purchase: food.Maximum_Purchase, points: food.points, stock_type: food.stock_type, status: food.status,
        createdAt: food.createdAt, updatedAt: food.updatedAt,
        restaurant: { id: restaurants.id, name: restaurants.name },
        category: { id: categories.id, name: categories.name, nameAr: categories.nameAr, nameFr: categories.nameFr },
        subcategory: { id: subcategories.id, name: subcategories.name, nameAr: subcategories.nameAr, nameFr: subcategories.nameFr },
    })
        .from(food)
        .leftJoin(restaurants, eq(food.restaurantid, restaurants.id))
        .leftJoin(categories, eq(food.categoryid, categories.id))
        .leftJoin(subcategories, eq(food.subcategoryid, subcategories.id))
        .where(and(eq(food.id, id), eq(food.restaurantid, restaurantId)))
        .limit(1);

    if (!foodItem[0]) throw new NotFound("Food not found");

    const vars = await db.select().from(foodVariations).where(eq(foodVariations.foodId, id));
    const varIds = vars.map(v => v.id);
    const opts = varIds.length ? await db.select().from(variationOptions).where(inArray(variationOptions.variationId, varIds)) : [];
    const variations = vars.map(v => ({ ...v, options: opts.filter(o => o.variationId === v.id) }));

    // ✅ 3. فك تشفير الإضافات، وجلب بيانات الإضافة بالكامل لتعرضها للمستخدم بشكل واضح
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
            addonsId: cleanAddonsArray,        // هيرجع الـ IDs زي ما هي
            addonsDetails: addonsDetails, // 🔥 تم إضافة بيانات الإضافة نفسها (اسمها وسعرها)
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

    // ✅ تأكد إن الأكلة تخص نفس الريستورانت
    const existingFood = await db
        .select()
        .from(food)
        .where(and(eq(food.id, id), eq(food.restaurantid, restaurantId)))
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
        "points", "isOutOfStock"
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

    // ✅ تنفيذ التحديث الرئيسي للأكلة
    if (Object.keys(updateData).length > 1) {
        await db.update(food).set(updateData).where(eq(food.id, id));
    }

    // ===========================
    // ✅ Variations Update
    // ===========================
    if (data.variations && Array.isArray(data.variations)) {

        const oldVars = await db
            .select()
            .from(foodVariations)
            .where(eq(foodVariations.foodId, id));

        // حذف options القديمة
        for (const v of oldVars) {
            await db
                .delete(variationOptions)
                .where(eq(variationOptions.variationId, v.id));
        }

        // حذف variations القديمة
        await db
            .delete(foodVariations)
            .where(eq(foodVariations.foodId, id));

        // إضافة الجديدة
        for (const variation of data.variations) {

            const variationId = uuidv4();

            await db.insert(foodVariations).values({
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
                    await db.insert(variationOptions).values({
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

    return SuccessResponse(res, {
        message: "Update food success",
    });
};
// =============================================
// DELETE Food
// =============================================
export const deleteFood = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    // ✅ استخدام and هنا أيضاً للحماية
    const existingFood = await db.select().from(food).where(and(eq(food.id, id), eq(food.restaurantid, restaurantId))).limit(1);
    if (!existingFood[0]) throw new NotFound("Food not found or you don't have permission to delete it");

    const vars = await db.select().from(foodVariations).where(eq(foodVariations.foodId, id));

    for (const v of vars) {
        await db.delete(variationOptions).where(eq(variationOptions.variationId, v.id));
    }

    await db.delete(foodVariations).where(eq(foodVariations.foodId, id));
    await db.delete(food).where(eq(food.id, id));

    return SuccessResponse(res, { message: "Delete food success" });
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
                isNull(subcategories.restaurantId)
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


    return SuccessResponse(res, {
        message: "Get food select data success",
        data: {
            categories: myCategories,
            subcategories: mySubcategories,
            addons: myAddons,
            ingredients: list
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
        .innerJoin(food, eq(foodVariations.foodId, food.id))
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
        .innerJoin(food, eq(foodVariations.foodId, food.id))
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
    const { status } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    const existingFood = await db.select().from(food).where(and(eq(food.id, id), eq(food.restaurantid, restaurantId))).limit(1);
    if (!existingFood[0]) throw new NotFound("Food not found or does not belong to you");

    await db.update(food).set({ status }).where(eq(food.id, id));

    if (status == "active") {
        await db.update(food).set({ status: "active" }).where(eq(food.id, id));
    } else if (status == "inactive") {
        await db.update(food).set({ status: "inactive" }).where(eq(food.id, id));
    }

    return SuccessResponse(res, { message: "Food status updated successfully" });
};

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
    const branchId = req.user?.branchId;

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
        .where(eq(food.restaurantid, restaurantId)); // fetch all foods — filter below

    if (rawFoods.length === 0) {
        return SuccessResponse(res, {
            message: "Get out-of-stock foods success",
            data: [],
        });
    }

    // Get unavailable branches for ALL foods
    const foodIds = rawFoods.map((f) => f.id);
    const unavailableBranchesMap = await getUnavailableBranchesForFoods(foodIds);

    // Keep only: globally OOS  OR  has at least one unavailable branch
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
