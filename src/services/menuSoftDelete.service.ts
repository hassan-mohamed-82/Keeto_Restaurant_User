import { and, eq, inArray } from "drizzle-orm";
import { db } from "../models/connection";
import { categories, subcategories, food, cartItems } from "../models/schema";
import { NotFound } from "../Errors/NotFound";
import { BadRequest } from "../Errors/BadRequest";

/**
 * Soft delete / restore for a restaurant's menu: subcategory -> food.
 * Every query is scoped to the restaurant, so one restaurant can never touch another's rows.
 *
 * Deleting a subcategory also trashes its foods with the SAME `deletedAt`, so restoring
 * it brings back exactly those foods — foods that were already in the trash stay there.
 */

/** `?deleted=true` on admin list endpoints returns the trash instead of live rows. */
export const isTrashRequest = (req: { query: any }): boolean =>
    String(req.query?.deleted ?? "").toLowerCase() === "true";

const trashed = (deletedAt: Date) => ({ isDeleted: true, deletedAt });
const restored = () => ({ isDeleted: false, deletedAt: null });

// MySQL `timestamp` keeps whole seconds; truncate so the value compared on restore
// equals what was stored.
const nowSeconds = () => new Date(Math.floor(Date.now() / 1000) * 1000);

// Customers must not keep a trashed food in their cart.
const clearCartsFor = async (tx: any, foodIds: string[]) => {
    if (foodIds.length) await tx.delete(cartItems).where(inArray(cartItems.foodId, foodIds));
};

// ---------------------------------------------------------------------------
// Subcategory
// ---------------------------------------------------------------------------
export const softDeleteSubcategory = async (restaurantId: string, id: string) => {
    const [sub] = await db.select({ id: subcategories.id, isDeleted: subcategories.isDeleted })
        .from(subcategories)
        .where(and(eq(subcategories.id, id), eq(subcategories.restaurantId, restaurantId)))
        .limit(1);
    if (!sub) throw new NotFound("Subcategory not found or you don't have permission to delete it");
    if (sub.isDeleted) throw new BadRequest("Subcategory is already deleted");

    const deletedAt = nowSeconds();
    let foodsCount = 0;

    await db.transaction(async (tx) => {
        const foods = await tx.select({ id: food.id }).from(food).where(and(
            eq(food.subcategoryid, id),
            eq(food.restaurantid, restaurantId),
            eq(food.isDeleted, false),
        ));

        await tx.update(subcategories)
            .set({ ...trashed(deletedAt), updatedAt: new Date() })
            .where(and(eq(subcategories.id, id), eq(subcategories.restaurantId, restaurantId)));

        if (foods.length) {
            const foodIds = foods.map(f => f.id);
            await tx.update(food).set(trashed(deletedAt)).where(inArray(food.id, foodIds));
            await clearCartsFor(tx, foodIds);
        }
        foodsCount = foods.length;
    });

    return { id, deletedAt, foodsCount };
};

export const restoreSubcategory = async (restaurantId: string, id: string) => {
    const [sub] = await db.select().from(subcategories)
        .where(and(eq(subcategories.id, id), eq(subcategories.restaurantId, restaurantId)))
        .limit(1);
    if (!sub) throw new NotFound("Subcategory not found or you don't have permission to restore it");
    if (!sub.isDeleted) throw new BadRequest("Subcategory is not deleted");

    const [parent] = await db.select({ isDeleted: categories.isDeleted }).from(categories)
        .where(eq(categories.id, sub.categoryId)).limit(1);
    if (!parent || parent.isDeleted) throw new BadRequest("The subcategory's category is deleted");

    let foodsCount = 0;
    await db.transaction(async (tx) => {
        await tx.update(subcategories)
            .set({ ...restored(), updatedAt: new Date() })
            .where(and(eq(subcategories.id, id), eq(subcategories.restaurantId, restaurantId)));

        if (sub.deletedAt) {
            const foods = await tx.select({ id: food.id }).from(food).where(and(
                eq(food.subcategoryid, id),
                eq(food.restaurantid, restaurantId),
                eq(food.isDeleted, true),
                eq(food.deletedAt, sub.deletedAt),
            ));
            if (foods.length) {
                await tx.update(food).set(restored()).where(inArray(food.id, foods.map(f => f.id)));
            }
            foodsCount = foods.length;
        }
    });

    return { id, foodsCount };
};

// ---------------------------------------------------------------------------
// Food
// ---------------------------------------------------------------------------
export const softDeleteFood = async (restaurantId: string, id: string) => {
    const [item] = await db.select({ id: food.id, isDeleted: food.isDeleted }).from(food)
        .where(and(eq(food.id, id), eq(food.restaurantid, restaurantId)))
        .limit(1);
    if (!item) throw new NotFound("Food not found or you don't have permission to delete it");
    if (item.isDeleted) throw new BadRequest("Food is already deleted");

    const deletedAt = nowSeconds();
    await db.transaction(async (tx) => {
        await tx.update(food)
            .set({ ...trashed(deletedAt), updatedAt: new Date() })
            .where(and(eq(food.id, id), eq(food.restaurantid, restaurantId)));
        await clearCartsFor(tx, [id]);
    });

    return { id, deletedAt };
};

export const restoreFood = async (restaurantId: string, id: string) => {
    const [item] = await db.select({
        id: food.id,
        isDeleted: food.isDeleted,
        categoryid: food.categoryid,
        subcategoryid: food.subcategoryid,
    }).from(food)
        .where(and(eq(food.id, id), eq(food.restaurantid, restaurantId)))
        .limit(1);
    if (!item) throw new NotFound("Food not found or you don't have permission to restore it");
    if (!item.isDeleted) throw new BadRequest("Food is not deleted");

    const [cat] = await db.select({ isDeleted: categories.isDeleted }).from(categories)
        .where(eq(categories.id, item.categoryid)).limit(1);
    if (!cat || cat.isDeleted) throw new BadRequest("The food's category is deleted");

    if (item.subcategoryid) {
        const [sub] = await db.select({ isDeleted: subcategories.isDeleted }).from(subcategories)
            .where(eq(subcategories.id, item.subcategoryid)).limit(1);
        if (sub?.isDeleted) throw new BadRequest("Restore the food's subcategory first");
    }

    await db.update(food)
        .set({ ...restored(), updatedAt: new Date() })
        .where(and(eq(food.id, id), eq(food.restaurantid, restaurantId)));

    return { id };
};
