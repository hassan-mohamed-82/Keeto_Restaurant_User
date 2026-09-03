"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBranchAvailability = exports.toggleIngredientLock = exports.toggleBranchFoodLock = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const NotFound_1 = require("../../Errors/NotFound");
const uuid_1 = require("uuid");
const redis_1 = __importDefault(require("../../config/redis"));
// =============================================
// Toggle قفل منتج في فرع معين
// PATCH /:branchId/food/:foodId/lock
// =============================================
const toggleBranchFoodLock = async (req, res) => {
    const { branchId, foodId } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const userBranchId = req.user?.branchId;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing");
    // حماية الصلاحيات
    if (userBranchId && userBranchId !== branchId) {
        throw new BadRequest_1.BadRequest("Unauthorized: You cannot edit another branch's data");
    }
    // التأكد إن الفرع يخص المطعم
    const branchCheck = await connection_1.db.select({ id: schema_1.branches.id })
        .from(schema_1.branches)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.id, branchId), (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId)))
        .limit(1);
    if (!branchCheck[0])
        throw new NotFound_1.NotFound("Branch not found or does not belong to your restaurant");
    // التأكد إن الأكلة دي موجودة فعلاً في الكتالوج
    const foodCheck = await connection_1.db.select({ id: schema_1.food.id })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, foodId), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)))
        .limit(1);
    if (!foodCheck[0])
        throw new NotFound_1.NotFound("Food item not found in master catalog");
    // جلب السجل الحالي في branchMenuItems إن وجد
    const existing = await connection_1.db.select()
        .from(schema_1.branchMenuItems)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.branchId, branchId), (0, drizzle_orm_1.eq)(schema_1.branchMenuItems.foodId, foodId)))
        .limit(1);
    let newStatus;
    if (existing[0]) {
        newStatus = existing[0].status === "active" ? "inactive" : "active";
        await connection_1.db.update(schema_1.branchMenuItems)
            .set({ status: newStatus, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.id, existing[0].id));
    }
    else {
        // إذا لم تكن موجودة، فهي افتراضيا نشطة، وسنقوم بقفلها
        newStatus = "inactive";
        await connection_1.db.insert(schema_1.branchMenuItems).values({
            id: (0, uuid_1.v4)(),
            branchId,
            foodId,
            status: newStatus,
        });
    }
    // مسح كاش منيو الفرع اللي بيتحسب ديناميكياً
    await redis_1.default.del(`admin:branch_menu:${branchId}`);
    // Also clear user facing cache if exists
    const userCacheKey = `restaurant_details:${restaurantId}:branch:${branchId}`;
    await redis_1.default.del(userCacheKey);
    return (0, response_1.SuccessResponse)(res, {
        message: `Food "${foodId}" is now ${newStatus} in branch "${branchId}"`,
        data: { status: newStatus }
    });
};
exports.toggleBranchFoodLock = toggleBranchFoodLock;
// =============================================
// Toggle قفل ingredient لمنتج (سواء globally أو في فرع معين)
// PATCH /food/:foodId/ingredient/:ingredientId/lock
// Body: { branchId?: string }
// =============================================
const toggleIngredientLock = async (req, res) => {
    const { foodId, ingredientId } = req.params;
    const { branchId } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const userBranchId = req.user?.branchId;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing");
    if (branchId) {
        // حماية الصلاحيات
        if (userBranchId && userBranchId !== branchId) {
            throw new BadRequest_1.BadRequest("Unauthorized: You cannot edit another branch's data");
        }
        // التأكد إن الفرع يخص المطعم
        const branchCheck = await connection_1.db.select({ id: schema_1.branches.id })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.id, branchId), (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId)))
            .limit(1);
        if (!branchCheck[0])
            throw new NotFound_1.NotFound("Branch not found or does not belong to your restaurant");
        // التأكد إن الـ ingredient مرتبط بالأكلة دي فعلاً
        const linkCheck = await connection_1.db.select({ id: schema_1.foodIngredients.id })
            .from(schema_1.foodIngredients)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.foodIngredients.foodId, foodId), (0, drizzle_orm_1.eq)(schema_1.foodIngredients.ingredientId, ingredientId)))
            .limit(1);
        if (!linkCheck[0])
            throw new NotFound_1.NotFound("This ingredient is not linked to this food item");
        // جلب السجل الحالي إن وجد
        const existing = await connection_1.db.select()
            .from(schema_1.branchIngredientLocks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchIngredientLocks.branchId, branchId), (0, drizzle_orm_1.eq)(schema_1.branchIngredientLocks.foodId, foodId), (0, drizzle_orm_1.eq)(schema_1.branchIngredientLocks.ingredientId, ingredientId)))
            .limit(1);
        let newIsAvailable;
        if (existing[0]) {
            newIsAvailable = !existing[0].isAvailable;
            await connection_1.db.update(schema_1.branchIngredientLocks)
                .set({ isAvailable: newIsAvailable, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema_1.branchIngredientLocks.id, existing[0].id));
        }
        else {
            newIsAvailable = false; // Default toggled state is false (locked)
            await connection_1.db.insert(schema_1.branchIngredientLocks).values({
                id: (0, uuid_1.v4)(),
                branchId,
                foodId,
                ingredientId,
                isAvailable: false,
            });
        }
        // مسح كاش منيو الفرع اللي بيتحسب ديناميكياً
        await redis_1.default.del(`admin:branch_menu:${branchId}`);
        // Also clear user facing cache if exists
        const userCacheKey = `restaurant_details:${restaurantId}:branch:${branchId}`;
        await redis_1.default.del(userCacheKey);
        return (0, response_1.SuccessResponse)(res, {
            message: `Ingredient is now ${newIsAvailable ? 'available' : 'unavailable'} for food "${foodId}" in branch "${branchId}"`,
            data: { isAvailable: newIsAvailable }
        });
    }
    else {
        // التأكد إن الأكلة تخص المطعم
        const foodCheck = await connection_1.db.select({ id: schema_1.food.id, isOutOfStock: schema_1.food.isOutOfStock })
            .from(schema_1.food)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, foodId), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)))
            .limit(1);
        if (!foodCheck[0])
            throw new NotFound_1.NotFound("Food not found or does not belong to your restaurant");
        // التأكد إن الـ ingredient مرتبط بالأكلة
        const linkCheck = await connection_1.db.select({ id: schema_1.foodIngredients.id })
            .from(schema_1.foodIngredients)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.foodIngredients.foodId, foodId), (0, drizzle_orm_1.eq)(schema_1.foodIngredients.ingredientId, ingredientId)))
            .limit(1);
        if (!linkCheck[0])
            throw new NotFound_1.NotFound("This ingredient is not linked to this food item");
        // جلب الحالة الحالية للـ ingredient
        const ingredientCheck = await connection_1.db.select({ id: schema_1.ingredients.id, inStock: schema_1.ingredients.inStock })
            .from(schema_1.ingredients)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ingredients.id, ingredientId), (0, drizzle_orm_1.eq)(schema_1.ingredients.restaurantId, restaurantId)))
            .limit(1);
        if (!ingredientCheck[0])
            throw new NotFound_1.NotFound("Ingredient not found");
        // Toggle حالة المكون
        const newInStock = !ingredientCheck[0].inStock;
        await connection_1.db.update(schema_1.ingredients)
            .set({ inStock: newInStock, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.ingredients.id, ingredientId));
        // تحديث food.isOutOfStock بناءً على حالة كل المكونات
        if (!newInStock) {
            // ingredient أصبح out of stock → المنتج out of stock
            await connection_1.db.update(schema_1.food)
                .set({ isOutOfStock: true })
                .where((0, drizzle_orm_1.eq)(schema_1.food.id, foodId));
        }
        else {
            // ingredient أصبح in stock → نتحقق هل كل المكونات الأخرى in stock
            const allIngredients = await connection_1.db.select({
                id: schema_1.ingredients.id,
                inStock: schema_1.ingredients.inStock
            })
                .from(schema_1.ingredients)
                .innerJoin(schema_1.foodIngredients, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.foodIngredients.ingredientId, schema_1.ingredients.id), (0, drizzle_orm_1.eq)(schema_1.foodIngredients.foodId, foodId)));
            const allInStock = allIngredients.every(ing => ing.inStock === true);
            if (allInStock) {
                // كل المكونات متاحة → المنتج متاح
                await connection_1.db.update(schema_1.food)
                    .set({ isOutOfStock: false })
                    .where((0, drizzle_orm_1.eq)(schema_1.food.id, foodId));
            }
        }
        // مسح كاش الهوم
        const homeMenuKeys = await redis_1.default.keys('restaurant_details:*');
        if (homeMenuKeys.length > 0)
            await redis_1.default.del(...homeMenuKeys);
        const categoryKeys = await redis_1.default.keys('foods_category:*');
        if (categoryKeys.length > 0)
            await redis_1.default.del(...categoryKeys);
        return (0, response_1.SuccessResponse)(res, {
            message: `Ingredient is now ${newInStock ? 'in stock' : 'out of stock'} globally. Food "${foodId}" isOutOfStock = ${!newInStock}`,
            data: {
                ingredientInStock: newInStock,
                foodIsOutOfStock: !newInStock
            }
        });
    }
};
exports.toggleIngredientLock = toggleIngredientLock;
// =============================================
// جلب حالة قفل منتج أو مكون في جميع فروع المطعم
// GET /availability?foodId=...&ingredientId=...
// =============================================
const getBranchAvailability = async (req, res) => {
    const { foodId, ingredientId } = req.query;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing");
    if (!foodId && !ingredientId)
        throw new BadRequest_1.BadRequest("Must provide foodId or ingredientId");
    // جلب جميع الفروع النشطة التابعة للمطعم
    const allBranches = await connection_1.db.select({
        id: schema_1.branches.id,
        name: schema_1.branches.name,
        nameAr: schema_1.branches.nameAr,
    })
        .from(schema_1.branches)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.branches.status, 'active')));
    let result = [];
    if (ingredientId && foodId) {
        // فحص حالة قفل المكون لمنتج معين
        const locks = await connection_1.db.select()
            .from(schema_1.branchIngredientLocks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchIngredientLocks.foodId, foodId), (0, drizzle_orm_1.eq)(schema_1.branchIngredientLocks.ingredientId, ingredientId)));
        const lockMap = new Map(locks.map(l => [l.branchId, l.isAvailable]));
        result = allBranches.map(b => ({
            branchId: b.id,
            branchName: b.name,
            branchNameAr: b.nameAr,
            // لو مفيش قفل صريح، يبقى متاح (true)
            isAvailable: lockMap.has(b.id) ? lockMap.get(b.id) : true
        }));
    }
    else if (foodId) {
        // فحص حالة قفل المنتج ككل
        const menuItems = await connection_1.db.select()
            .from(schema_1.branchMenuItems)
            .where((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.foodId, foodId));
        const statusMap = new Map(menuItems.map(m => [m.branchId, m.status]));
        result = allBranches.map(b => ({
            branchId: b.id,
            branchName: b.name,
            branchNameAr: b.nameAr,
            // لو مفيش سجل، يبقى متاح (active)
            isAvailable: statusMap.has(b.id) ? statusMap.get(b.id) === 'active' : true
        }));
    }
    else if (ingredientId) {
        // فحص حالة قفل المكون بشكل عام (في حال كان foodId غير موجود)
        // بنفترض إنك بتبحث عن القفل الخاص بالمكون ككل على مستوى الفرع (foodId is null)
        const locks = await connection_1.db.select()
            .from(schema_1.branchIngredientLocks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchIngredientLocks.ingredientId, ingredientId)));
        // فلترة السجلات اللي ملهاش foodId فقط أو حسب البزنس لوجيك
        const generalLocks = locks.filter(l => !l.foodId);
        const lockMap = new Map(generalLocks.map(l => [l.branchId, l.isAvailable]));
        result = allBranches.map(b => ({
            branchId: b.id,
            branchName: b.name,
            branchNameAr: b.nameAr,
            isAvailable: lockMap.has(b.id) ? lockMap.get(b.id) : true
        }));
    }
    return (0, response_1.SuccessResponse)(res, {
        message: "Branch availability fetched successfully",
        data: result
    });
};
exports.getBranchAvailability = getBranchAvailability;
