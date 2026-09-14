"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPopupById = exports.getActivePopups = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const Errors_1 = require("../../Errors");
const response_1 = require("../../utils/response");
// ─── Get All Active Popups (filtered by date and status) ───
const getActivePopups = async (req, res) => {
    const now = new Date();
    const activePopups = await connection_1.db
        .select({
        id: schema_1.popup.id,
        Title: schema_1.popup.Title,
        TitleAr: schema_1.popup.TitleAr,
        TitleFr: schema_1.popup.TitleFr,
        description: schema_1.popup.description,
        descriptionAr: schema_1.popup.descriptionAr,
        descriptionFr: schema_1.popup.descriptionFr,
        image: schema_1.popup.image,
        imageAr: schema_1.popup.imageAr,
        imageFr: schema_1.popup.imageFr,
        type: schema_1.popup.type,
        linkType: schema_1.popup.linkType,
        link: schema_1.popup.link,
        subcategoryId: schema_1.popup.subcategoryId,
        subcategoryName: schema_1.subcategories.name,
        subcategoryNameAr: schema_1.subcategories.nameAr,
        foodId: schema_1.popup.foodId,
        productId: schema_1.popup.foodId,
        foodName: schema_1.food.name,
        foodNameAr: schema_1.food.nameAr,
        foodImage: schema_1.food.image,
        discountId: schema_1.popup.discountId,
        discountName: schema_1.discounts.name,
        discountNameAr: schema_1.discounts.nameAr,
        discountType: schema_1.discounts.discountType,
        discountValue: schema_1.discounts.discountValue,
        startDate: schema_1.popup.startDate,
        endDate: schema_1.popup.endDate,
    })
        .from(schema_1.popup)
        .leftJoin(schema_1.subcategories, (0, drizzle_orm_1.eq)(schema_1.popup.subcategoryId, schema_1.subcategories.id))
        .leftJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.popup.foodId, schema_1.food.id))
        .leftJoin(schema_1.discounts, (0, drizzle_orm_1.eq)(schema_1.popup.discountId, schema_1.discounts.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.popup.status, "active"), (0, drizzle_orm_1.lte)(schema_1.popup.startDate, now), (0, drizzle_orm_1.gte)(schema_1.popup.endDate, now)));
    return (0, response_1.SuccessResponse)(res, { message: "Get active popups success", data: activePopups });
};
exports.getActivePopups = getActivePopups;
// ─── Get Active Popup By ID ───
const getPopupById = async (req, res) => {
    const { id } = req.params;
    const result = await connection_1.db
        .select({
        id: schema_1.popup.id,
        Title: schema_1.popup.Title,
        TitleAr: schema_1.popup.TitleAr,
        TitleFr: schema_1.popup.TitleFr,
        description: schema_1.popup.description,
        descriptionAr: schema_1.popup.descriptionAr,
        descriptionFr: schema_1.popup.descriptionFr,
        image: schema_1.popup.image,
        imageAr: schema_1.popup.imageAr,
        imageFr: schema_1.popup.imageFr,
        type: schema_1.popup.type,
        linkType: schema_1.popup.linkType,
        link: schema_1.popup.link,
        subcategoryId: schema_1.popup.subcategoryId,
        subcategoryName: schema_1.subcategories.name,
        subcategoryNameAr: schema_1.subcategories.nameAr,
        foodId: schema_1.popup.foodId,
        productId: schema_1.popup.foodId,
        foodName: schema_1.food.name,
        foodNameAr: schema_1.food.nameAr,
        foodImage: schema_1.food.image,
        discountId: schema_1.popup.discountId,
        discountName: schema_1.discounts.name,
        discountNameAr: schema_1.discounts.nameAr,
        discountType: schema_1.discounts.discountType,
        discountValue: schema_1.discounts.discountValue,
        startDate: schema_1.popup.startDate,
        endDate: schema_1.popup.endDate,
    })
        .from(schema_1.popup)
        .leftJoin(schema_1.subcategories, (0, drizzle_orm_1.eq)(schema_1.popup.subcategoryId, schema_1.subcategories.id))
        .leftJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.popup.foodId, schema_1.food.id))
        .leftJoin(schema_1.discounts, (0, drizzle_orm_1.eq)(schema_1.popup.discountId, schema_1.discounts.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.popup.id, id), (0, drizzle_orm_1.eq)(schema_1.popup.status, "active")))
        .limit(1);
    if (!result[0]) {
        throw new Errors_1.NotFound("Popup not found");
    }
    return (0, response_1.SuccessResponse)(res, { message: "Get popup by id success", data: result[0] });
};
exports.getPopupById = getPopupById;
