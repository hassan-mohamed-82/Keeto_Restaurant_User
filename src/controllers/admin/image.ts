import { Request, Response } from "express";
import { db } from "../../models/connection";
import { images, subcategories, food, discounts , branches } from "../../models/schema";
import { eq, and, isNull, or } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { NotFound } from "../../Errors/NotFound";
import { BadRequest } from "../../Errors/BadRequest";
import { v4 as uuidv4 } from "uuid";
import { saveBase64Image, handleImageUpdate } from "../../utils/handleImages";
import { validateTargetEntity } from "./popup";

export const getAllActiveBranches = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }
    const [branch] = await db.select({
        id: branches.id,
        name: branches.name,
        nameAr: branches.nameAr,
        nameFr: branches.nameFr,
    })
    .from(branches)
    .where(and(eq(branches.restaurantId, restaurantId), eq(branches.status, "active")))
    return SuccessResponse(res, { data: branch , message: "Branches fetched successfully"}, 200);
}

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
        discountId,
        branchId
    } = req.body;
    
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const resolvedBranchId = branchId || null;

    // 💡 تصحيح: التحقق فقط في حال تم إرسال branchId حقيقي
    if (resolvedBranchId) {
        const [branch] = await db
            .select({ id: branches.id })
            .from(branches)
            .where(and(eq(branches.id, resolvedBranchId), eq(branches.restaurantId, restaurantId)))
            .limit(1);

        if (!branch) {
            throw new NotFound("Branch not found or does not belong to this restaurant");
        }
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
        branchId: resolvedBranchId,
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
            branchId: resolvedBranchId,
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

    const { branchId } = req.query;

    const conditions = [eq(images.restaurantid, restaurantId)];

    // 💡 التصفية بالفرع المحجوز أو الصور العامة التي لا تتبع فرع محدد (NULL)
    if (branchId && typeof branchId === "string" && branchId.trim() !== "") {
        conditions.push(
            or(
                eq(images.branchId, branchId.trim()),
                isNull(images.branchId)
            )!
        );
    }

    const imageList = await db
        .select({
            id: images.id,
            restaurantid: images.restaurantid,
            branchId: images.branchId,
            branchName: branches.name,
            branchNameAr: branches.nameAr,
            branchNameFr: branches.nameFr,
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
        .leftJoin(branches, eq(images.branchId, branches.id))
        .leftJoin(subcategories, eq(images.subcategoryId, subcategories.id))
        .leftJoin(food, eq(images.foodId, food.id))
        .leftJoin(discounts, eq(images.discountId, discounts.id))
        .where(and(...conditions));

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
            branchId: images.branchId,
            branchName: branches.name,
            branchNameAr: branches.nameAr,
            branchNameFr: branches.nameFr,
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
        .leftJoin(branches, eq(images.branchId, branches.id))
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
        discountId,
        branchId,
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

    // 💡 تصحيح: الحفاظ على الفرع القديم إن لم يُرسل جديد
    const resolvedBranchId = branchId !== undefined ? branchId : existing.branchId;
    if (branchId) {
        const [branch] = await db
            .select({ id: branches.id })
            .from(branches)
            .where(and(eq(branches.id, branchId), eq(branches.restaurantId, restaurantId)))
            .limit(1);

        if (!branch) {
            throw new NotFound("Branch not found or does not belong to this restaurant");
        }
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

    if (branchId !== undefined) {
        updateData.branchId = resolvedBranchId;
    }

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
