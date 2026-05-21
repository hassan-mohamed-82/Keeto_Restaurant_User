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
} from "../../models/schema";
// ✅ تم إضافة and, or, isNull هنا عشان نصلح مشكلة الشروط المتعددة
import { eq, inArray, and, or, isNull } from "drizzle-orm";
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
        const restaurantId = req.user?.id;
        if (!restaurantId) {
            throw new Error("Restaurant ID missing or unauthorized"); // يمكنك استخدام BadRequest هنا
        }

        const {
            name, description, image,
            categoryid, subcategoryid,
            foodtype, Nutrition, allergen_ingredients, is_Halal,
            addonsId, startTime, endTime, search_tags,
            price, discount_type, discount_value, Maximum_Purchase, stock_type,
            status,
            variations,
            nameAr, nameFr, descriptionAr, descriptionFr
        } = req.body;

        // 1. التحقق من الحقول المطلوبة
        if (!name || !description || !image || !categoryid || !startTime || !endTime || !price) {
            throw new Error("Missing required fields");
        }

        // 2. التحقق من وجود العلاقات في قاعدة البيانات لمنع أخطاء Foreign Key
        const existingCategory = await db.select().from(categories)
            .where(eq(categories.id, categoryid)).limit(1);

        if (!existingCategory[0]) {
            throw new Error("Category not found");
        }

        if (subcategoryid) {
            const existingSub = await db.select().from(subcategories)
                .where(eq(subcategories.id, subcategoryid)).limit(1);

            if (!existingSub[0]) {
                throw new Error("Subcategory not found");
            }
        }

        if (addonsId) {
            const existingAddon = await db.select().from(addons)
                .where(and(eq(addons.id, addonsId), eq(addons.restaurantid, restaurantId)))
                .limit(1);

            if (!existingAddon[0]) {
                throw new Error("Addon not found");
            }
        }

        // 3. معالجة الصورة (خارج المعاملة لتجنب بطء قاعدة البيانات)
        let imageUrl = image;
        if (image && image.startsWith("data:image")) {
            imageUrl = await saveBase64Image(image, req, "foods");
        }

        const foodId = uuidv4();

        // 4. بدء المعاملة (Transaction) لحفظ البيانات أو التراجع عنها بالكامل
        await db.transaction(async (tx) => {
            
            // إدخال الصنف الرئيسي
            await tx.insert(food).values({
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
                status: status || "active",
            });

            // إدخال الخيارات (Variations) إن وجدت
            if (variations && Array.isArray(variations) && variations.length > 0) {
                for (const variation of variations) {
                    const variationId = uuidv4();

                    await tx.insert(foodVariations).values({
                        id: variationId,
                        foodId,
                        name: variation.name,
                        nameAr: variation.nameAr,
                        nameFr: variation.nameFr,
                        isRequired: variation.isRequired ?? false,
                        selectionType: variation.selectionType || "single",
                        min: variation.min || null,
                        max: variation.max || null,
                    });

                    // إدخال التفاصيل الداخلية للخيارات (Options) دفعة واحدة Bulk Insert
                    if (variation.options && Array.isArray(variation.options)) {
                        const optionsToInsert = variation.options.map((option: any) => ({
                            variationId,
                            optionName: option.optionName,
                            optionNameAr: option.optionNameAr,
                            optionNameFr: option.optionNameFr,
                            additionalPrice: option.additionalPrice?.toString() || "0",
                        }));
                        
                        if (optionsToInsert.length > 0) {
                            await tx.insert(variationOptions).values(optionsToInsert);
                        }
                    }
                }
            }
        });

        // إذا نجح كل شيء، نرسل استجابة النجاح
        // عدّل هذه الدالة لتتناسب مع طريقة إرسالك للـ Response في مشروعك
        return res.status(201).json({
            success: true,
            message: "Create food success",
            data: { id: foodId }
        });

    } catch (error: any) {
        // 🔥 هذا السطر هو الأهم: سيطبع سبب رفض قاعدة البيانات الحقيقي في شاشة السيرفر
        console.error("🔥 DATABASE ERROR DETAILED:", error.sqlMessage || error.message || error);

        // إرجاع الخطأ الدقيق للـ Postman لسهولة قراءته
        return res.status(500).json({
            success: false,
            error: {
                code: 500,
                message: "Failed to create food item",
                details: error.sqlMessage || error.message || "Unknown Error"
            }
        });
    }
};

// =============================================
// GET ALL Foods (Optimized & Secured)
// =============================================
export const getAllFoods = async (req: Request, res: Response) => {
 const restaurantId = req.user?.id;
 if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

 const rawFoods = await db.select({
 id: food.id,
 name: food.name,
 nameAr: food.nameAr,
 nameFr: food.nameFr,
 description: food.description,
 descriptionAr: food.descriptionAr,
 descriptionFr: food.descriptionFr,
 image: food.image,
 restaurantid: food.restaurantid,
 categoryid: food.categoryid,
 subcategoryid: food.subcategoryid,
 foodtype: food.foodtype,
 Nutrition: food.Nutrition,
        allergen_ingredients: food.allergen_ingredients,
 is_Halal: food.is_Halal,
 addonsId: food.addonsId,
 startTime: food.startTime,
 endTime: food.endTime,
 search_tags: food.search_tags,
 price: food.price,
 discount_type: food.discount_type,
 discount_value: food.discount_value,
 Maximum_Purchase: food.Maximum_Purchase,
 stock_type: food.stock_type,
 status: food.status,
 createdAt: food.createdAt,
 updatedAt: food.updatedAt,
 restaurant: restaurants,
 category_name: categories.name,
 category_nameAr: categories.nameAr,
 category_nameFr: categories.nameFr,
 subcategory_name: subcategories.name,
 subcategory_nameAr: subcategories.nameAr,
 subcategory_nameFr: subcategories.nameFr,
 })
 .from(food)
 .leftJoin(restaurants, eq(food.restaurantid, restaurants.id)) 
 .leftJoin(categories, eq(food.categoryid, categories.id))
 .leftJoin(subcategories, eq(food.subcategoryid, subcategories.id))
 .where(eq(food.restaurantid, restaurantId));

 if (rawFoods.length === 0) {
 return SuccessResponse(res, { message: "Get all foods success", data: [] });
 }

    // جلب كل التعديلات والخيارات الخاصة بالأكلات في هذا المطعم
    const foodIds = rawFoods.map(f => f.id);
    const allVars = await db.select().from(foodVariations).where(inArray(foodVariations.foodId, foodIds));
    const allVarIds = allVars.map(v => v.id);
    const allOpts = allVarIds.length > 0 
        ? await db.select().from(variationOptions).where(inArray(variationOptions.variationId, allVarIds)) 
        : [];

    // 👇 التعديل كله حصل في الجزء ده 👇
 const allFoods = rawFoods.map(f => {
        const foodVars = allVars.filter(v => v.foodId === f.id).map(v => ({
            ...v,
            options: allOpts.filter(o => o.variationId === v.id)
        }));

        return {
            id: f.id,
            name: f.name,
            nameAr: f.nameAr,               // ✅ تم الإضافة
            nameFr: f.nameFr,               // ✅ تم الإضافة
            description: f.description,
            descriptionAr: f.descriptionAr, // ✅ تم الإضافة
            descriptionFr: f.descriptionFr, // ✅ تم الإضافة
            image: f.image,
            price: f.price,
            status: f.status,               // ✅ تم الإضافة عشان لو حبيت تعرض حالة الأكلة في الجدول
            variations: foodVars,           // ✅ تم إضافة variations
            restaurant: f.restaurant,
            category: f.category_name ? { name: f.category_name, nameAr: f.category_nameAr, nameFr: f.category_nameFr } : null,
            subcategory: f.subcategory_name ? { name: f.subcategory_name, nameAr: f.subcategory_nameAr, nameFr: f.subcategory_nameFr } : null,
        };
    });

 return SuccessResponse(res, {
 message: "Get all foods success",
 data: allFoods
 });
};
// =============================================
// GET Food By ID
// =============================================
export const getFoodById = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    const foodItem = await db.select({
        id: food.id,
        name: food.name,
        nameAr: food.nameAr,
        nameFr: food.nameFr,
        description: food.description,
        descriptionAr: food.descriptionAr,
        descriptionFr: food.descriptionFr,
        image: food.image,
        restaurantid: food.restaurantid,
        categoryid: food.categoryid,
        subcategoryid: food.subcategoryid,
        foodtype: food.foodtype,
        Nutrition: food.Nutrition,
        allergen_ingredients: food.allergen_ingredients,
        is_Halal: food.is_Halal,
        addonsId: food.addonsId,
        startTime: food.startTime,
        endTime: food.endTime,
        search_tags: food.search_tags,
        price: food.price,
        discount_type: food.discount_type,
        discount_value: food.discount_value,
        Maximum_Purchase: food.Maximum_Purchase,
        stock_type: food.stock_type,
        status: food.status,
        createdAt: food.createdAt,
        updatedAt: food.updatedAt,
        restaurant: {
            id: restaurants.id,
            name: restaurants.name,
        },
        category: {
            id: categories.id,
            name: categories.name,
            nameAr: categories.nameAr,
            nameFr: categories.nameFr,
        },
        subcategory: {
            id: subcategories.id,
            name: subcategories.name,
            nameAr: subcategories.nameAr,
            nameFr: subcategories.nameFr,
        },
    })
        .from(food)
        // ✅ تم تعديل الربط والفلترة
        .leftJoin(restaurants, eq(food.restaurantid, restaurants.id))
        .leftJoin(categories, eq(food.categoryid, categories.id))
        .leftJoin(subcategories, eq(food.subcategoryid, subcategories.id))
        .where(and(eq(food.id, id), eq(food.restaurantid, restaurantId))) // ✅ يجب أن تكون الأكلة تخص المطعم
        .limit(1);

    if (!foodItem[0]) throw new NotFound("Food not found");

    const vars = await db.select().from(foodVariations).where(eq(foodVariations.foodId, id));
    const varIds = vars.map(v => v.id);

    const opts = varIds.length
        ? await db.select().from(variationOptions).where(inArray(variationOptions.variationId, varIds))
        : [];

    const variations = vars.map(v => ({
        ...v,
        options: opts.filter(o => o.variationId === v.id)
    }));

    return SuccessResponse(res, {
        message: "Get food by id success",
        data: { ...foodItem[0], variations }
    });
};

// =============================================
// UPDATE Food
// =============================================
export const updateFood = async (req: Request, res: Response) => {
    const { id } = req.params;
    const data = req.body;
    const restaurantId = req.user?.id;

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

    const updateData: any = {
        updatedAt: new Date(), // ✅ دايمًا Date object
    };

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
            } 
            else {
                updateData[key] = data[key];
            }
        }
    }

    // ✅ تنفيذ التحديث
    await db.update(food).set(updateData).where(eq(food.id, id));

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
                        additionalPrice: option.additionalPrice
                            ? option.additionalPrice.toString()
                            : "0",
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
    const restaurantId = req.user?.id;
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
// 🍳 إدارة الوصفة (Recipe / Food Ingredients)
// =========================================================

export const assignIngredientsToFood = async (req: Request, res: Response) => {
    const { id } = req.params; 
    const { ingredientsList } = req.body;
    const restaurantId = req.user?.id as string;

    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");
    if (!Array.isArray(ingredientsList)) throw new BadRequest("ingredientsList must be an array");

    const existingFood = await db.select().from(food).where(and(eq(food.id, id), eq(food.restaurantid, restaurantId))).limit(1);
    if (!existingFood[0]) throw new NotFound("Food not found or does not belong to you");

    await db.transaction(async (tx) => {
        await tx.delete(foodIngredients).where(eq(foodIngredients.foodId, id));

        if (ingredientsList.length > 0) {
            const valuesToInsert = ingredientsList.map((item: any) => ({
                id: uuidv4(),
                foodId: id,
                ingredientId: item.ingredientId,
                isRemovable: item.isRemovable || false
            }));
            await tx.insert(foodIngredients).values(valuesToInsert);
        }
    });

    return SuccessResponse(res, { message: "Food recipe saved successfully" });
};

export const getFoodRecipe = async (req: Request, res: Response) => {
    const { id } = req.params; 
    const restaurantId = req.user?.id as string;

    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    const existingFood = await db.select().from(food).where(and(eq(food.id, id), eq(food.restaurantid, restaurantId))).limit(1);
    if (!existingFood[0]) throw new NotFound("Food not found");

    const recipe = await db.select({
        id: foodIngredients.id, 
        ingredientId: ingredients.id,
        name: ingredients.name,
        inStock: ingredients.inStock,
        isRemovable: foodIngredients.isRemovable,
        categoryName: ingredientCategories.name
    })
    .from(foodIngredients)
    .innerJoin(ingredients, eq(foodIngredients.ingredientId, ingredients.id))
    .leftJoin(ingredientCategories, eq(ingredients.categoryId, ingredientCategories.id))
    .where(eq(foodIngredients.foodId, id));

    return SuccessResponse(res, { message: "Get food recipe success", data: recipe });
};

// =========================================================
// 🍳 Toggle Variation Status
// =========================================================
export const toggleVariationStatus = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status } = req.body;
    const restaurantId = req.user?.id as string;

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
    const restaurantId = req.user?.id as string;

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
    const restaurantId = req.user?.id as string;

    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");
  
    const existingFood = await db.select().from(food).where(and(eq(food.id, id), eq(food.restaurantid, restaurantId))).limit(1);
    if (!existingFood[0]) throw new NotFound("Food not found or does not belong to you");

    await db.update(food).set({ status }).where(eq(food.id, id));

    if(status == "active"){
        await db.update(food).set({ status: "active" }).where(eq(food.id, id));
    }else if(status == "inactive"){
        await db.update(food).set({ status: "inactive" }).where(eq(food.id, id));
    }

    return SuccessResponse(res, { message: "Food status updated successfully" });
};  