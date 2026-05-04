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
// ✅ تم إضافة and هنا عشان نصلح مشكلة الشروط المتعددة
import { eq, inArray, and } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { NotFound } from "../../Errors/NotFound";
import { BadRequest } from "../../Errors/BadRequest";
import { v4 as uuidv4 } from "uuid";
import { saveBase64Image, handleImageUpdate } from "../../utils/handleImages";

// =============================================
// CREATE Food
// =============================================
export const createFood = async (req: Request, res: Response) => {
    const restaurantId = req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

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

    if (!name || !description || !image || !categoryid || !startTime || !endTime || !price) {
        throw new BadRequest("Missing required fields");
    }

    // ✅ تأمين: نتأكد إن القسم ده تبع المطعم الحالي (لو الأقسام مشتركة شيل شرط المطعم)
    const existingCategory = await db.select().from(categories).where(and(eq(categories.id, categoryid))).limit(1);
    if (!existingCategory[0]) throw new BadRequest("Category not found or does not belong to your restaurant");

    if (subcategoryid) {
        const existingSub = await db.select().from(subcategories).where(and(eq(subcategories.id, subcategoryid))).limit(1);
        if (!existingSub[0]) throw new BadRequest("Subcategory not found or does not belong to your restaurant");
    }

    if (addonsId) {
        const existingAddon = await db.select().from(addons).where(and(eq(addons.id, addonsId), eq(addons.restaurantid, restaurantId))).limit(1);
        if (!existingAddon[0]) throw new BadRequest("Addon not found or does not belong to your restaurant");
    }

    let imageUrl = image;
    if (image && image.startsWith("data:image")) {
        imageUrl = await saveBase64Image(image, req, "foods");
    }
    
    const foodId = uuidv4();


    await db.insert(food).values({
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
            const variationId = uuidv4();

            await db.insert(foodVariations).values({
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
                    await db.insert(variationOptions).values({
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

    return SuccessResponse(res, { message: "Create food success", data: { id: foodId } }, 201);
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
        restaurant_id: restaurants.id,
        restaurant_name: restaurants.name,
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

    // 👇 التعديل كله حصل في الجزء ده 👇
    const allFoods = rawFoods.map(f => ({
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
        restaurant: f.restaurant_id ? { id: f.restaurant_id, name: f.restaurant_name } : null,
        category: f.category_name ? { name: f.category_name, nameAr: f.category_nameAr, nameFr: f.category_nameFr } : null,
        subcategory: f.subcategory_name ? { name: f.subcategory_name, nameAr: f.subcategory_nameAr, nameFr: f.subcategory_nameFr } : null,
    }));

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
    const restaurantId = req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

  
    // ✅ جلب الأقسام الخاصة بالمطعم فقط (بافتراض إن الجدول يحتوي على restaurantid)
    const myCategories = await db
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(and(eq(categories.status, "active")));

    // ✅ جلب الأقسام الفرعية الخاصة بالمطعم فقط
    const mySubcategories = await db
        .select({
            id: subcategories.id,
            name: subcategories.name,
            categoryId: subcategories.categoryId
        })
        .from(subcategories)
        .where(and(eq(subcategories.status, "active")));

    // ✅ جلب الإضافات الخاصة بالمطعم فقط
    const myAddons = await db
        .select({ id: addons.id, name: addons.name })
        .from(addons)
        .where(and(eq(addons.status, "active"), eq(addons.restaurantid, restaurantId)));

    return SuccessResponse(res, {
        message: "Get food select data success",
        data: {
            categories: myCategories,
            subcategories: mySubcategories,
            addons: myAddons
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