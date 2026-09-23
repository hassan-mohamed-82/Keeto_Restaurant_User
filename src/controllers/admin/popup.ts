import { Request, Response } from "express";
import { db } from "../../models/connection";
import { popup, subcategories, food, discounts, discountRestaurants } from "../../models/schema";
import { eq, and, or, sql } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";
import { LINK_TYPES } from "../../types/constant";

// Helper to validate target entity
export const validateTargetEntity = async (
    restaurantId: string,
    linkType?: string,
    subcategoryId?: string | null,
    foodId?: string | null,
    discountId?: string | null
) => {
    if (subcategoryId) {
        const [sub] = await db
            .select({ id: subcategories.id, restaurantId: subcategories.restaurantId })
            .from(subcategories)
            .where(eq(subcategories.id, subcategoryId))
            .limit(1);
        if (!sub) throw new NotFound("Subcategory not found");
        if (sub.restaurantId && sub.restaurantId !== restaurantId) {
            throw new BadRequest("Subcategory does not belong to this restaurant");
        }
    }

    if (foodId) {
        const [item] = await db.select({ id: food.id, restaurantid: food.restaurantid }).from(food).where(eq(food.id, foodId)).limit(1);
        if (!item) throw new NotFound("Product not found");
        if (item.restaurantid !== restaurantId) throw new BadRequest("Product does not belong to this restaurant");
    }

    if (discountId) {
        const [disc] = await db.select({ id: discounts.id }).from(discounts).where(eq(discounts.id, discountId)).limit(1);
        if (!disc) throw new NotFound("Discount not found");
    }
};

// ==========================================
// 0. Get Link Target Options (Constant types + subcategories + products + discounts)
// ==========================================
export const getLinkTargetOptions = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const [subcategoriesList, productsList, discountsList] = await Promise.all([
        db
            .select({
                id: subcategories.id,
                name: subcategories.name,
                nameAr: subcategories.nameAr,
                nameFr: subcategories.nameFr,
                image: subcategories.image,
                categoryId: subcategories.categoryId,
            })
            .from(subcategories)
            .where(
                and(
                    eq(subcategories.status, "active"),
                    or(
                        eq(subcategories.restaurantId, restaurantId),
                        sql`${subcategories.restaurantId} IS NULL`
                    )
                )
            ),
        db
            .select({
                id: food.id,
                name: food.name,
                nameAr: food.nameAr,
                nameFr: food.nameFr,
                image: food.image,
                price: food.price,
                categoryId: food.categoryid,
                subcategoryId: food.subcategoryid,
            })
            .from(food)
            .where(
                and(
                    eq(food.restaurantid, restaurantId),
                    eq(food.status, "active"),
                    sql`${food.deletedAt} IS NULL`
                )
            ),
        db
            .select({
                id: discounts.id,
                name: discounts.name,
                nameAr: discounts.nameAr,
                nameFr: discounts.nameFr,
                minOrderAmount: discounts.minOrderAmount,
                startDate: discounts.startDate,
                endDate: discounts.endDate,
                isGlobal: discounts.isGlobal,
                logo: discounts.logo,
            })
            .from(discounts)
            .leftJoin(discountRestaurants, eq(discounts.id, discountRestaurants.discountId))
            .where(
                and(
                    eq(discounts.isActive, true),
                    or(
                        eq(discounts.isGlobal, true),
                        eq(discountRestaurants.restaurantId, restaurantId)
                    )
                )
            )
    ]);

    return SuccessResponse(res, {
        message: "Link target options fetched successfully",
        data: {
            types: LINK_TYPES,
            subcategories: subcategoriesList,
            products: productsList,
            discounts: discountsList,
        }
    });
};

// ==========================================
// 1. Create Popup
// ==========================================
export const createPopup = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const {
        Title, TitleAr, TitleFr,
        description, descriptionAr, descriptionFr,
        image, imageAr, imageFr,
        type, status,
        linkType = "link",
        link,
        subcategoryId,
        categoryId,
        foodId,
        productId,
        discountId,
        startDate, endDate
    } = req.body;

    if (!Title) throw new BadRequest("Popup title is required");
    if (!startDate || !endDate) throw new BadRequest("Start date and end date are required");

    const resolvedFoodId = foodId || productId || null;
    const resolvedSubcategoryId = subcategoryId || categoryId || null;
    const resolvedDiscountId = discountId || null;
    const resolvedLink = link || null;

    await validateTargetEntity(restaurantId, linkType, resolvedSubcategoryId, resolvedFoodId, resolvedDiscountId);

    const id = uuidv4();

    await db.insert(popup).values({
        id,
        restaurantId,
        Title,
        TitleAr: TitleAr || null,
        TitleFr: TitleFr || null,
        description: description || null,
        descriptionAr: descriptionAr || null,
        descriptionFr: descriptionFr || null,
        image: image || null,
        imageAr: imageAr || null,
        imageFr: imageFr || null,
        type: type || "mykeeto_app",
        linkType: (linkType as any) || "link",
        link: linkType === "link" ? resolvedLink : null,
        subcategoryId: linkType === "subcategory" ? resolvedSubcategoryId : null,
        foodId: linkType === "product" ? resolvedFoodId : null,
        discountId: linkType === "discount" ? resolvedDiscountId : null,
        status: status || "active",
        startDate: new Date(startDate),
        endDate: new Date(endDate),
    });

    return SuccessResponse(res, { message: "Popup created successfully", data: { id } }, 201);
};

// ==========================================
// 2. Get All Popups (for this restaurant)
// ==========================================
export const getAllPopups = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const allPopups = await db
        .select({
            id: popup.id,
            restaurantId: popup.restaurantId,
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
            subcategoryNameFr: subcategories.nameFr,
            subcategoryImage: subcategories.image,
            foodId: popup.foodId,
            productId: popup.foodId,
            foodName: food.name,
            foodNameAr: food.nameAr,
            foodNameFr: food.nameFr,
            foodImage: food.image,
            discountId: popup.discountId,
            discountName: discounts.name,
            discountNameAr: discounts.nameAr,
            discountNameFr: discounts.nameFr,
            status: popup.status,
            startDate: popup.startDate,
            endDate: popup.endDate,
            createdAt: popup.createdAt,
            updatedAt: popup.updatedAt,
        })
        .from(popup)
        .leftJoin(subcategories, eq(popup.subcategoryId, subcategories.id))
        .leftJoin(food, eq(popup.foodId, food.id))
        .leftJoin(discounts, eq(popup.discountId, discounts.id))
        .where(eq(popup.restaurantId, restaurantId));

    return SuccessResponse(res, { message: "Get all popups success", data: allPopups });
};

// ==========================================
// 3. Get Popup by ID
// ==========================================
export const getPopupById = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const [existing] = await db
        .select({
            id: popup.id,
            restaurantId: popup.restaurantId,
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
            subcategoryNameFr: subcategories.nameFr,
            subcategoryImage: subcategories.image,
            foodId: popup.foodId,
            productId: popup.foodId,
            foodName: food.name,
            foodNameAr: food.nameAr,
            foodNameFr: food.nameFr,
            foodImage: food.image,
            discountId: popup.discountId,
            discountName: discounts.name,
            discountNameAr: discounts.nameAr,
            discountNameFr: discounts.nameFr,
            status: popup.status,
            startDate: popup.startDate,
            endDate: popup.endDate,
            createdAt: popup.createdAt,
            updatedAt: popup.updatedAt,
        })
        .from(popup)
        .leftJoin(subcategories, eq(popup.subcategoryId, subcategories.id))
        .leftJoin(food, eq(popup.foodId, food.id))
        .leftJoin(discounts, eq(popup.discountId, discounts.id))
        .where(and(eq(popup.id, id), eq(popup.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) throw new NotFound("Popup not found");

    return SuccessResponse(res, { message: "Get popup success", data: existing });
};

// ==========================================
// 4. Update Popup
// ==========================================
export const updatePopup = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const [existing] = await db
        .select()
        .from(popup)
        .where(and(eq(popup.id, id), eq(popup.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) throw new NotFound("Popup not found");

    const {
        Title, TitleAr, TitleFr,
        description, descriptionAr, descriptionFr,
        image, imageAr, imageFr,
        type, status,
        linkType,
        link,
        subcategoryId,
        categoryId,
        foodId,
        productId,
        discountId,
        startDate, endDate
    } = req.body;

    const effectiveLinkType = linkType !== undefined ? linkType : existing.linkType;
    const resolvedFoodId = foodId !== undefined ? foodId : (productId !== undefined ? productId : existing.foodId);
    const resolvedSubcategoryId = subcategoryId !== undefined ? subcategoryId : (categoryId !== undefined ? categoryId : existing.subcategoryId);
    const resolvedDiscountId = discountId !== undefined ? discountId : existing.discountId;

    await validateTargetEntity(
        restaurantId,
        effectiveLinkType,
        effectiveLinkType === "subcategory" ? resolvedSubcategoryId : null,
        effectiveLinkType === "product" ? resolvedFoodId : null,
        effectiveLinkType === "discount" ? resolvedDiscountId : null
    );

    const updateData: any = { updatedAt: new Date() };

    if (Title !== undefined) updateData.Title = Title;
    if (TitleAr !== undefined) updateData.TitleAr = TitleAr;
    if (TitleFr !== undefined) updateData.TitleFr = TitleFr;
    if (description !== undefined) updateData.description = description;
    if (descriptionAr !== undefined) updateData.descriptionAr = descriptionAr;
    if (descriptionFr !== undefined) updateData.descriptionFr = descriptionFr;
    if (image !== undefined) updateData.image = image;
    if (imageAr !== undefined) updateData.imageAr = imageAr;
    if (imageFr !== undefined) updateData.imageFr = imageFr;
    if (type !== undefined) updateData.type = type;
    if (status !== undefined) updateData.status = status;
    if (startDate !== undefined) updateData.startDate = new Date(startDate);
    if (endDate !== undefined) updateData.endDate = new Date(endDate);

    if (linkType !== undefined) {
        updateData.linkType = linkType;
        if (linkType === "link") {
            updateData.link = link !== undefined ? link : existing.link;
            updateData.subcategoryId = null;
            updateData.foodId = null;
            updateData.discountId = null;
        } else if (linkType === "subcategory") {
            updateData.subcategoryId = resolvedSubcategoryId;
            updateData.link = null;
            updateData.foodId = null;
            updateData.discountId = null;
        } else if (linkType === "product") {
            updateData.foodId = resolvedFoodId;
            updateData.link = null;
            updateData.subcategoryId = null;
            updateData.discountId = null;
        } else if (linkType === "discount") {
            updateData.discountId = resolvedDiscountId;
            updateData.link = null;
            updateData.subcategoryId = null;
            updateData.foodId = null;
        }
    } else {
        if (link !== undefined) updateData.link = link;
        if (subcategoryId !== undefined || categoryId !== undefined) updateData.subcategoryId = resolvedSubcategoryId;
        if (foodId !== undefined || productId !== undefined) updateData.foodId = resolvedFoodId;
        if (discountId !== undefined) updateData.discountId = discountId;
    }

    await db.update(popup).set(updateData).where(eq(popup.id, id));

    return SuccessResponse(res, { message: "Popup updated successfully" });
};

// ==========================================
// 5. Delete Popup
// ==========================================
export const deletePopup = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const [existing] = await db
        .select()
        .from(popup)
        .where(and(eq(popup.id, id), eq(popup.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) throw new NotFound("Popup not found");

    await db.delete(popup).where(eq(popup.id, id));

    return SuccessResponse(res, { message: "Popup deleted successfully" });
};

// ==========================================
// 6. Toggle Popup Status
// ==========================================
export const togglePopupStatus = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const [existing] = await db
        .select()
        .from(popup)
        .where(and(eq(popup.id, id), eq(popup.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) throw new NotFound("Popup not found");

    const newStatus = existing.status === "active" ? "inactive" : "active";

    await db.update(popup)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(popup.id, id));

    return SuccessResponse(res, {
        message: `Popup ${newStatus === "active" ? "activated" : "deactivated"} successfully`,
        data: { status: newStatus }
    });
};
