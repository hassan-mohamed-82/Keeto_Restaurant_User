"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.restoreFood = exports.softDeleteFood = exports.restoreSubcategory = exports.softDeleteSubcategory = exports.isTrashRequest = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const connection_1 = require("../models/connection");
const schema_1 = require("../models/schema");
const NotFound_1 = require("../Errors/NotFound");
const BadRequest_1 = require("../Errors/BadRequest");
/**
 * Soft delete / restore for a restaurant's menu: subcategory -> food.
 * Every query is scoped to the restaurant, so one restaurant can never touch another's rows.
 *
 * Deleting a subcategory also trashes its foods with the SAME `deletedAt`, so restoring
 * it brings back exactly those foods — foods that were already in the trash stay there.
 */
/** `?deleted=true` on admin list endpoints returns the trash instead of live rows. */
const isTrashRequest = (req) => String(req.query?.deleted ?? "").toLowerCase() === "true";
exports.isTrashRequest = isTrashRequest;
const trashed = (deletedAt) => ({ isDeleted: true, deletedAt });
const restored = () => ({ isDeleted: false, deletedAt: null });
// MySQL `timestamp` keeps whole seconds; truncate so the value compared on restore
// equals what was stored.
const nowSeconds = () => new Date(Math.floor(Date.now() / 1000) * 1000);
// Customers must not keep a trashed food in their cart.
const clearCartsFor = async (tx, foodIds) => {
    if (foodIds.length)
        await tx.delete(schema_1.cartItems).where((0, drizzle_orm_1.inArray)(schema_1.cartItems.foodId, foodIds));
};
// ---------------------------------------------------------------------------
// Subcategory
// ---------------------------------------------------------------------------
const softDeleteSubcategory = async (restaurantId, id) => {
    const [sub] = await connection_1.db.select({ id: schema_1.subcategories.id, isDeleted: schema_1.subcategories.isDeleted })
        .from(schema_1.subcategories)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.subcategories.id, id), (0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId)))
        .limit(1);
    if (!sub)
        throw new NotFound_1.NotFound("Subcategory not found or you don't have permission to delete it");
    if (sub.isDeleted)
        throw new BadRequest_1.BadRequest("Subcategory is already deleted");
    const deletedAt = nowSeconds();
    let foodsCount = 0;
    await connection_1.db.transaction(async (tx) => {
        const foods = await tx.select({ id: schema_1.food.id }).from(schema_1.food).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.subcategoryid, id), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), (0, drizzle_orm_1.eq)(schema_1.food.isDeleted, false)));
        await tx.update(schema_1.subcategories)
            .set({ ...trashed(deletedAt), updatedAt: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.subcategories.id, id), (0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId)));
        if (foods.length) {
            const foodIds = foods.map(f => f.id);
            await tx.update(schema_1.food).set(trashed(deletedAt)).where((0, drizzle_orm_1.inArray)(schema_1.food.id, foodIds));
            await clearCartsFor(tx, foodIds);
        }
        foodsCount = foods.length;
    });
    return { id, deletedAt, foodsCount };
};
exports.softDeleteSubcategory = softDeleteSubcategory;
const restoreSubcategory = async (restaurantId, id) => {
    const [sub] = await connection_1.db.select().from(schema_1.subcategories)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.subcategories.id, id), (0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId)))
        .limit(1);
    if (!sub)
        throw new NotFound_1.NotFound("Subcategory not found or you don't have permission to restore it");
    if (!sub.isDeleted)
        throw new BadRequest_1.BadRequest("Subcategory is not deleted");
    const [parent] = await connection_1.db.select({ isDeleted: schema_1.categories.isDeleted }).from(schema_1.categories)
        .where((0, drizzle_orm_1.eq)(schema_1.categories.id, sub.categoryId)).limit(1);
    if (!parent || parent.isDeleted)
        throw new BadRequest_1.BadRequest("The subcategory's category is deleted");
    let foodsCount = 0;
    await connection_1.db.transaction(async (tx) => {
        await tx.update(schema_1.subcategories)
            .set({ ...restored(), updatedAt: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.subcategories.id, id), (0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId)));
        if (sub.deletedAt) {
            const foods = await tx.select({ id: schema_1.food.id }).from(schema_1.food).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.subcategoryid, id), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), (0, drizzle_orm_1.eq)(schema_1.food.isDeleted, true), (0, drizzle_orm_1.eq)(schema_1.food.deletedAt, sub.deletedAt)));
            if (foods.length) {
                await tx.update(schema_1.food).set(restored()).where((0, drizzle_orm_1.inArray)(schema_1.food.id, foods.map(f => f.id)));
            }
            foodsCount = foods.length;
        }
    });
    return { id, foodsCount };
};
exports.restoreSubcategory = restoreSubcategory;
// ---------------------------------------------------------------------------
// Food
// ---------------------------------------------------------------------------
const softDeleteFood = async (restaurantId, id) => {
    const [item] = await connection_1.db.select({ id: schema_1.food.id, isDeleted: schema_1.food.isDeleted }).from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, id), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)))
        .limit(1);
    if (!item)
        throw new NotFound_1.NotFound("Food not found or you don't have permission to delete it");
    if (item.isDeleted)
        throw new BadRequest_1.BadRequest("Food is already deleted");
    const deletedAt = nowSeconds();
    await connection_1.db.transaction(async (tx) => {
        await tx.update(schema_1.food)
            .set({ ...trashed(deletedAt), updatedAt: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, id), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)));
        await clearCartsFor(tx, [id]);
    });
    return { id, deletedAt };
};
exports.softDeleteFood = softDeleteFood;
const restoreFood = async (restaurantId, id) => {
    const [item] = await connection_1.db.select({
        id: schema_1.food.id,
        isDeleted: schema_1.food.isDeleted,
        categoryid: schema_1.food.categoryid,
        subcategoryid: schema_1.food.subcategoryid,
    }).from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, id), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)))
        .limit(1);
    if (!item)
        throw new NotFound_1.NotFound("Food not found or you don't have permission to restore it");
    if (!item.isDeleted)
        throw new BadRequest_1.BadRequest("Food is not deleted");
    const [cat] = await connection_1.db.select({ isDeleted: schema_1.categories.isDeleted }).from(schema_1.categories)
        .where((0, drizzle_orm_1.eq)(schema_1.categories.id, item.categoryid)).limit(1);
    if (!cat || cat.isDeleted)
        throw new BadRequest_1.BadRequest("The food's category is deleted");
    if (item.subcategoryid) {
        const [sub] = await connection_1.db.select({ isDeleted: schema_1.subcategories.isDeleted }).from(schema_1.subcategories)
            .where((0, drizzle_orm_1.eq)(schema_1.subcategories.id, item.subcategoryid)).limit(1);
        if (sub?.isDeleted)
            throw new BadRequest_1.BadRequest("Restore the food's subcategory first");
    }
    await connection_1.db.update(schema_1.food)
        .set({ ...restored(), updatedAt: new Date() })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, id), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)));
    return { id };
};
exports.restoreFood = restoreFood;
