import { Request, Response } from "express";
import { db } from "../../models/connection";
import { images, subcategories, food, discounts } from "../../models/schema";
import { eq, and } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { NotFound } from "../../Errors/NotFound";
import { BadRequest } from "../../Errors/BadRequest";
import { v4 as uuidv4 } from "uuid";
import { saveBase64Image, handleImageUpdate } from "../../utils/handleImages";
import { validateTargetEntity } from "./popup";

export const createImage = async (req: Request, res: Response) => {
    const {
        img,
        periorty = 0,
        linkType = "link",
        link,
        subcategoryId,
        categoryId,
        foodId,
        productId,
        discountId
    } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const resolvedFoodId = foodId || productId || null;
    const resolvedSubcategoryId = subcategoryId || categoryId || null;
    const resolvedDiscountId = discountId || null;
    const resolvedLink = link || null;

    await validateTargetEntity(restaurantId, linkType, resolvedSubcategoryId, resolvedFoodId, resolvedDiscountId);

    const result = await saveBase64Image(img, req, "images");
    if (!result) {
        throw new BadRequest("Image is required.");
    }

    const id = uuidv4();
    await db.insert(images).values({
        id,
        restaurantid: restaurantId,
        img: result,
        periorty: Number(periorty) || 0,
        linkType: (linkType as any) || "link",
        link: linkType === "link" ? resolvedLink : null,
        subcategoryId: linkType === "subcategory" ? resolvedSubcategoryId : null,
        foodId: linkType === "product" ? resolvedFoodId : null,
        discountId: linkType === "discount" ? resolvedDiscountId : null,
    });

    return SuccessResponse(res, {
        message: "Image banner created successfully",
        data: {
            id,
            img: result,
            periorty: Number(periorty) || 0,
            linkType,
            link: linkType === "link" ? resolvedLink : null,
            subcategoryId: linkType === "subcategory" ? resolvedSubcategoryId : null,
            foodId: linkType === "product" ? resolvedFoodId : null,
            productId: linkType === "product" ? resolvedFoodId : null,
            discountId: linkType === "discount" ? resolvedDiscountId : null,
        }
    }, 201);
};

export const getAllImages = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const imageList = await db
        .select({
            id: images.id,
            restaurantid: images.restaurantid,
            img: images.img,
            periorty: images.periorty,
            linkType: images.linkType,
            link: images.link,
            subcategoryId: images.subcategoryId,
            subcategoryName: subcategories.name,
            subcategoryNameAr: subcategories.nameAr,
            subcategoryNameFr: subcategories.nameFr,
            subcategoryImage: subcategories.image,
            foodId: images.foodId,
            productId: images.foodId,
            foodName: food.name,
            foodNameAr: food.nameAr,
            foodNameFr: food.nameFr,
            foodImage: food.image,
            discountId: images.discountId,
            discountName: discounts.name,
            discountNameAr: discounts.nameAr,
            discountNameFr: discounts.nameFr,
            createdAt: images.createdAt,
            updatedAt: images.updatedAt,
        })
        .from(images)
        .leftJoin(subcategories, eq(images.subcategoryId, subcategories.id))
        .leftJoin(food, eq(images.foodId, food.id))
        .leftJoin(discounts, eq(images.discountId, discounts.id))
        .where(eq(images.restaurantid, restaurantId));

    return SuccessResponse(res, {
        message: "Images fetched successfully",
        data: imageList,
    }, 200);
};

export const getImageById = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const [image] = await db
        .select({
            id: images.id,
            restaurantid: images.restaurantid,
            img: images.img,
            periorty: images.periorty,
            linkType: images.linkType,
            link: images.link,
            subcategoryId: images.subcategoryId,
            subcategoryName: subcategories.name,
            subcategoryNameAr: subcategories.nameAr,
            subcategoryNameFr: subcategories.nameFr,
            subcategoryImage: subcategories.image,
            foodId: images.foodId,
            productId: images.foodId,
            foodName: food.name,
            foodNameAr: food.nameAr,
            foodNameFr: food.nameFr,
            foodImage: food.image,
            discountId: images.discountId,
            discountName: discounts.name,
            discountNameAr: discounts.nameAr,
            discountNameFr: discounts.nameFr,
            createdAt: images.createdAt,
            updatedAt: images.updatedAt,
        })
        .from(images)
        .leftJoin(subcategories, eq(images.subcategoryId, subcategories.id))
        .leftJoin(food, eq(images.foodId, food.id))
        .leftJoin(discounts, eq(images.discountId, discounts.id))
        .where(and(eq(images.id, id), eq(images.restaurantid, restaurantId)))
        .limit(1);

    if (!image) {
        throw new NotFound("Image not found");
    }

    return SuccessResponse(res, {
        message: "Image fetched successfully",
        data: image,
    }, 200);
};

export const deleteImage = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }
    const [image] = await db.select().from(images).where(eq(images.id, id)).limit(1);
    if (!image) {
        throw new NotFound("Image not found");
    }
    if (image.restaurantid !== restaurantId) {
        throw new BadRequest("You are not authorized to delete this image");
    }
    await db.delete(images).where(eq(images.id, id));
    return SuccessResponse(res, {
        message: "Image deleted successfully",
    }, 200);
};

export const updateImage = async (req: Request, res: Response) => {
    const { id } = req.params;
    const {
        img,
        periorty,
        linkType,
        link,
        subcategoryId,
        categoryId,
        foodId,
        productId,
        discountId
    } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const [existing] = await db.select().from(images).where(eq(images.id, id)).limit(1);
    if (!existing) {
        throw new NotFound("Image not found");
    }
    if (existing.restaurantid !== restaurantId) {
        throw new BadRequest("You are not authorized to update this image");
    }

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

    if (img) {
        const updatedUrl = await handleImageUpdate(req, existing.img, img, "images");
        if (updatedUrl) updateData.img = updatedUrl;
    }

    if (periorty !== undefined) {
        updateData.periorty = Number(periorty) || 0;
    }

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

    await db.update(images).set(updateData).where(eq(images.id, id));

    return SuccessResponse(res, {
        message: "Image updated successfully",
        data: updateData,
    }, 200);
};
