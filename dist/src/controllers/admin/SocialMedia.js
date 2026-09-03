"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSocialMedia = exports.updateSocialMedia = exports.getSocialMediaById = exports.getSocialMedia = exports.addSocialMedia = exports.selectPlatform = void 0;
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const NotFound_1 = require("../../Errors/NotFound");
const uuid_1 = require("uuid");
const connection_1 = require("../../models/connection");
const selectPlatform = async (req, res) => {
    const result = await connection_1.db
        .select({
        id: schema_1.platforms.id,
        name: schema_1.platforms.name,
        logo: schema_1.platforms.logo,
    })
        .from(schema_1.platforms);
    return (0, response_1.SuccessResponse)(res, { message: "Platform fetched successfully", data: result }, 200);
};
exports.selectPlatform = selectPlatform;
const addSocialMedia = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id || req.user?.branchId;
    const { link, platformId } = req.body;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID is required");
    }
    if (!link) {
        throw new BadRequest_1.BadRequest("Link is required");
    }
    if (!platformId) {
        throw new BadRequest_1.BadRequest("Platform ID is required");
    }
    // التحقق من وجود المنصة
    const [platform] = await connection_1.db
        .select()
        .from(schema_1.platforms)
        .where((0, drizzle_orm_1.eq)(schema_1.platforms.id, platformId))
        .limit(1);
    if (!platform) {
        throw new NotFound_1.NotFound("Selected platform does not exist");
    }
    const socialMediaId = (0, uuid_1.v4)();
    await connection_1.db.insert(schema_1.socialmedia).values({
        id: socialMediaId,
        restaurantid: restaurantId,
        platformId: platformId,
        link: link,
    });
    return (0, response_1.SuccessResponse)(res, { message: "Social media added successfully", data: { id: socialMediaId } }, 201);
};
exports.addSocialMedia = addSocialMedia;
const getSocialMedia = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id || req.user?.branchId;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID is required");
    }
    const result = await connection_1.db
        .select({
        id: schema_1.socialmedia.id,
        restaurantId: schema_1.socialmedia.restaurantid,
        link: schema_1.socialmedia.link,
        createdAt: schema_1.socialmedia.createdAt,
        updatedAt: schema_1.socialmedia.updatedAt,
        platform: {
            id: schema_1.platforms.id,
            name: schema_1.platforms.name,
            logo: schema_1.platforms.logo,
        },
    })
        .from(schema_1.socialmedia)
        .innerJoin(schema_1.platforms, (0, drizzle_orm_1.eq)(schema_1.socialmedia.platformId, schema_1.platforms.id))
        .where((0, drizzle_orm_1.eq)(schema_1.socialmedia.restaurantid, restaurantId));
    return (0, response_1.SuccessResponse)(res, { message: "Social media fetched successfully", data: result }, 200);
};
exports.getSocialMedia = getSocialMedia;
const getSocialMediaById = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id || req.user?.branchId;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID is required");
    }
    const [result] = await connection_1.db
        .select({
        id: schema_1.socialmedia.id,
        restaurantId: schema_1.socialmedia.restaurantid,
        link: schema_1.socialmedia.link,
        createdAt: schema_1.socialmedia.createdAt,
        updatedAt: schema_1.socialmedia.updatedAt,
        platform: {
            id: schema_1.platforms.id,
            name: schema_1.platforms.name,
            logo: schema_1.platforms.logo,
        },
    })
        .from(schema_1.socialmedia)
        .innerJoin(schema_1.platforms, (0, drizzle_orm_1.eq)(schema_1.socialmedia.platformId, schema_1.platforms.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.socialmedia.id, id), (0, drizzle_orm_1.eq)(schema_1.socialmedia.restaurantid, restaurantId)))
        .limit(1);
    if (!result) {
        throw new NotFound_1.NotFound("Social media record not found");
    }
    return (0, response_1.SuccessResponse)(res, { message: "Social media fetched successfully", data: result }, 200);
};
exports.getSocialMediaById = getSocialMediaById;
const updateSocialMedia = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id || req.user?.branchId;
    const { link, platformId } = req.body;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID is required");
    }
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.socialmedia)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.socialmedia.id, id), (0, drizzle_orm_1.eq)(schema_1.socialmedia.restaurantid, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new NotFound_1.NotFound("Social media record not found");
    }
    if (platformId) {
        const [platform] = await connection_1.db
            .select()
            .from(schema_1.platforms)
            .where((0, drizzle_orm_1.eq)(schema_1.platforms.id, platformId))
            .limit(1);
        if (!platform) {
            throw new NotFound_1.NotFound("Selected platform does not exist");
        }
    }
    await connection_1.db
        .update(schema_1.socialmedia)
        .set({
        ...(link && { link }),
        ...(platformId && { platformId }),
    })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.socialmedia.id, id), (0, drizzle_orm_1.eq)(schema_1.socialmedia.restaurantid, restaurantId)));
    return (0, response_1.SuccessResponse)(res, { message: "Social media updated successfully", data: { id } }, 200);
};
exports.updateSocialMedia = updateSocialMedia;
const deleteSocialMedia = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id || req.user?.branchId;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID is required");
    }
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.socialmedia)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.socialmedia.id, id), (0, drizzle_orm_1.eq)(schema_1.socialmedia.restaurantid, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new NotFound_1.NotFound("Social media record not found");
    }
    await connection_1.db
        .delete(schema_1.socialmedia)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.socialmedia.id, id), (0, drizzle_orm_1.eq)(schema_1.socialmedia.restaurantid, restaurantId)));
    return (0, response_1.SuccessResponse)(res, { message: "Social media deleted successfully", data: { id } }, 200);
};
exports.deleteSocialMedia = deleteSocialMedia;
