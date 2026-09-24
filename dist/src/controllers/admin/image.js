"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateImage = exports.deleteImage = exports.getImageById = exports.getAllImages = exports.createImage = exports.getAllActiveBranches = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const NotFound_1 = require("../../Errors/NotFound");
const BadRequest_1 = require("../../Errors/BadRequest");
const uuid_1 = require("uuid");
const handleImages_1 = require("../../utils/handleImages");
const popup_1 = require("./popup");
const getAllActiveBranches = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const [branch] = await connection_1.db.select({
        id: schema_1.branches.id,
        name: schema_1.branches.name,
        nameAr: schema_1.branches.nameAr,
        nameFr: schema_1.branches.nameFr,
    })
        .from(schema_1.branches)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.branches.status, "active")));
    return (0, response_1.SuccessResponse)(res, { data: branch, message: "Branches fetched successfully" }, 200);
};
exports.getAllActiveBranches = getAllActiveBranches;
const createImage = async (req, res) => {
    const { img, periorty = 0, linkType = "link", link, subcategoryId, categoryId, foodId, productId, discountId, branchId } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const resolvedBranchId = branchId || null;
    // 💡 تصحيح: التحقق فقط في حال تم إرسال branchId حقيقي
    if (resolvedBranchId) {
        const [branch] = await connection_1.db
            .select({ id: schema_1.branches.id })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.id, resolvedBranchId), (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId)))
            .limit(1);
        if (!branch) {
            throw new NotFound_1.NotFound("Branch not found or does not belong to this restaurant");
        }
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
    await connection_1.db.insert(schema_1.images).values({
        id,
        restaurantid: restaurantId,
        branchId: resolvedBranchId,
        img: result,
        periorty: Number(periorty) || 0,
        linkType: linkType || "link",
        link: linkType === "link" ? resolvedLink : null,
        subcategoryId: linkType === "subcategory" ? resolvedSubcategoryId : null,
        foodId: linkType === "product" ? resolvedFoodId : null,
        discountId: linkType === "discount" ? resolvedDiscountId : null,
    });
    return (0, response_1.SuccessResponse)(res, {
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
exports.createImage = createImage;
const getAllImages = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { branchId } = req.query;
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.images.restaurantid, restaurantId)];
    // 💡 التصفية بالفرع المحجوز أو الصور العامة التي لا تتبع فرع محدد (NULL)
    if (branchId && typeof branchId === "string" && branchId.trim() !== "") {
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.images.branchId, branchId.trim()), (0, drizzle_orm_1.isNull)(schema_1.images.branchId)));
    }
    const imageList = await connection_1.db
        .select({
        id: schema_1.images.id,
        restaurantid: schema_1.images.restaurantid,
        branchId: schema_1.images.branchId,
        branchName: schema_1.branches.name,
        branchNameAr: schema_1.branches.nameAr,
        branchNameFr: schema_1.branches.nameFr,
        img: schema_1.images.img,
        periorty: schema_1.images.periorty,
        linkType: schema_1.images.linkType,
        link: schema_1.images.link,
        subcategoryId: schema_1.images.subcategoryId,
        subcategoryName: schema_1.subcategories.name,
        subcategoryNameAr: schema_1.subcategories.nameAr,
        subcategoryNameFr: schema_1.subcategories.nameFr,
        subcategoryImage: schema_1.subcategories.image,
        foodId: schema_1.images.foodId,
        productId: schema_1.images.foodId,
        foodName: schema_1.food.name,
        foodNameAr: schema_1.food.nameAr,
        foodNameFr: schema_1.food.nameFr,
        foodImage: schema_1.food.image,
        discountId: schema_1.images.discountId,
        discountName: schema_1.discounts.name,
        discountNameAr: schema_1.discounts.nameAr,
        discountNameFr: schema_1.discounts.nameFr,
        createdAt: schema_1.images.createdAt,
        updatedAt: schema_1.images.updatedAt,
    })
        .from(schema_1.images)
        .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.images.branchId, schema_1.branches.id))
        .leftJoin(schema_1.subcategories, (0, drizzle_orm_1.eq)(schema_1.images.subcategoryId, schema_1.subcategories.id))
        .leftJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.images.foodId, schema_1.food.id))
        .leftJoin(schema_1.discounts, (0, drizzle_orm_1.eq)(schema_1.images.discountId, schema_1.discounts.id))
        .where((0, drizzle_orm_1.and)(...conditions));
    return (0, response_1.SuccessResponse)(res, {
        message: "Images fetched successfully",
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
        id: schema_1.images.id,
        restaurantid: schema_1.images.restaurantid,
        branchId: schema_1.images.branchId,
        branchName: schema_1.branches.name,
        branchNameAr: schema_1.branches.nameAr,
        branchNameFr: schema_1.branches.nameFr,
        img: schema_1.images.img,
        periorty: schema_1.images.periorty,
        linkType: schema_1.images.linkType,
        link: schema_1.images.link,
        subcategoryId: schema_1.images.subcategoryId,
        subcategoryName: schema_1.subcategories.name,
        subcategoryNameAr: schema_1.subcategories.nameAr,
        subcategoryNameFr: schema_1.subcategories.nameFr,
        subcategoryImage: schema_1.subcategories.image,
        foodId: schema_1.images.foodId,
        productId: schema_1.images.foodId,
        foodName: schema_1.food.name,
        foodNameAr: schema_1.food.nameAr,
        foodNameFr: schema_1.food.nameFr,
        foodImage: schema_1.food.image,
        discountId: schema_1.images.discountId,
        discountName: schema_1.discounts.name,
        discountNameAr: schema_1.discounts.nameAr,
        discountNameFr: schema_1.discounts.nameFr,
        createdAt: schema_1.images.createdAt,
        updatedAt: schema_1.images.updatedAt,
    })
        .from(schema_1.images)
        .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.images.branchId, schema_1.branches.id))
        .leftJoin(schema_1.subcategories, (0, drizzle_orm_1.eq)(schema_1.images.subcategoryId, schema_1.subcategories.id))
        .leftJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.images.foodId, schema_1.food.id))
        .leftJoin(schema_1.discounts, (0, drizzle_orm_1.eq)(schema_1.images.discountId, schema_1.discounts.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.images.id, id), (0, drizzle_orm_1.eq)(schema_1.images.restaurantid, restaurantId)))
        .limit(1);
    if (!image) {
        throw new NotFound_1.NotFound("Image not found");
    }
    return (0, response_1.SuccessResponse)(res, {
        message: "Image fetched successfully",
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
    const [image] = await connection_1.db.select().from(schema_1.images).where((0, drizzle_orm_1.eq)(schema_1.images.id, id)).limit(1);
    if (!image) {
        throw new NotFound_1.NotFound("Image not found");
    }
    if (image.restaurantid !== restaurantId) {
        throw new BadRequest_1.BadRequest("You are not authorized to delete this image");
    }
    await connection_1.db.delete(schema_1.images).where((0, drizzle_orm_1.eq)(schema_1.images.id, id));
    return (0, response_1.SuccessResponse)(res, {
        message: "Image deleted successfully",
    }, 200);
};
exports.deleteImage = deleteImage;
const updateImage = async (req, res) => {
    const { id } = req.params;
    const { img, periorty, linkType, link, subcategoryId, categoryId, foodId, productId, discountId, branchId, } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const [existing] = await connection_1.db.select().from(schema_1.images).where((0, drizzle_orm_1.eq)(schema_1.images.id, id)).limit(1);
    if (!existing) {
        throw new NotFound_1.NotFound("Image not found");
    }
    if (existing.restaurantid !== restaurantId) {
        throw new BadRequest_1.BadRequest("You are not authorized to update this image");
    }
    // 💡 تصحيح: الحفاظ على الفرع القديم إن لم يُرسل جديد
    const resolvedBranchId = branchId !== undefined ? branchId : existing.branchId;
    if (branchId) {
        const [branch] = await connection_1.db
            .select({ id: schema_1.branches.id })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.id, branchId), (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId)))
            .limit(1);
        if (!branch) {
            throw new NotFound_1.NotFound("Branch not found or does not belong to this restaurant");
        }
    }
    const effectiveLinkType = linkType !== undefined ? linkType : existing.linkType;
    const resolvedFoodId = foodId !== undefined ? foodId : (productId !== undefined ? productId : existing.foodId);
    const resolvedSubcategoryId = subcategoryId !== undefined ? subcategoryId : (categoryId !== undefined ? categoryId : existing.subcategoryId);
    const resolvedDiscountId = discountId !== undefined ? discountId : existing.discountId;
    await (0, popup_1.validateTargetEntity)(restaurantId, effectiveLinkType, effectiveLinkType === "subcategory" ? resolvedSubcategoryId : null, effectiveLinkType === "product" ? resolvedFoodId : null, effectiveLinkType === "discount" ? resolvedDiscountId : null);
    const updateData = { updatedAt: new Date() };
    if (branchId !== undefined) {
        updateData.branchId = resolvedBranchId;
    }
    if (img) {
        const updatedUrl = await (0, handleImages_1.handleImageUpdate)(req, existing.img, img, "images");
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
    await connection_1.db.update(schema_1.images).set(updateData).where((0, drizzle_orm_1.eq)(schema_1.images.id, id));
    return (0, response_1.SuccessResponse)(res, {
        message: "Image updated successfully",
        data: updateData,
    }, 200);
};
exports.updateImage = updateImage;
