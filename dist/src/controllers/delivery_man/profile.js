"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMyProfile = exports.getMyProfile = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const Errors_1 = require("../../Errors");
const NotFound_1 = require("../../Errors/NotFound");
const bcrypt_1 = __importDefault(require("bcrypt"));
// ==========================================
// GET /delivery-man/profile
// ==========================================
const getMyProfile = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const deliveryManId = req.user.id;
    const [deliveryMan] = await connection_1.db
        .select({
        id: schema_1.deliveryMen.id,
        name: schema_1.deliveryMen.name,
        phone: schema_1.deliveryMen.phone,
        email: schema_1.deliveryMen.email,
        image: schema_1.deliveryMen.image,
        isActive: schema_1.deliveryMen.isActive,
        restaurantId: schema_1.deliveryMen.restaurantId,
        restaurant: {
            name: schema_1.restaurants.name,
            nameAr: schema_1.restaurants.nameAr,
            logo: schema_1.restaurants.logo,
        },
        branchId: schema_1.deliveryMen.branchId,
        createdAt: schema_1.deliveryMen.createdAt,
        updatedAt: schema_1.deliveryMen.updatedAt,
    })
        .from(schema_1.deliveryMen)
        .leftJoin(schema_1.restaurants, (0, drizzle_orm_1.eq)(schema_1.deliveryMen.restaurantId, schema_1.restaurants.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.deliveryMen.id, deliveryManId), (0, drizzle_orm_1.eq)(schema_1.deliveryMen.isDeleted, false), req.user.restaurantId ? (0, drizzle_orm_1.eq)(schema_1.deliveryMen.restaurantId, req.user.restaurantId) : undefined))
        .limit(1);
    if (!deliveryMan)
        throw new NotFound_1.NotFound("Delivery man profile not found");
    return (0, response_1.SuccessResponse)(res, {
        message: "Profile fetched successfully",
        data: {
            ...deliveryMan,
            restaurant: deliveryMan.restaurant?.name ? deliveryMan.restaurant : null,
        },
    });
};
exports.getMyProfile = getMyProfile;
// ==========================================
// PUT /delivery-man/profile
// ==========================================
const updateMyProfile = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const deliveryManId = req.user.id;
    const { name, phone, email, image, currentPassword, newPassword } = req.body;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.deliveryMen)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.deliveryMen.id, deliveryManId), (0, drizzle_orm_1.eq)(schema_1.deliveryMen.isDeleted, false)))
        .limit(1);
    if (!existing)
        throw new NotFound_1.NotFound("Delivery man not found");
    const updateData = {};
    if (name)
        updateData.name = name;
    if (phone)
        updateData.phone = phone;
    if (email !== undefined)
        updateData.email = email || null;
    if (image !== undefined)
        updateData.image = image || null;
    // Handle password change
    if (newPassword) {
        if (!currentPassword)
            throw new BadRequest_1.BadRequest("Current password is required to set a new password");
        if (!existing.password)
            throw new BadRequest_1.BadRequest("Account has no password set");
        const isValid = await bcrypt_1.default.compare(currentPassword, existing.password);
        if (!isValid)
            throw new BadRequest_1.BadRequest("Current password is incorrect");
        updateData.password = await bcrypt_1.default.hash(newPassword, 10);
    }
    if (Object.keys(updateData).length === 0) {
        throw new BadRequest_1.BadRequest("No valid fields provided to update");
    }
    updateData.updatedAt = new Date();
    await connection_1.db.update(schema_1.deliveryMen).set(updateData).where((0, drizzle_orm_1.eq)(schema_1.deliveryMen.id, deliveryManId));
    // Return updated profile (without password)
    const [updated] = await connection_1.db
        .select({
        id: schema_1.deliveryMen.id,
        name: schema_1.deliveryMen.name,
        phone: schema_1.deliveryMen.phone,
        email: schema_1.deliveryMen.email,
        image: schema_1.deliveryMen.image,
        isActive: schema_1.deliveryMen.isActive,
        restaurantId: schema_1.deliveryMen.restaurantId,
        branchId: schema_1.deliveryMen.branchId,
        updatedAt: schema_1.deliveryMen.updatedAt,
    })
        .from(schema_1.deliveryMen)
        .where((0, drizzle_orm_1.eq)(schema_1.deliveryMen.id, deliveryManId))
        .limit(1);
    return (0, response_1.SuccessResponse)(res, {
        message: "Profile updated successfully",
        data: updated,
    });
};
exports.updateMyProfile = updateMyProfile;
