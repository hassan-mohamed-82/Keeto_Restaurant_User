"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRestaurantUserById = exports.deleteRestaurantUser = exports.updateRestaurantUser = exports.getRestaurantUsers = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const Errors_1 = require("../../Errors");
const handleImages_1 = require("../../utils/handleImages");
const getRestaurantUsers = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID is required");
    }
    const data = await connection_1.db.select({
        user: schema_1.users,
        restaurant: schema_1.restaurants
    })
        .from(schema_1.restaurant_users)
        .innerJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.restaurant_users.userId, schema_1.users.id))
        .innerJoin(schema_1.restaurants, (0, drizzle_orm_1.eq)(schema_1.restaurant_users.restaurantId, schema_1.restaurants.id))
        .where((0, drizzle_orm_1.eq)(schema_1.restaurant_users.restaurantId, restaurantId));
    return (0, response_1.SuccessResponse)(res, { message: "Restaurant users fetched successfully", data }, 200);
};
exports.getRestaurantUsers = getRestaurantUsers;
const updateRestaurantUser = async (req, res) => {
    const { id } = req.params;
    const { name, phone, status } = req.body;
    const photo = req.body.photo;
    const restaurantId = req.user?.restaurantId;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID is required");
    }
    const [existingUser] = await connection_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, id)).limit(1);
    if (!existingUser) {
        throw new Errors_1.NotFound("User not found");
    }
    let photoUrl = existingUser.photo;
    if (photo && photo !== existingUser.photo) {
        if (photo.startsWith("data:image")) {
            photoUrl = (await (0, handleImages_1.handleImageUpdate)(req, existingUser.photo, photo, "users")) || null;
        }
        else {
            photoUrl = photo || null;
        }
    }
    await connection_1.db.update(schema_1.users)
        .set({
        name: name || existingUser.name,
        phone: phone || existingUser.phone,
        status: status || existingUser.status,
        photo: photoUrl,
    })
        .where((0, drizzle_orm_1.eq)(schema_1.users.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "User updated successfully", data: { id } }, 200);
};
exports.updateRestaurantUser = updateRestaurantUser;
const deleteRestaurantUser = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID is required");
    }
    const [existingUser] = await connection_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, id)).limit(1);
    if (!existingUser) {
        throw new Errors_1.NotFound("User not found");
    }
    await connection_1.db.delete(schema_1.restaurant_users)
        .where((0, drizzle_orm_1.eq)(schema_1.restaurant_users.userId, id));
    return (0, response_1.SuccessResponse)(res, { message: "User deleted successfully", data: { id } }, 200);
};
exports.deleteRestaurantUser = deleteRestaurantUser;
const getRestaurantUserById = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID is required");
    }
    const [existingUser] = await connection_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, id)).limit(1);
    if (!existingUser) {
        throw new Errors_1.NotFound("User not found");
    }
    return (0, response_1.SuccessResponse)(res, { message: "User fetched successfully", data: existingUser }, 200);
};
exports.getRestaurantUserById = getRestaurantUserById;
