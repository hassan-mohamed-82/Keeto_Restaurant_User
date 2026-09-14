"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateImage = exports.deleteImage = exports.getImageById = exports.getAllImages = exports.createImage = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const NotFound_1 = require("../../Errors/NotFound");
const BadRequest_1 = require("../../Errors/BadRequest");
const uuid_1 = require("uuid");
const handleImages_1 = require("../../utils/handleImages");
const popup_1 = require("./popup");
const createImage = async (req, res) => {
    const { img, periorty = 0, linkType = "link", link, subcategoryId, categoryId, foodId, productId, discountId } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const resolvedFoodId = foodId || productId || null;
    const resolvedSubcategoryId = subcategoryId || categoryId || null;
    const resolvedDiscountId = discountId || null;
    const resolvedLink = link || null;
    await (0, popup_1.validateTargetEntity)(restaurantId, linkType, resolvedSubcategoryId, resolvedFoodId, resolvedDiscountId);
    const result = await (0, handleImages_1.saveBase64Image)(img, req, "images");
    if (!result) {
        throw new BadRequest_1.BadRequest("Image is required.");
    }
    const id = (0, uuid_1.v4)();
    await connection_1.db.insert(schema_1.sliders).values({
        id,
        restaurantid: restaurantId,
        img: result,
        periorty: Number(periorty) || 0,
        linkType: linkType || "link",
        link: linkType === "link" ? resolvedLink : null,
        subcategoryId: linkType === "subcategory" ? resolvedSubcategoryId : null,
        foodId: linkType === "product" ? resolvedFoodId : null,
        discountId: linkType === "discount" ? resolvedDiscountId : null,
    });
    return (0, response_1.SuccessResponse)(res, {
        message: "Slider created successfully",
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
exports.createImage = createImage;
const getAllImages = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const imageList = await connection_1.db
        .select({
        id: schema_1.sliders.id,
        restaurantid: schema_1.sliders.restaurantid,
        img: schema_1.sliders.img,
        periorty: schema_1.sliders.periorty,
        linkType: schema_1.sliders.linkType,
        link: schema_1.sliders.link,
        subcategoryId: schema_1.sliders.subcategoryId,
        subcategoryName: schema_1.subcategories.name,
        subcategoryNameAr: schema_1.subcategories.nameAr,
        subcategoryNameFr: schema_1.subcategories.nameFr,
        subcategoryImage: schema_1.subcategories.image,
        foodId: schema_1.sliders.foodId,
        productId: schema_1.sliders.foodId,
        foodName: schema_1.food.name,
        foodNameAr: schema_1.food.nameAr,
        foodNameFr: schema_1.food.nameFr,
        foodImage: schema_1.food.image,
        discountId: schema_1.sliders.discountId,
        discountName: schema_1.discounts.name,
        discountNameAr: schema_1.discounts.nameAr,
        discountNameFr: schema_1.discounts.nameFr,
        discountType: schema_1.discounts.discountType,
        discountValue: schema_1.discounts.discountValue,
        createdAt: schema_1.sliders.createdAt,
        updatedAt: schema_1.sliders.updatedAt,
    })
        .from(schema_1.sliders)
        .leftJoin(schema_1.subcategories, (0, drizzle_orm_1.eq)(schema_1.sliders.subcategoryId, schema_1.subcategories.id))
        .leftJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.sliders.foodId, schema_1.food.id))
        .leftJoin(schema_1.discounts, (0, drizzle_orm_1.eq)(schema_1.sliders.discountId, schema_1.discounts.id))
        .where((0, drizzle_orm_1.eq)(schema_1.sliders.restaurantid, restaurantId));
    return (0, response_1.SuccessResponse)(res, {
        message: "Sliders fetched successfully",
        data: imageList,
    }, 200);
};
exports.getAllImages = getAllImages;
const getImageById = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const [image] = await connection_1.db
        .select({
        id: schema_1.sliders.id,
        restaurantid: schema_1.sliders.restaurantid,
        img: schema_1.sliders.img,
        periorty: schema_1.sliders.periorty,
        linkType: schema_1.sliders.linkType,
        link: schema_1.sliders.link,
        subcategoryId: schema_1.sliders.subcategoryId,
        subcategoryName: schema_1.subcategories.name,
        subcategoryNameAr: schema_1.subcategories.nameAr,
        subcategoryNameFr: schema_1.subcategories.nameFr,
        subcategoryImage: schema_1.subcategories.image,
        foodId: schema_1.sliders.foodId,
        productId: schema_1.sliders.foodId,
        foodName: schema_1.food.name,
        foodNameAr: schema_1.food.nameAr,
        foodNameFr: schema_1.food.nameFr,
        foodImage: schema_1.food.image,
        discountId: schema_1.sliders.discountId,
        discountName: schema_1.discounts.name,
        discountNameAr: schema_1.discounts.nameAr,
        discountNameFr: schema_1.discounts.nameFr,
        discountType: schema_1.discounts.discountType,
        discountValue: schema_1.discounts.discountValue,
        createdAt: schema_1.sliders.createdAt,
        updatedAt: schema_1.sliders.updatedAt,
    })
        .from(schema_1.sliders)
        .leftJoin(schema_1.subcategories, (0, drizzle_orm_1.eq)(schema_1.sliders.subcategoryId, schema_1.subcategories.id))
        .leftJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.sliders.foodId, schema_1.food.id))
        .leftJoin(schema_1.discounts, (0, drizzle_orm_1.eq)(schema_1.sliders.discountId, schema_1.discounts.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.sliders.id, id), (0, drizzle_orm_1.eq)(schema_1.sliders.restaurantid, restaurantId)))
        .limit(1);
    if (!image) {
        throw new NotFound_1.NotFound("Slider not found");
    }
    return (0, response_1.SuccessResponse)(res, {
        message: "Slider fetched successfully",
        data: image,
    }, 200);
};
exports.getImageById = getImageById;
const deleteImage = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const [image] = await connection_1.db.select().from(schema_1.sliders).where((0, drizzle_orm_1.eq)(schema_1.sliders.id, id)).limit(1);
    if (!image) {
        throw new NotFound_1.NotFound("Slider not found");
    }
    if (image.restaurantid !== restaurantId) {
        throw new BadRequest_1.BadRequest("You are not authorized to delete this slider");
    }
    await connection_1.db.delete(schema_1.sliders).where((0, drizzle_orm_1.eq)(schema_1.sliders.id, id));
    return (0, response_1.SuccessResponse)(res, {
        message: "Slider deleted successfully",
    }, 200);
};
exports.deleteImage = deleteImage;
const updateImage = async (req, res) => {
    const { id } = req.params;
    const { img, periorty, linkType, link, subcategoryId, categoryId, foodId, productId, discountId } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const [existing] = await connection_1.db.select().from(schema_1.sliders).where((0, drizzle_orm_1.eq)(schema_1.sliders.id, id)).limit(1);
    if (!existing) {
        throw new NotFound_1.NotFound("Slider not found");
    }
    if (existing.restaurantid !== restaurantId) {
        throw new BadRequest_1.BadRequest("You are not authorized to update this slider");
    }
    const effectiveLinkType = linkType !== undefined ? linkType : existing.linkType;
    const resolvedFoodId = foodId !== undefined ? foodId : (productId !== undefined ? productId : existing.foodId);
    const resolvedSubcategoryId = subcategoryId !== undefined ? subcategoryId : (categoryId !== undefined ? categoryId : existing.subcategoryId);
    const resolvedDiscountId = discountId !== undefined ? discountId : existing.discountId;
    await (0, popup_1.validateTargetEntity)(restaurantId, effectiveLinkType, effectiveLinkType === "subcategory" ? resolvedSubcategoryId : null, effectiveLinkType === "product" ? resolvedFoodId : null, effectiveLinkType === "discount" ? resolvedDiscountId : null);
    const updateData = { updatedAt: new Date() };
    if (img) {
        const updatedUrl = await (0, handleImages_1.handleImageUpdate)(req, existing.img, img, "sliders");
        if (updatedUrl)
            updateData.img = updatedUrl;
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
        }
        else if (linkType === "subcategory") {
            updateData.subcategoryId = resolvedSubcategoryId;
            updateData.link = null;
            updateData.foodId = null;
            updateData.discountId = null;
        }
        else if (linkType === "product") {
            updateData.foodId = resolvedFoodId;
            updateData.link = null;
            updateData.subcategoryId = null;
            updateData.discountId = null;
        }
        else if (linkType === "discount") {
            updateData.discountId = resolvedDiscountId;
            updateData.link = null;
            updateData.subcategoryId = null;
            updateData.foodId = null;
        }
    }
    else {
        if (link !== undefined)
            updateData.link = link;
        if (subcategoryId !== undefined || categoryId !== undefined)
            updateData.subcategoryId = resolvedSubcategoryId;
        if (foodId !== undefined || productId !== undefined)
            updateData.foodId = resolvedFoodId;
        if (discountId !== undefined)
            updateData.discountId = discountId;
    }
    await connection_1.db.update(schema_1.sliders).set(updateData).where((0, drizzle_orm_1.eq)(schema_1.sliders.id, id));
    return (0, response_1.SuccessResponse)(res, {
        message: "Slider updated successfully",
        data: updateData,
    }, 200);
};
exports.updateImage = updateImage;
