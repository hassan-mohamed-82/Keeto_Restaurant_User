"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSocialMedia = exports.updateSocialMedia = exports.getSocialMediaById = exports.getSocialMedia = exports.addSocialMedia = void 0;
const SocialMedia_1 = require("../../models/schema/admin/SocialMedia");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const uuid_1 = require("uuid");
const handleImages_1 = require("../../utils/handleImages");
const connection_1 = require("../../models/connection");
const addSocialMedia = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const { link, icon } = req.body;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID is required");
    }
    if (!link) {
        throw new BadRequest_1.BadRequest("Link is required");
    }
    if (!icon) {
        throw new BadRequest_1.BadRequest("Icon is required");
    }
    const iconUrl = await (0, handleImages_1.saveBase64Image)(icon, req, "icons");
    const socialMediaId = (0, uuid_1.v4)();
    await connection_1.db.insert(SocialMedia_1.socialmedia).values({
        id: socialMediaId,
        restaurantid: restaurantId,
        link: link,
        icon: icon,
    });
    return (0, response_1.SuccessResponse)(res, { message: "Social media added successfully", data: { id: socialMediaId } }, 201);
};
exports.addSocialMedia = addSocialMedia;
const getSocialMedia = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID is required");
    }
    const socialMedia = await connection_1.db.select().from(SocialMedia_1.socialmedia).where((0, drizzle_orm_1.eq)(SocialMedia_1.socialmedia.restaurantid, restaurantId));
    return (0, response_1.SuccessResponse)(res, { message: "Social media fetched successfully", data: socialMedia }, 200);
};
exports.getSocialMedia = getSocialMedia;
const getSocialMediaById = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID is required");
    }
    const socialMedia = await connection_1.db.select().from(SocialMedia_1.socialmedia).where((0, drizzle_orm_1.eq)(SocialMedia_1.socialmedia.restaurantid, restaurantId));
    return (0, response_1.SuccessResponse)(res, { message: "Social media fetched successfully", data: socialMedia }, 200);
};
exports.getSocialMediaById = getSocialMediaById;
const updateSocialMedia = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const { link, icon } = req.body;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID is required");
    }
    if (!link) {
        throw new BadRequest_1.BadRequest("Link is required");
    }
    if (!icon) {
        throw new BadRequest_1.BadRequest("Icon is required");
    }
    const iconUrl = await (0, handleImages_1.saveBase64Image)(icon, req, "icons");
    await connection_1.db.update(SocialMedia_1.socialmedia).set({
        link: link,
        icon: icon,
    }).where((0, drizzle_orm_1.eq)(SocialMedia_1.socialmedia.restaurantid, restaurantId));
    return (0, response_1.SuccessResponse)(res, { message: "Social media updated successfully", data: { id } }, 200);
};
exports.updateSocialMedia = updateSocialMedia;
const deleteSocialMedia = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID is required");
    }
    await connection_1.db.delete(SocialMedia_1.socialmedia).where((0, drizzle_orm_1.eq)(SocialMedia_1.socialmedia.restaurantid, restaurantId));
    return (0, response_1.SuccessResponse)(res, { message: "Social media deleted successfully", data: { id } }, 200);
};
exports.deleteSocialMedia = deleteSocialMedia;
