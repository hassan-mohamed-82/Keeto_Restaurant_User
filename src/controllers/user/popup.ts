import { Request, Response } from "express";
import { db } from "../../models/connection";
import { popup, subcategories, food, discounts } from "../../models/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { NotFound } from "../../Errors";
import { SuccessResponse } from "../../utils/response";

// ─── Get All Active Popups (filtered by date and status) ───
export const getActivePopups = async (req: Request, res: Response) => {
    const now = new Date();

    const activePopups = await db
        .select({
            id: popup.id,
            Title: popup.Title,
            TitleAr: popup.TitleAr,
            TitleFr: popup.TitleFr,
            description: popup.description,
            descriptionAr: popup.descriptionAr,
            descriptionFr: popup.descriptionFr,
            image: popup.image,
            imageAr: popup.imageAr,
            imageFr: popup.imageFr,
            type: popup.type,
            linkType: popup.linkType,
            link: popup.link,
            subcategoryId: popup.subcategoryId,
            subcategoryName: subcategories.name,
            subcategoryNameAr: subcategories.nameAr,
            foodId: popup.foodId,
            productId: popup.foodId,
            foodName: food.name,
            foodNameAr: food.nameAr,
            foodImage: food.image,
            discountId: popup.discountId,
            discountName: discounts.name,
            discountNameAr: discounts.nameAr,
            startDate: popup.startDate,
            endDate: popup.endDate,
        })
        .from(popup)
        .leftJoin(subcategories, eq(popup.subcategoryId, subcategories.id))
        .leftJoin(food, eq(popup.foodId, food.id))
        .leftJoin(discounts, eq(popup.discountId, discounts.id))
        .where(
            and(
                eq(popup.status, "active"),
                lte(popup.startDate, now),
                gte(popup.endDate, now)
            )
        );

    return SuccessResponse(res, { message: "Get active popups success", data: activePopups });
};

// ─── Get Active Popup By ID ───
export const getPopupById = async (req: Request, res: Response) => {
    const { id } = req.params;

    const result = await db
        .select({
            id: popup.id,
            Title: popup.Title,
            TitleAr: popup.TitleAr,
            TitleFr: popup.TitleFr,
            description: popup.description,
            descriptionAr: popup.descriptionAr,
            descriptionFr: popup.descriptionFr,
            image: popup.image,
            imageAr: popup.imageAr,
            imageFr: popup.imageFr,
            type: popup.type,
            linkType: popup.linkType,
            link: popup.link,
            subcategoryId: popup.subcategoryId,
            subcategoryName: subcategories.name,
            subcategoryNameAr: subcategories.nameAr,
            foodId: popup.foodId,
            productId: popup.foodId,
            foodName: food.name,
            foodNameAr: food.nameAr,
            foodImage: food.image,
            discountId: popup.discountId,
            discountName: discounts.name,
            discountNameAr: discounts.nameAr,
            startDate: popup.startDate,
            endDate: popup.endDate,
        })
        .from(popup)
        .leftJoin(subcategories, eq(popup.subcategoryId, subcategories.id))
        .leftJoin(food, eq(popup.foodId, food.id))
        .leftJoin(discounts, eq(popup.discountId, discounts.id))
        .where(
            and(
                eq(popup.id, id),
                eq(popup.status, "active")
            )
        )
        .limit(1);

    if (!result[0]) {
        throw new NotFound("Popup not found");
    }

    return SuccessResponse(res, { message: "Get popup by id success", data: result[0] });
};
