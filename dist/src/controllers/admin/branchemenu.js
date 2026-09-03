"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMasterFoodItem = exports.getRestaurantSelectData = exports.deleteBranchMenuItem = exports.updateBranchMenuItem = exports.getBranchMenu = exports.assignFoodToBranch = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const NotFound_1 = require("../../Errors/NotFound");
const uuid_1 = require("uuid");
const redis_1 = __importDefault(require("../../config/redis"));
// =============================================
// Helper: مسح كاش الفرع والمطعم بعد أي تعديل
// =============================================
const invalidateBranchMenuCache = async (branchId, restaurantId) => {
    await redis_1.default.del(`admin:branch_menu:${branchId}`);
    await redis_1.default.del(`admin:branch_select:${restaurantId}`);
};
// =============================================
// تعيين أكلة لفرع معين وتحديد سعرها ومخزونها
// =============================================
const assignFoodToBranch = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const userBranchId = req.user?.branchId; // لو هو مدير فرع، مش هيقدر يعدل غير في فرعه
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const { branchId, foodId, price, stockType, stockQty, status } = req.body;
    if (!branchId || !foodId || price === undefined) {
        throw new BadRequest_1.BadRequest("Missing required fields: branchId, foodId, price");
    }
    // 🚨 حماية: مدير الفرع ميعدلش في فرع غيره
    if (userBranchId && userBranchId !== branchId) {
        throw new BadRequest_1.BadRequest("Unauthorized: You can only manage menu items for your assigned branch");
    }
    // التأكد إن الفرع ده يخص المطعم
    const branchCheck = await connection_1.db.select().from(schema_1.branches)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.id, branchId), (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId))).limit(1);
    if (!branchCheck[0])
        throw new NotFound_1.NotFound("Branch not found or does not belong to your restaurant");
    // التأكد إن الأكلة دي موجودة فعلاً في الكتالوج بتاع المطعم ده
    const foodCheck = await connection_1.db.select().from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, foodId), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId))).limit(1);
    if (!foodCheck[0])
        throw new NotFound_1.NotFound("Food item not found in master catalog");
    // فحص: هل الأكلة دي موجودة في الفرع ده أصلاً؟
    const existingBranchItem = await connection_1.db.select().from(schema_1.branchMenuItems)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.branchId, branchId), (0, drizzle_orm_1.eq)(schema_1.branchMenuItems.foodId, foodId)))
        .limit(1);
    if (existingBranchItem[0]) {
        // لو موجودة، نعمل Update (مثلاً بيغلي السعر أو بيعدل المخزون)
        await connection_1.db.update(schema_1.branchMenuItems).set({
            price,
            stockType: stockType || "unlimited",
            stockQty: stockQty !== undefined ? stockQty : existingBranchItem[0].stockQty,
            status: status || existingBranchItem[0].status,
            updatedAt: new Date()
        }).where((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.id, existingBranchItem[0].id));
        await invalidateBranchMenuCache(branchId, restaurantId);
        return (0, response_1.SuccessResponse)(res, { message: "Branch menu item updated successfully" });
    }
    else {
        // لو أول مرة تتضاف للفرع، نعمل Insert
        const branchItemId = (0, uuid_1.v4)();
        await connection_1.db.insert(schema_1.branchMenuItems).values({
            id: branchItemId,
            branchId,
            foodId,
            price,
            stockType: stockType || "unlimited",
            stockQty: stockQty || 0,
            status: status || "active",
        });
        await invalidateBranchMenuCache(branchId, restaurantId);
        return (0, response_1.SuccessResponse)(res, { message: "Food assigned to branch successfully", data: { id: branchItemId } }, 201);
    }
};
exports.assignFoodToBranch = assignFoodToBranch;
// =============================================
// عرض منيو الفرع (دي اللي بترجع لتطبيق اليوزر)
// =============================================
const getBranchMenu = async (req, res) => {
    const { branchId } = req.params;
    // Get the restaurant ID for this branch
    const branchCheck = await connection_1.db.select({ restaurantId: schema_1.branches.restaurantId })
        .from(schema_1.branches)
        .where((0, drizzle_orm_1.eq)(schema_1.branches.id, branchId))
        .limit(1);
    if (!branchCheck[0])
        throw new NotFound_1.NotFound("Branch not found");
    const restaurantId = branchCheck[0].restaurantId;
    // ✅ Redis Cache
    const cacheKey = `admin:branch_menu:${branchId}`;
    const cachedData = await redis_1.default.get(cacheKey);
    if (cachedData) {
        return (0, response_1.SuccessResponse)(res, { message: "Get branch menu success", data: JSON.parse(cachedData) });
    }
    // الكتالوج الموحد مدمج مع استثناءات الفرع
    const rawBranchMenu = await connection_1.db.select({
        menuItemId: schema_1.branchMenuItems.id, // قد يكون null إذا لم يكن هناك استثناء
        foodId: schema_1.food.id,
        name: schema_1.food.name,
        nameAr: schema_1.food.nameAr,
        nameFr: schema_1.food.nameFr,
        description: schema_1.food.description,
        descriptionAr: schema_1.food.descriptionAr,
        descriptionFr: schema_1.food.descriptionFr,
        image: schema_1.food.image,
        foodIsOutOfStock: schema_1.food.isOutOfStock,
        categoryId: schema_1.food.categoryid,
        categoryName: schema_1.categories.name,
        categoryNameAr: schema_1.categories.nameAr,
        categoryNameFr: schema_1.categories.nameFr,
        // البيانات الخاصة بالفرع باستخدام COALESCE لاعتماد الأساسي في حالة غياب الاستثناء
        price: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.branchMenuItems.price}, ${schema_1.food.price})`.as('price'),
        status: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.branchMenuItems.status}, 'active')`.as('status'),
        stockType: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.branchMenuItems.stockType}, ${schema_1.food.stock_type})`.as('stock_type'),
        stockQty: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.branchMenuItems.stockQty}, 0)`.as('stock_qty'),
    })
        .from(schema_1.food)
        .leftJoin(schema_1.branchMenuItems, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.foodId, schema_1.food.id), (0, drizzle_orm_1.eq)(schema_1.branchMenuItems.branchId, branchId)))
        .leftJoin(schema_1.categories, (0, drizzle_orm_1.eq)(schema_1.food.categoryid, schema_1.categories.id))
        .where((0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId));
    // استخراج المنتجات غير المتاحة بسبب مكون أساسي مفقود في الفرع
    const lockedEssentialIngredients = await connection_1.db.select({
        foodId: schema_1.branchIngredientLocks.foodId
    })
        .from(schema_1.branchIngredientLocks)
        .innerJoin(schema_1.foodIngredients, (0, drizzle_orm_1.eq)(schema_1.branchIngredientLocks.ingredientId, schema_1.foodIngredients.ingredientId))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchIngredientLocks.branchId, branchId), (0, drizzle_orm_1.eq)(schema_1.branchIngredientLocks.isAvailable, false), (0, drizzle_orm_1.eq)(schema_1.foodIngredients.isEssential, true), (0, drizzle_orm_1.eq)(schema_1.foodIngredients.foodId, schema_1.branchIngredientLocks.foodId)));
    const unavailableFoodIds = new Set(lockedEssentialIngredients.map(lock => lock.foodId));
    // إضافة حقل isAvailable لكل منتج
    const branchMenu = rawBranchMenu.map(item => {
        const isAvailable = item.status === "active" &&
            !item.foodIsOutOfStock &&
            !unavailableFoodIds.has(item.foodId);
        return {
            ...item,
            isAvailable
        };
    });
    // ✅ Cache for 30 minutes
    await redis_1.default.set(cacheKey, JSON.stringify(branchMenu), 'EX', 1800);
    return (0, response_1.SuccessResponse)(res, { message: "Get branch menu success", data: branchMenu });
};
exports.getBranchMenu = getBranchMenu;
const updateBranchMenuItem = async (req, res) => {
    const { id } = req.params; // branchMenuItemId
    // 1. استخدام Default Value لمنع خطأ الـ Destructuring إذا كان req.body غير معرف
    const { price, stockType, stockQty, status } = req.body || {};
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const userBranchId = req.user?.branchId;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing");
    // 2. التأكد من وجود عنصر القائمة
    const [existingItem] = await connection_1.db.select().from(schema_1.branchMenuItems)
        .where((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.id, id)).limit(1);
    if (!existingItem)
        throw new NotFound_1.NotFound("Branch menu item not found");
    // 3. التأكد من صلاحية مدير الفرع
    if (userBranchId && userBranchId !== existingItem.branchId) {
        throw new BadRequest_1.BadRequest("Unauthorized: You cannot edit another branch's menu");
    }
    // 4. التأكد من تبعية الفرع للمطعم
    const [branchCheck] = await connection_1.db.select().from(schema_1.branches)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.id, existingItem.branchId), (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId))).limit(1);
    if (!branchCheck)
        throw new NotFound_1.NotFound("Branch not found");
    // 5. تجميع البيانات المرسلة فقط للتحديث
    const updateData = {};
    if (price !== undefined)
        updateData.price = price;
    if (stockType !== undefined)
        updateData.stockType = stockType;
    if (stockQty !== undefined)
        updateData.stockQty = stockQty;
    if (status !== undefined)
        updateData.status = status;
    // التأكد من إرسال حقل واحد على الأقل للقيم المراد تحديثها
    if (Object.keys(updateData).length === 0) {
        throw new BadRequest_1.BadRequest("No valid fields provided for update");
    }
    updateData.updatedAt = new Date();
    // 6. تنفيذ التحديث
    await connection_1.db.update(schema_1.branchMenuItems).set(updateData).where((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.id, id));
    // ✅ Invalidate cache
    await invalidateBranchMenuCache(existingItem.branchId, restaurantId);
    return (0, response_1.SuccessResponse)(res, { message: "Branch menu item updated successfully" });
};
exports.updateBranchMenuItem = updateBranchMenuItem;
const deleteBranchMenuItem = async (req, res) => {
    const { id } = req.params; // الـ branchMenuItemId
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const userBranchId = req.user?.branchId;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing");
    // 1. التأكد إن العنصر ده موجود أصلاً
    const existingItem = await connection_1.db.select().from(schema_1.branchMenuItems)
        .where((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.id, id)).limit(1);
    if (!existingItem[0])
        throw new NotFound_1.NotFound("Branch menu item not found");
    // 2. حماية الصلاحيات
    if (userBranchId && userBranchId !== existingItem[0].branchId) {
        throw new BadRequest_1.BadRequest("Unauthorized: You cannot delete another branch's menu item");
    }
    // 3. التأكد إن الفرع يخص المطعم
    const branchCheck = await connection_1.db.select().from(schema_1.branches)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.id, existingItem[0].branchId), (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId))).limit(1);
    if (!branchCheck[0])
        throw new NotFound_1.NotFound("Branch not found");
    // 4. حذف العنصر
    await connection_1.db.delete(schema_1.branchMenuItems).where((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.id, id));
    // ✅ Invalidate cache
    await invalidateBranchMenuCache(existingItem[0].branchId, restaurantId);
    return (0, response_1.SuccessResponse)(res, { message: "Branch menu item deleted successfully" });
};
exports.deleteBranchMenuItem = deleteBranchMenuItem;
// controllers/restaurant.controller.ts
const getRestaurantSelectData = async (req, res) => {
    // بناخد الـ ID بتاع المطعم من التوكن (المالك اللي عامل Login)
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    // ✅ Redis Cache
    const cacheKey = `admin:branch_select:${restaurantId}`;
    const cachedData = await redis_1.default.get(cacheKey);
    if (cachedData) {
        return (0, response_1.SuccessResponse)(res, { message: "Select data fetched successfully", data: JSON.parse(cachedData) });
    }
    // تنفيذ الـ Queries في وقت واحد لسرعة الاستجابة
    const [myBranches, myFoods] = await Promise.all([
        // 1. جلب الفروع النشطة فقط
        connection_1.db.select({
            id: schema_1.branches.id,
            name: schema_1.branches.name,
        })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.branches.status, "active") // الفروع الشغالة بس
        )),
        // 2. جلب قائمة الأكل (الكتالوج) بالكامل للمطعم ده
        connection_1.db.select({
            id: schema_1.food.id,
            name: schema_1.food.name,
        })
            .from(schema_1.food)
            .where((0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId))
    ]);
    const responseData = { branches: myBranches, foods: myFoods };
    // ✅ Cache for 30 minutes
    await redis_1.default.set(cacheKey, JSON.stringify(responseData), 'EX', 1800);
    return (0, response_1.SuccessResponse)(res, {
        message: "Select data fetched successfully",
        data: responseData
    });
};
exports.getRestaurantSelectData = getRestaurantSelectData;
// =============================================
// تعديل بيانات الأكلة الأساسية في الكتالوج (Master Food)
// =============================================
const updateMasterFoodItem = async (req, res) => {
    const { id } = req.params; // ده الـ foodId
    const { name, description, image, categoryId } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing");
    // 1. التأكد إن الأكلة دي موجودة وتخص المطعم ده
    const existingFood = await connection_1.db.select().from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, id), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId))).limit(1);
    if (!existingFood[0]) {
        throw new NotFound_1.NotFound("Food item not found or you don't have permission to edit it");
    }
    // 2. تجهيز البيانات الجديدة للتحديث
    const updateData = {};
    if (name !== undefined)
        updateData.name = name;
    if (description !== undefined)
        updateData.description = description;
    if (image !== undefined)
        updateData.image = image;
    if (categoryId !== undefined)
        updateData.categoryid = categoryId;
    // updateData.updatedAt = new Date(); // لو عندك حقل updatedAt في جدول الـ food
    // 3. تحديث الداتابيز
    await connection_1.db.update(schema_1.food)
        .set(updateData)
        .where((0, drizzle_orm_1.eq)(schema_1.food.id, id));
    // ✅ Invalidate all branch menus that might contain this food
    const branchMenuKeys = await redis_1.default.keys('admin:branch_menu:*');
    if (branchMenuKeys.length > 0)
        await redis_1.default.del(...branchMenuKeys);
    await redis_1.default.del(`admin:branch_select:${restaurantId}`);
    return (0, response_1.SuccessResponse)(res, { message: "Master food item updated successfully" });
};
exports.updateMasterFoodItem = updateMasterFoodItem;
