import { Request, Response } from "express";
import { db } from "../../../models/connection";
import { food } from "../../../models/schema";
import { eq, and, desc, or, like, isNull, isNotNull, count, sql } from "drizzle-orm";
import { SuccessResponse } from "../../../utils/response";
import { BadRequest, NotFound } from "../../../Errors";
import { extractLang, getLocalizedName, parseJsonArray } from "../../../helpers/localization.helper";

/**
 * Standard days of the week in Node.js (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
 */
export const STANDARD_DAYS_OF_WEEK = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
] as const;

/**
 * Node.js helper function to check whether an offer is active right now.
 * Can be used anywhere in the application to evaluate current offer validity.
 *
 * @param offerDays Array of standard day names (e.g. ['sunday', 'monday'])
 * @param offerStart Start time in HH:mm or HH:mm:ss format
 * @param offerEnd End time in HH:mm or HH:mm:ss format
 * @param date Optional custom Date object (defaults to new Date())
 * @returns boolean true if today is in offerDays and current time is within window
 */
export const isOfferActiveNow = (
    offerDays: string[] | null | undefined,
    offerStart: string | null | undefined,
    offerEnd: string | null | undefined,
    date: Date = new Date()
): boolean => {
    const days = parseJsonArray(offerDays);
    if (!days || days.length === 0) return false;

    // 1. Check if today's day is in offer_days
    const todayIndex = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const todayName = STANDARD_DAYS_OF_WEEK[todayIndex];
    const isToday = days.map((d) => d.toLowerCase().trim()).includes(todayName);
    if (!isToday) return false;

    // 2. Check time window if start & end are specified
    if (offerStart && offerEnd) {
        const currentHours = String(date.getHours()).padStart(2, "0");
        const currentMinutes = String(date.getMinutes()).padStart(2, "0");
        const currentTime = `${currentHours}:${currentMinutes}`;

        const startTime = offerStart.slice(0, 5);
        const endTime = offerEnd.slice(0, 5);

        if (endTime >= startTime) {
            // Normal same-day window (e.g., 09:00 to 22:00)
            return currentTime >= startTime && currentTime <= endTime;
        } else {
            // Overnight window (e.g., 22:00 to 04:00)
            return currentTime >= startTime || currentTime <= endTime;
        }
    }

    return true;
};

// =========================================================================
// 1. View API => List foods with active offer (where offer_price is not null)
// =========================================================================
export const getOffers = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const params = { ...req.query, ...req.body };
    const { search, all } = params;

    const page = Math.max(1, parseInt(params.page as string, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(params.limit as string, 10) || 10));
    const offset = (page - 1) * limit;

    const conditions = [
        eq(food.restaurantid, restaurantId),
        isNull(food.deletedAt),
        isNotNull(food.offer_price),
    ];

    if (search && typeof search === "string" && search.trim() !== "") {
        const term = `%${search.trim()}%`;
        conditions.push(
            or(
                like(food.name, term),
                like(food.nameAr, term),
                like(food.nameFr, term)
            ) as any
        );
    }

    const isAll = all === "true" || all === true;

    const [totalCountResult, rawFoods] = await Promise.all([
        db
            .select({ count: count() })
            .from(food)
            .where(and(...conditions)),
        isAll
            ? db
                  .select({
                      id: food.id,
                      name: food.name,
                      nameAr: food.nameAr,
                      nameFr: food.nameFr,
                      offer_price: food.offer_price,
                      offer_days: food.offer_days,
                      offer_start: food.offer_start,
                      offer_end: food.offer_end,
                  })
                  .from(food)
                  .where(and(...conditions))
                  .orderBy(desc(food.updatedAt))
            : db
                  .select({
                      id: food.id,
                      name: food.name,
                      nameAr: food.nameAr,
                      nameFr: food.nameFr,
                      offer_price: food.offer_price,
                      offer_days: food.offer_days,
                      offer_start: food.offer_start,
                      offer_end: food.offer_end,
                  })
                  .from(food)
                  .where(and(...conditions))
                  .orderBy(desc(food.updatedAt))
                  .limit(limit)
                  .offset(offset),
    ]);

    const totalItems = Number(totalCountResult[0]?.count || 0);
    const totalPages = isAll ? 1 : Math.ceil(totalItems / limit);

    // Format output with localized name and array offer_days
    const formattedList = rawFoods.map((item) => ({
        foodId: item.id,
        id: item.id,
        name: getLocalizedName(item, lang),
        offer_price: item.offer_price,
        offer_days: parseJsonArray(item.offer_days),
        offer_start: item.offer_start,
        offer_end: item.offer_end,
    }));

    return SuccessResponse(res, {
        message: "Offers fetched successfully",
        data: formattedList,
        pagination: {
            page: isAll ? 1 : page,
            limit: isAll ? totalItems : limit,
            totalItems,
            totalPages,
        },
    });
};

// =========================================================================
// 2. List of foods without offer (where offer_price is null)
// =========================================================================
export const getFoodsWithoutOffer = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const params = { ...req.query, ...req.body };
    const { search, all } = params;

    const page = Math.max(1, parseInt(params.page as string, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(params.limit as string, 10) || 20));
    const offset = (page - 1) * limit;

    const conditions = [
        eq(food.restaurantid, restaurantId),
        isNull(food.deletedAt),
        isNull(food.offer_price),
    ];

    if (search && typeof search === "string" && search.trim() !== "") {
        const term = `%${search.trim()}%`;
        conditions.push(
            or(
                like(food.name, term),
                like(food.nameAr, term),
                like(food.nameFr, term)
            ) as any
        );
    }

    const isAll = all === "true" || all === true;

    const [totalCountResult, rawFoods] = await Promise.all([
        db
            .select({ count: count() })
            .from(food)
            .where(and(...conditions)),
        isAll
            ? db
                  .select({
                      id: food.id,
                      name: food.name,
                      nameAr: food.nameAr,
                      nameFr: food.nameFr,
                      price: food.price,
                      image: food.image,
                  })
                  .from(food)
                  .where(and(...conditions))
                  .orderBy(desc(food.createdAt))
            : db
                  .select({
                      id: food.id,
                      name: food.name,
                      nameAr: food.nameAr,
                      nameFr: food.nameFr,
                      price: food.price,
                      image: food.image,
                  })
                  .from(food)
                  .where(and(...conditions))
                  .orderBy(desc(food.createdAt))
                  .limit(limit)
                  .offset(offset),
    ]);

    const totalItems = Number(totalCountResult[0]?.count || 0);
    const totalPages = isAll ? 1 : Math.ceil(totalItems / limit);

    const formattedList = rawFoods.map((item) => ({
        foodId: item.id,
        id: item.id,
        name: getLocalizedName(item, lang),
        price: item.price,
        image: item.image,
    }));

    return SuccessResponse(res, {
        message: "Available foods without offer fetched successfully",
        data: formattedList,
        pagination: {
            page: isAll ? 1 : page,
            limit: isAll ? totalItems : limit,
            totalItems,
            totalPages,
        },
    });
};

// =========================================================================
// 3. Filter by ID => Show single food offer details
// =========================================================================
export const getOfferByFoodId = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const foodId =
        (req.params.foodId as string) ||
        (req.params.id as string) ||
        (req.body.foodId as string) ||
        (req.query.foodId as string);

    if (!foodId) {
        throw new BadRequest("Food ID is required");
    }

    const [item] = await db
        .select({
            id: food.id,
            name: food.name,
            nameAr: food.nameAr,
            nameFr: food.nameFr,
            offer_price: food.offer_price,
            offer_days: food.offer_days,
            offer_start: food.offer_start,
            offer_end: food.offer_end,
        })
        .from(food)
        .where(
            and(
                eq(food.id, foodId),
                eq(food.restaurantid, restaurantId),
                isNull(food.deletedAt)
            )
        )
        .limit(1);

    if (!item) {
        throw new NotFound("Food item not found or unauthorized");
    }

    return SuccessResponse(res, {
        foodId: item.id,
        id: item.id,
        name: getLocalizedName(item, lang),
        offer_price: item.offer_price,
        offer_days: parseJsonArray(item.offer_days),
        offer_start: item.offer_start,
        offer_end: item.offer_end,
    });
};

// =========================================================================
// 4. Store API => Create / Set offer for existing food
// =========================================================================
export const storeOffer = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const { foodId, offer_price, offer_days, offer_start, offer_end } = req.body;

    // Check food existence & ownership
    const [existingFood] = await db
        .select({
            id: food.id,
            name: food.name,
            nameAr: food.nameAr,
            nameFr: food.nameFr,
            price: food.price,
        })
        .from(food)
        .where(
            and(
                eq(food.id, foodId),
                eq(food.restaurantid, restaurantId),
                isNull(food.deletedAt)
            )
        )
        .limit(1);

    if (!existingFood) {
        throw new NotFound("Food item not found or does not belong to this restaurant");
    }

    // Update food with offer details
    await db
        .update(food)
        .set({
            offer_price: String(offer_price),
            offer_days: offer_days,
            offer_start: offer_start,
            offer_end: offer_end,
            updatedAt: new Date(),
        })
        .where(eq(food.id, foodId));

    return SuccessResponse(
        res,
        {
            message: "Offer created successfully",
            foodId: existingFood.id,
            id: existingFood.id,
            name: getLocalizedName(existingFood, lang),
            offer_price: String(offer_price),
            offer_days: parseJsonArray(offer_days),
            offer_start,
            offer_end,
        },
        201
    );
};

// =========================================================================
// 5. Update API => Update existing food offer
// =========================================================================
export const updateOffer = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const foodId =
        (req.params.foodId as string) ||
        (req.params.id as string) ||
        (req.body.foodId as string);

    if (!foodId) {
        throw new BadRequest("Food ID is required");
    }

    const { offer_price, offer_days, offer_start, offer_end } = req.body;

    // Check food existence & ownership
    const [existingFood] = await db
        .select({
            id: food.id,
            name: food.name,
            nameAr: food.nameAr,
            nameFr: food.nameFr,
        })
        .from(food)
        .where(
            and(
                eq(food.id, foodId),
                eq(food.restaurantid, restaurantId),
                isNull(food.deletedAt)
            )
        )
        .limit(1);

    if (!existingFood) {
        throw new NotFound("Food item not found or does not belong to this restaurant");
    }

    // Update food offer details
    await db
        .update(food)
        .set({
            offer_price: String(offer_price),
            offer_days: offer_days,
            offer_start: offer_start,
            offer_end: offer_end,
            updatedAt: new Date(),
        })
        .where(eq(food.id, foodId));

    return SuccessResponse(res, {
        message: "Offer updated successfully",
        foodId: existingFood.id,
        id: existingFood.id,
        name: getLocalizedName(existingFood, lang),
        offer_price: String(offer_price),
        offer_days: parseJsonArray(offer_days),
        offer_start,
        offer_end,
    });
};

// =========================================================================
// 6. Delete API => Reset offer columns to null without deleting the food
// =========================================================================
export const deleteOffer = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const foodId =
        (req.params.foodId as string) ||
        (req.params.id as string) ||
        (req.body.foodId as string);

    if (!foodId) {
        throw new BadRequest("Food ID is required");
    }

    // Check food existence & ownership
    const [existingFood] = await db
        .select({ id: food.id })
        .from(food)
        .where(
            and(
                eq(food.id, foodId),
                eq(food.restaurantid, restaurantId),
                isNull(food.deletedAt)
            )
        )
        .limit(1);

    if (!existingFood) {
        throw new NotFound("Food item not found or does not belong to this restaurant");
    }

    // Reset only offer columns to NULL
    await db
        .update(food)
        .set({
            offer_price: sql`NULL`,
            offer_days: sql`NULL`,
            offer_start: sql`NULL`,
            offer_end: sql`NULL`,
            updatedAt: new Date(),
        })
        .where(eq(food.id, foodId));

    return SuccessResponse(res, {
        message: "Food offer removed successfully",
        foodId,
    });
};
