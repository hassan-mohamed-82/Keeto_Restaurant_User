"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMasterFoodItem = exports.getRestaurantSelectData = exports.deleteBranchMenuItem = exports.updateBranchMenuItem = exports.getBranchMenu = exports.assignFoodToBranch = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const NotFound_1 = require("../../Errors/NotFound");
const uuid_1 = require("uuid");
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
        return (0, response_1.SuccessResponse)(res, { message: "Food assigned to branch successfully", data: { id: branchItemId } }, 201);
    }
};
exports.assignFoodToBranch = assignFoodToBranch;
// =============================================
// عرض منيو الفرع (دي اللي بترجع لتطبيق اليوزر)
// =============================================
const getBranchMenu = async (req, res) => {
    const { branchId } = req.params;
    // هنجيب الداتا المتغيرة (السعر/الحالة) من جدول الفرع، وندمجها مع الداتا الثابتة من جدول الأكل
    const branchMenu = await connection_1.db.select({
        menuItemId: schema_1.branchMenuItems.id,
        foodId: schema_1.food.id,
        name: schema_1.food.name,
        description: schema_1.food.description,
        image: schema_1.food.image,
        categoryId: schema_1.food.categoryid,
        categoryName: schema_1.categories.name,
        // البيانات اللي بتخص الفرع ده بس:
        price: schema_1.branchMenuItems.price,
        status: schema_1.branchMenuItems.status,
        stockType: schema_1.branchMenuItems.stockType,
        stockQty: schema_1.branchMenuItems.stockQty,
    })
        .from(schema_1.branchMenuItems)
        .innerJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.branchMenuItems.foodId, schema_1.food.id))
        .leftJoin(schema_1.categories, (0, drizzle_orm_1.eq)(schema_1.food.categoryid, schema_1.categories.id))
        .where((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.branchId, branchId));
    return (0, response_1.SuccessResponse)(res, { message: "Get branch menu success", data: branchMenu });
};
exports.getBranchMenu = getBranchMenu;
const updateBranchMenuItem = async (req, res) => {
    const { id } = req.params; // ده الـ branchMenuItemId
    const { price, stockType, stockQty, status } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const userBranchId = req.user?.branchId;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing");
    // 1. التأكد إن العنصر ده موجود أصلاً
    const existingItem = await connection_1.db.select().from(schema_1.branchMenuItems)
        .where((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.id, id)).limit(1);
    if (!existingItem[0])
        throw new NotFound_1.NotFound("Branch menu item not found");
    // 2. حماية الصلاحيات (لو مدير فرع، يتأكد إن العنصر ده في فرعه)
    if (userBranchId && userBranchId !== existingItem[0].branchId) {
        throw new BadRequest_1.BadRequest("Unauthorized: You cannot edit another branch's menu");
    }
    // 3. التأكد إن الفرع ده يخص المطعم (لزيادة الأمان)
    const branchCheck = await connection_1.db.select().from(schema_1.branches)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.id, existingItem[0].branchId), (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId))).limit(1);
    if (!branchCheck[0])
        throw new NotFound_1.NotFound("Branch not found");
    // 4. تحديث البيانات
    const updateData = {};
    if (price !== undefined)
        updateData.price = price;
    if (stockType)
        updateData.stockType = stockType;
    if (stockQty !== undefined)
        updateData.stockQty = stockQty;
    if (status)
        updateData.status = status;
    updateData.updatedAt = new Date();
    await connection_1.db.update(schema_1.branchMenuItems).set(updateData).where((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.id, id));
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
    return (0, response_1.SuccessResponse)(res, {
        message: "Select data fetched successfully",
        data: {
            branches: myBranches,
            foods: myFoods
        }
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
    return (0, response_1.SuccessResponse)(res, { message: "Master food item updated successfully" });
};
exports.updateMasterFoodItem = updateMasterFoodItem;
