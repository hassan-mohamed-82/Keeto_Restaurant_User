"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.togglePopupStatus = exports.deletePopup = exports.updatePopup = exports.getPopupById = exports.getAllPopups = exports.createPopup = exports.getLinkTargetOptions = exports.validateTargetEntity = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const NotFound_1 = require("../../Errors/NotFound");
const uuid_1 = require("uuid");
const constant_1 = require("../../types/constant");
// Helper to validate target entity
const validateTargetEntity = async (restaurantId, linkType, subcategoryId, foodId, discountId) => {
    if (subcategoryId) {
        const [sub] = await connection_1.db
            .select({ id: schema_1.subcategories.id, restaurantId: schema_1.subcategories.restaurantId })
            .from(schema_1.subcategories)
            .where((0, drizzle_orm_1.eq)(schema_1.subcategories.id, subcategoryId))
            .limit(1);
        if (!sub)
            throw new NotFound_1.NotFound("Subcategory not found");
        if (sub.restaurantId && sub.restaurantId !== restaurantId) {
            throw new BadRequest_1.BadRequest("Subcategory does not belong to this restaurant");
        }
    }
    if (foodId) {
        const [item] = await connection_1.db.select({ id: schema_1.food.id, restaurantid: schema_1.food.restaurantid }).from(schema_1.food).where((0, drizzle_orm_1.eq)(schema_1.food.id, foodId)).limit(1);
        if (!item)
            throw new NotFound_1.NotFound("Product not found");
        if (item.restaurantid !== restaurantId)
            throw new BadRequest_1.BadRequest("Product does not belong to this restaurant");
    }
    if (discountId) {
        const [disc] = await connection_1.db.select({ id: schema_1.discounts.id }).from(schema_1.discounts).where((0, drizzle_orm_1.eq)(schema_1.discounts.id, discountId)).limit(1);
        if (!disc)
            throw new NotFound_1.NotFound("Discount not found");
    }
};
exports.validateTargetEntity = validateTargetEntity;
// ==========================================
// 0. Get Link Target Options (Constant types + subcategories + products + discounts)
// ==========================================
const getLinkTargetOptions = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const [subcategoriesList, productsList, discountsList] = await Promise.all([
        connection_1.db
            .select({
            id: schema_1.subcategories.id,
            name: schema_1.subcategories.name,
            nameAr: schema_1.subcategories.nameAr,
            nameFr: schema_1.subcategories.nameFr,
            image: schema_1.subcategories.image,
            categoryId: schema_1.subcategories.categoryId,
        })
            .from(schema_1.subcategories)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.subcategories.status, "active"), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId), (0, drizzle_orm_1.sql) `${schema_1.subcategories.restaurantId} IS NULL`))),
        connection_1.db
            .select({
            id: schema_1.food.id,
            name: schema_1.food.name,
            nameAr: schema_1.food.nameAr,
            nameFr: schema_1.food.nameFr,
            image: schema_1.food.image,
            price: schema_1.food.price,
            categoryId: schema_1.food.categoryid,
            subcategoryId: schema_1.food.subcategoryid,
        })
            .from(schema_1.food)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), (0, drizzle_orm_1.eq)(schema_1.food.status, "active"), (0, drizzle_orm_1.sql) `${schema_1.food.deletedAt} IS NULL`)),
        connection_1.db
            .select({
            id: schema_1.discounts.id,
            name: schema_1.discounts.name,
            nameAr: schema_1.discounts.nameAr,
            nameFr: schema_1.discounts.nameFr,
            discountType: schema_1.discounts.discountType,
            discountValue: schema_1.discounts.discountValue,
            maxDiscount: schema_1.discounts.maxDiscount,
            minOrderAmount: schema_1.discounts.minOrderAmount,
            startDate: schema_1.discounts.startDate,
            endDate: schema_1.discounts.endDate,
            isGlobal: schema_1.discounts.isGlobal,
            logo: schema_1.discounts.logo,
        })
            .from(schema_1.discounts)
            .leftJoin(schema_1.discountRestaurants, (0, drizzle_orm_1.eq)(schema_1.discounts.id, schema_1.discountRestaurants.discountId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.discounts.isActive, true), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.discounts.isGlobal, true), (0, drizzle_orm_1.eq)(schema_1.discountRestaurants.restaurantId, restaurantId))))
    ]);
    return (0, response_1.SuccessResponse)(res, {
        message: "Link target options fetched successfully",
        data: {
            types: constant_1.LINK_TYPES,
            subcategories: subcategoriesList,
            products: productsList,
            discounts: discountsList,
        }
    });
};
exports.getLinkTargetOptions = getLinkTargetOptions;
// ==========================================
// 1. Create Popup
// ==========================================
const createPopup = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const { Title, TitleAr, TitleFr, description, descriptionAr, descriptionFr, image, imageAr, imageFr, type, status, linkType = "link", link, subcategoryId, categoryId, foodId, productId, discountId, startDate, endDate } = req.body;
    if (!Title)
        throw new BadRequest_1.BadRequest("Popup title is required");
    if (!startDate || !endDate)
        throw new BadRequest_1.BadRequest("Start date and end date are required");
    const resolvedFoodId = foodId || productId || null;
    const resolvedSubcategoryId = subcategoryId || categoryId || null;
    const resolvedDiscountId = discountId || null;
    const resolvedLink = link || null;
    await (0, exports.validateTargetEntity)(restaurantId, linkType, resolvedSubcategoryId, resolvedFoodId, resolvedDiscountId);
    const id = (0, uuid_1.v4)();
    await connection_1.db.insert(schema_1.popup).values({
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
        linkType: linkType || "link",
        link: linkType === "link" ? resolvedLink : null,
        subcategoryId: linkType === "subcategory" ? resolvedSubcategoryId : null,
        foodId: linkType === "product" ? resolvedFoodId : null,
        discountId: linkType === "discount" ? resolvedDiscountId : null,
        status: status || "active",
        startDate: new Date(startDate),
        endDate: new Date(endDate),
    });
    return (0, response_1.SuccessResponse)(res, { message: "Popup created successfully", data: { id } }, 201);
};
exports.createPopup = createPopup;
// ==========================================
// 2. Get All Popups (for this restaurant)
// ==========================================
const getAllPopups = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const allPopups = await connection_1.db
        .select({
        id: schema_1.popup.id,
        restaurantId: schema_1.popup.restaurantId,
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
        subcategoryNameFr: schema_1.subcategories.nameFr,
        subcategoryImage: schema_1.subcategories.image,
        foodId: schema_1.popup.foodId,
        productId: schema_1.popup.foodId,
        foodName: schema_1.food.name,
        foodNameAr: schema_1.food.nameAr,
        foodNameFr: schema_1.food.nameFr,
        foodImage: schema_1.food.image,
        discountId: schema_1.popup.discountId,
        discountName: schema_1.discounts.name,
        discountNameAr: schema_1.discounts.nameAr,
        discountNameFr: schema_1.discounts.nameFr,
        discountType: schema_1.discounts.discountType,
        discountValue: schema_1.discounts.discountValue,
        status: schema_1.popup.status,
        startDate: schema_1.popup.startDate,
        endDate: schema_1.popup.endDate,
        createdAt: schema_1.popup.createdAt,
        updatedAt: schema_1.popup.updatedAt,
    })
        .from(schema_1.popup)
        .leftJoin(schema_1.subcategories, (0, drizzle_orm_1.eq)(schema_1.popup.subcategoryId, schema_1.subcategories.id))
        .leftJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.popup.foodId, schema_1.food.id))
        .leftJoin(schema_1.discounts, (0, drizzle_orm_1.eq)(schema_1.popup.discountId, schema_1.discounts.id))
        .where((0, drizzle_orm_1.eq)(schema_1.popup.restaurantId, restaurantId));
    return (0, response_1.SuccessResponse)(res, { message: "Get all popups success", data: allPopups });
};
exports.getAllPopups = getAllPopups;
// ==========================================
// 3. Get Popup by ID
// ==========================================
const getPopupById = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const [existing] = await connection_1.db
        .select({
        id: schema_1.popup.id,
        restaurantId: schema_1.popup.restaurantId,
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
        subcategoryNameFr: schema_1.subcategories.nameFr,
        subcategoryImage: schema_1.subcategories.image,
        foodId: schema_1.popup.foodId,
        productId: schema_1.popup.foodId,
        foodName: schema_1.food.name,
        foodNameAr: schema_1.food.nameAr,
        foodNameFr: schema_1.food.nameFr,
        foodImage: schema_1.food.image,
        discountId: schema_1.popup.discountId,
        discountName: schema_1.discounts.name,
        discountNameAr: schema_1.discounts.nameAr,
        discountNameFr: schema_1.discounts.nameFr,
        discountType: schema_1.discounts.discountType,
        discountValue: schema_1.discounts.discountValue,
        status: schema_1.popup.status,
        startDate: schema_1.popup.startDate,
        endDate: schema_1.popup.endDate,
        createdAt: schema_1.popup.createdAt,
        updatedAt: schema_1.popup.updatedAt,
    })
        .from(schema_1.popup)
        .leftJoin(schema_1.subcategories, (0, drizzle_orm_1.eq)(schema_1.popup.subcategoryId, schema_1.subcategories.id))
        .leftJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.popup.foodId, schema_1.food.id))
        .leftJoin(schema_1.discounts, (0, drizzle_orm_1.eq)(schema_1.popup.discountId, schema_1.discounts.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.popup.id, id), (0, drizzle_orm_1.eq)(schema_1.popup.restaurantId, restaurantId)))
        .limit(1);
    if (!existing)
        throw new NotFound_1.NotFound("Popup not found");
    return (0, response_1.SuccessResponse)(res, { message: "Get popup success", data: existing });
};
exports.getPopupById = getPopupById;
// ==========================================
// 4. Update Popup
// ==========================================
const updatePopup = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.popup)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.popup.id, id), (0, drizzle_orm_1.eq)(schema_1.popup.restaurantId, restaurantId)))
        .limit(1);
    if (!existing)
        throw new NotFound_1.NotFound("Popup not found");
    const { Title, TitleAr, TitleFr, description, descriptionAr, descriptionFr, image, imageAr, imageFr, type, status, linkType, link, subcategoryId, categoryId, foodId, productId, discountId, startDate, endDate } = req.body;
    const effectiveLinkType = linkType !== undefined ? linkType : existing.linkType;
    const resolvedFoodId = foodId !== undefined ? foodId : (productId !== undefined ? productId : existing.foodId);
    const resolvedSubcategoryId = subcategoryId !== undefined ? subcategoryId : (categoryId !== undefined ? categoryId : existing.subcategoryId);
    const resolvedDiscountId = discountId !== undefined ? discountId : existing.discountId;
    await (0, exports.validateTargetEntity)(restaurantId, effectiveLinkType, effectiveLinkType === "subcategory" ? resolvedSubcategoryId : null, effectiveLinkType === "product" ? resolvedFoodId : null, effectiveLinkType === "discount" ? resolvedDiscountId : null);
    const updateData = { updatedAt: new Date() };
    if (Title !== undefined)
        updateData.Title = Title;
    if (TitleAr !== undefined)
        updateData.TitleAr = TitleAr;
    if (TitleFr !== undefined)
        updateData.TitleFr = TitleFr;
    if (description !== undefined)
        updateData.description = description;
    if (descriptionAr !== undefined)
        updateData.descriptionAr = descriptionAr;
    if (descriptionFr !== undefined)
        updateData.descriptionFr = descriptionFr;
    if (image !== undefined)
        updateData.image = image;
    if (imageAr !== undefined)
        updateData.imageAr = imageAr;
    if (imageFr !== undefined)
        updateData.imageFr = imageFr;
    if (type !== undefined)
        updateData.type = type;
    if (status !== undefined)
        updateData.status = status;
    if (startDate !== undefined)
        updateData.startDate = new Date(startDate);
    if (endDate !== undefined)
        updateData.endDate = new Date(endDate);
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
    await connection_1.db.update(schema_1.popup).set(updateData).where((0, drizzle_orm_1.eq)(schema_1.popup.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Popup updated successfully" });
};
exports.updatePopup = updatePopup;
// ==========================================
// 5. Delete Popup
// ==========================================
const deletePopup = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.popup)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.popup.id, id), (0, drizzle_orm_1.eq)(schema_1.popup.restaurantId, restaurantId)))
        .limit(1);
    if (!existing)
        throw new NotFound_1.NotFound("Popup not found");
    await connection_1.db.delete(schema_1.popup).where((0, drizzle_orm_1.eq)(schema_1.popup.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Popup deleted successfully" });
};
exports.deletePopup = deletePopup;
// ==========================================
// 6. Toggle Popup Status
// ==========================================
const togglePopupStatus = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.popup)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.popup.id, id), (0, drizzle_orm_1.eq)(schema_1.popup.restaurantId, restaurantId)))
        .limit(1);
    if (!existing)
        throw new NotFound_1.NotFound("Popup not found");
    const newStatus = existing.status === "active" ? "inactive" : "active";
    await connection_1.db.update(schema_1.popup)
        .set({ status: newStatus, updatedAt: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.popup.id, id));
    return (0, response_1.SuccessResponse)(res, {
        message: `Popup ${newStatus === "active" ? "activated" : "deactivated"} successfully`,
        data: { status: newStatus }
    });
};
exports.togglePopupStatus = togglePopupStatus;
