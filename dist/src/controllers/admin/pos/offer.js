"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteOffer = exports.updateOffer = exports.storeOffer = exports.getOfferByFoodId = exports.getFoodsWithoutOffer = exports.getOffers = exports.isOfferActiveNow = exports.STANDARD_DAYS_OF_WEEK = void 0;
const connection_1 = require("../../../models/connection");
const schema_1 = require("../../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../../utils/response");
const Errors_1 = require("../../../Errors");
const localization_helper_1 = require("../../../helpers/localization.helper");
/**
 * Standard days of the week in Node.js (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
 */
exports.STANDARD_DAYS_OF_WEEK = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
];
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
const isOfferActiveNow = (offerDays, offerStart, offerEnd, date = new Date()) => {
    const days = (0, localization_helper_1.parseJsonArray)(offerDays);
    if (!days || days.length === 0)
        return false;
    // 1. Check if today's day is in offer_days
    const todayIndex = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const todayName = exports.STANDARD_DAYS_OF_WEEK[todayIndex];
    const isToday = days.map((d) => d.toLowerCase().trim()).includes(todayName);
    if (!isToday)
        return false;
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
        }
        else {
            // Overnight window (e.g., 22:00 to 04:00)
            return currentTime >= startTime || currentTime <= endTime;
        }
    }
    return true;
};
exports.isOfferActiveNow = isOfferActiveNow;
// =========================================================================
// 1. View API => List foods with active offer (where offer_price is not null)
// =========================================================================
const getOffers = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const params = { ...req.query, ...req.body };
    const { search, all } = params;
    const page = Math.max(1, parseInt(params.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(params.limit, 10) || 10));
    const offset = (page - 1) * limit;
    const conditions = [
        (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId),
        (0, drizzle_orm_1.isNull)(schema_1.food.deletedAt),
        (0, drizzle_orm_1.isNotNull)(schema_1.food.offer_price),
    ];
    if (search && typeof search === "string" && search.trim() !== "") {
        const term = `%${search.trim()}%`;
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(schema_1.food.name, term), (0, drizzle_orm_1.like)(schema_1.food.nameAr, term), (0, drizzle_orm_1.like)(schema_1.food.nameFr, term)));
    }
    const isAll = all === "true" || all === true;
    const [totalCountResult, rawFoods] = await Promise.all([
        connection_1.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema_1.food)
            .where((0, drizzle_orm_1.and)(...conditions)),
        isAll
            ? connection_1.db
                .select({
                id: schema_1.food.id,
                name: schema_1.food.name,
                nameAr: schema_1.food.nameAr,
                nameFr: schema_1.food.nameFr,
                offer_price: schema_1.food.offer_price,
                offer_days: schema_1.food.offer_days,
                offer_start: schema_1.food.offer_start,
                offer_end: schema_1.food.offer_end,
            })
                .from(schema_1.food)
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.food.updatedAt))
            : connection_1.db
                .select({
                id: schema_1.food.id,
                name: schema_1.food.name,
                nameAr: schema_1.food.nameAr,
                nameFr: schema_1.food.nameFr,
                offer_price: schema_1.food.offer_price,
                offer_days: schema_1.food.offer_days,
                offer_start: schema_1.food.offer_start,
                offer_end: schema_1.food.offer_end,
            })
                .from(schema_1.food)
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.food.updatedAt))
                .limit(limit)
                .offset(offset),
    ]);
    const totalItems = Number(totalCountResult[0]?.count || 0);
    const totalPages = isAll ? 1 : Math.ceil(totalItems / limit);
    // Format output with localized name and array offer_days
    const formattedList = rawFoods.map((item) => ({
        foodId: item.id,
        id: item.id,
        name: (0, localization_helper_1.getLocalizedName)(item, lang),
        offer_price: item.offer_price,
        offer_days: (0, localization_helper_1.parseJsonArray)(item.offer_days),
        offer_start: item.offer_start,
        offer_end: item.offer_end,
    }));
    return (0, response_1.SuccessResponse)(res, {
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
exports.getOffers = getOffers;
// =========================================================================
// 2. List of foods without offer (where offer_price is null)
// =========================================================================
const getFoodsWithoutOffer = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const params = { ...req.query, ...req.body };
    const { search, all } = params;
    const page = Math.max(1, parseInt(params.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(params.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const conditions = [
        (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId),
        (0, drizzle_orm_1.isNull)(schema_1.food.deletedAt),
        (0, drizzle_orm_1.isNull)(schema_1.food.offer_price),
    ];
    if (search && typeof search === "string" && search.trim() !== "") {
        const term = `%${search.trim()}%`;
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(schema_1.food.name, term), (0, drizzle_orm_1.like)(schema_1.food.nameAr, term), (0, drizzle_orm_1.like)(schema_1.food.nameFr, term)));
    }
    const isAll = all === "true" || all === true;
    const [totalCountResult, rawFoods] = await Promise.all([
        connection_1.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema_1.food)
            .where((0, drizzle_orm_1.and)(...conditions)),
        isAll
            ? connection_1.db
                .select({
                id: schema_1.food.id,
                name: schema_1.food.name,
                nameAr: schema_1.food.nameAr,
                nameFr: schema_1.food.nameFr,
                price: schema_1.food.price,
                image: schema_1.food.image,
            })
                .from(schema_1.food)
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.food.createdAt))
            : connection_1.db
                .select({
                id: schema_1.food.id,
                name: schema_1.food.name,
                nameAr: schema_1.food.nameAr,
                nameFr: schema_1.food.nameFr,
                price: schema_1.food.price,
                image: schema_1.food.image,
            })
                .from(schema_1.food)
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.food.createdAt))
                .limit(limit)
                .offset(offset),
    ]);
    const totalItems = Number(totalCountResult[0]?.count || 0);
    const totalPages = isAll ? 1 : Math.ceil(totalItems / limit);
    const formattedList = rawFoods.map((item) => ({
        foodId: item.id,
        id: item.id,
        name: (0, localization_helper_1.getLocalizedName)(item, lang),
        price: item.price,
        image: item.image,
    }));
    return (0, response_1.SuccessResponse)(res, {
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
exports.getFoodsWithoutOffer = getFoodsWithoutOffer;
// =========================================================================
// 3. Filter by ID => Show single food offer details
// =========================================================================
const getOfferByFoodId = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const foodId = req.params.foodId ||
        req.params.id ||
        req.body.foodId ||
        req.query.foodId;
    if (!foodId) {
        throw new Errors_1.BadRequest("Food ID is required");
    }
    const [item] = await connection_1.db
        .select({
        id: schema_1.food.id,
        name: schema_1.food.name,
        nameAr: schema_1.food.nameAr,
        nameFr: schema_1.food.nameFr,
        offer_price: schema_1.food.offer_price,
        offer_days: schema_1.food.offer_days,
        offer_start: schema_1.food.offer_start,
        offer_end: schema_1.food.offer_end,
    })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, foodId), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), (0, drizzle_orm_1.isNull)(schema_1.food.deletedAt)))
        .limit(1);
    if (!item) {
        throw new Errors_1.NotFound("Food item not found or unauthorized");
    }
    return (0, response_1.SuccessResponse)(res, {
        foodId: item.id,
        id: item.id,
        name: (0, localization_helper_1.getLocalizedName)(item, lang),
        offer_price: item.offer_price,
        offer_days: (0, localization_helper_1.parseJsonArray)(item.offer_days),
        offer_start: item.offer_start,
        offer_end: item.offer_end,
    });
};
exports.getOfferByFoodId = getOfferByFoodId;
// =========================================================================
// 4. Store API => Create / Set offer for existing food
// =========================================================================
const storeOffer = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const { foodId, offer_price, offer_days, offer_start, offer_end } = req.body;
    // Check food existence & ownership
    const [existingFood] = await connection_1.db
        .select({
        id: schema_1.food.id,
        name: schema_1.food.name,
        nameAr: schema_1.food.nameAr,
        nameFr: schema_1.food.nameFr,
        price: schema_1.food.price,
    })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, foodId), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), (0, drizzle_orm_1.isNull)(schema_1.food.deletedAt)))
        .limit(1);
    if (!existingFood) {
        throw new Errors_1.NotFound("Food item not found or does not belong to this restaurant");
    }
    // Update food with offer details
    await connection_1.db
        .update(schema_1.food)
        .set({
        offer_price: String(offer_price),
        offer_days: offer_days,
        offer_start: offer_start,
        offer_end: offer_end,
        updatedAt: new Date(),
    })
        .where((0, drizzle_orm_1.eq)(schema_1.food.id, foodId));
    return (0, response_1.SuccessResponse)(res, {
        message: "Offer created successfully",
        foodId: existingFood.id,
        id: existingFood.id,
        name: (0, localization_helper_1.getLocalizedName)(existingFood, lang),
        offer_price: String(offer_price),
        offer_days: (0, localization_helper_1.parseJsonArray)(offer_days),
        offer_start,
        offer_end,
    }, 201);
};
exports.storeOffer = storeOffer;
// =========================================================================
// 5. Update API => Update existing food offer
// =========================================================================
const updateOffer = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const foodId = req.params.foodId ||
        req.params.id ||
        req.body.foodId;
    if (!foodId) {
        throw new Errors_1.BadRequest("Food ID is required");
    }
    const { offer_price, offer_days, offer_start, offer_end } = req.body;
    // Check food existence & ownership
    const [existingFood] = await connection_1.db
        .select({
        id: schema_1.food.id,
        name: schema_1.food.name,
        nameAr: schema_1.food.nameAr,
        nameFr: schema_1.food.nameFr,
    })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, foodId), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), (0, drizzle_orm_1.isNull)(schema_1.food.deletedAt)))
        .limit(1);
    if (!existingFood) {
        throw new Errors_1.NotFound("Food item not found or does not belong to this restaurant");
    }
    // Update food offer details
    await connection_1.db
        .update(schema_1.food)
        .set({
        offer_price: String(offer_price),
        offer_days: offer_days,
        offer_start: offer_start,
        offer_end: offer_end,
        updatedAt: new Date(),
    })
        .where((0, drizzle_orm_1.eq)(schema_1.food.id, foodId));
    return (0, response_1.SuccessResponse)(res, {
        message: "Offer updated successfully",
        foodId: existingFood.id,
        id: existingFood.id,
        name: (0, localization_helper_1.getLocalizedName)(existingFood, lang),
        offer_price: String(offer_price),
        offer_days: (0, localization_helper_1.parseJsonArray)(offer_days),
        offer_start,
        offer_end,
    });
};
exports.updateOffer = updateOffer;
// =========================================================================
// 6. Delete API => Reset offer columns to null without deleting the food
// =========================================================================
const deleteOffer = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const foodId = req.params.foodId ||
        req.params.id ||
        req.body.foodId;
    if (!foodId) {
        throw new Errors_1.BadRequest("Food ID is required");
    }
    // Check food existence & ownership
    const [existingFood] = await connection_1.db
        .select({ id: schema_1.food.id })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, foodId), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), (0, drizzle_orm_1.isNull)(schema_1.food.deletedAt)))
        .limit(1);
    if (!existingFood) {
        throw new Errors_1.NotFound("Food item not found or does not belong to this restaurant");
    }
    // Reset only offer columns to NULL
    await connection_1.db
        .update(schema_1.food)
        .set({
        offer_price: (0, drizzle_orm_1.sql) `NULL`,
        offer_days: (0, drizzle_orm_1.sql) `NULL`,
        offer_start: (0, drizzle_orm_1.sql) `NULL`,
        offer_end: (0, drizzle_orm_1.sql) `NULL`,
        updatedAt: new Date(),
    })
        .where((0, drizzle_orm_1.eq)(schema_1.food.id, foodId));
    return (0, response_1.SuccessResponse)(res, {
        message: "Food offer removed successfully",
        foodId,
    });
};
exports.deleteOffer = deleteOffer;
