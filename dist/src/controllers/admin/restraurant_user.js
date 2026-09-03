"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRestaurantUserById = exports.deleteRestaurantUser = exports.updateRestaurantUser = exports.getBlockedRestaurantUsers = exports.getRestaurantUsers = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const Errors_1 = require("../../Errors");
const handleImages_1 = require("../../utils/handleImages");
// =======================================================
// 1. Get Restaurant Users (Supports ?status=active/blocked)
// =======================================================
const getRestaurantUsers = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id || req.user?.branchId;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID is required");
    }
    const conditions = [
        (0, drizzle_orm_1.eq)(schema_1.restaurant_users.restaurantId, restaurantId)
    ];
    const data = await connection_1.db.select({
        id: schema_1.restaurant_users.id,
        userId: schema_1.users.id,
        name: schema_1.users.name,
        phone: schema_1.users.phone,
        email: schema_1.users.email,
        photo: schema_1.users.photo,
        status: schema_1.restaurant_users.status,
        userStatus: schema_1.users.status,
        createdAt: schema_1.restaurant_users.createdAt,
        updatedAt: schema_1.restaurant_users.updatedAt,
        restaurant: {
            id: schema_1.restaurants.id,
            name: schema_1.restaurants.name,
        }
    })
        .from(schema_1.restaurant_users)
        .innerJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.restaurant_users.userId, schema_1.users.id))
        .innerJoin(schema_1.restaurants, (0, drizzle_orm_1.eq)(schema_1.restaurant_users.restaurantId, schema_1.restaurants.id))
        .where((0, drizzle_orm_1.and)(...conditions));
    return (0, response_1.SuccessResponse)(res, { message: "Restaurant users fetched successfully", data }, 200);
};
exports.getRestaurantUsers = getRestaurantUsers;
// =======================================================
// 2. Get Blocked Users specifically for this Restaurant
// =======================================================
const getBlockedRestaurantUsers = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID is required");
    }
    // Returns users who are blocked either by this restaurant OR globally by Keeto
    const data = await connection_1.db.select({
        id: schema_1.restaurant_users.id,
        userId: schema_1.users.id,
        name: schema_1.users.name,
        phone: schema_1.users.phone,
        email: schema_1.users.email,
        photo: schema_1.users.photo,
        status: schema_1.restaurant_users.status, // blocked by this restaurant
        userStatus: schema_1.users.status, // blocked globally by Keeto
        createdAt: schema_1.restaurant_users.createdAt,
        updatedAt: schema_1.restaurant_users.updatedAt,
        restaurant: {
            id: schema_1.restaurants.id,
            name: schema_1.restaurants.name,
        }
    })
        .from(schema_1.restaurant_users)
        .innerJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.restaurant_users.userId, schema_1.users.id))
        .innerJoin(schema_1.restaurants, (0, drizzle_orm_1.eq)(schema_1.restaurant_users.restaurantId, schema_1.restaurants.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restaurant_users.restaurantId, restaurantId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.restaurant_users.status, "blocked"), // blocked by restaurant
    (0, drizzle_orm_1.eq)(schema_1.users.status, "blocked") // blocked globally by Keeto
    )));
    return (0, response_1.SuccessResponse)(res, { message: "Blocked restaurant users fetched successfully", data }, 200);
};
exports.getBlockedRestaurantUsers = getBlockedRestaurantUsers;
// =======================================================
// 3. Update Restaurant User (Updates status in restaurant_users)
// =======================================================
const updateRestaurantUser = async (req, res) => {
    const { id } = req.params; // userId or restaurant_users.id
    const { name, phone, status } = req.body;
    const photo = req.body.photo;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID is required");
    }
    // 1. Check if relation exists in restaurant_users
    const [existingLink] = await connection_1.db
        .select()
        .from(schema_1.restaurant_users)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restaurant_users.restaurantId, restaurantId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.restaurant_users.userId, id), (0, drizzle_orm_1.eq)(schema_1.restaurant_users.id, id))))
        .limit(1);
    const targetUserId = existingLink?.userId || id;
    const [existingUser] = await connection_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, targetUserId)).limit(1);
    if (!existingUser && !existingLink) {
        throw new Errors_1.NotFound("User not found");
    }
    // 2. Update status in restaurant_users for this restaurant
    if (status && (status === "active" || status === "blocked")) {
        // If trying to activate a user who is globally blocked by Keeto, reject it
        if (status === "active" && existingUser?.status === "blocked") {
            throw new BadRequest_1.BadRequest("Cannot activate this user. Keeto has blocked this user globally and only Keeto admins can unblock them.");
        }
        if (existingLink) {
            await connection_1.db.update(schema_1.restaurant_users)
                .set({
                status: status,
                updatedAt: new Date()
            })
                .where((0, drizzle_orm_1.eq)(schema_1.restaurant_users.id, existingLink.id));
        }
        else if (existingUser) {
            await connection_1.db.insert(schema_1.restaurant_users).values({
                restaurantId,
                userId: existingUser.id,
                status: status
            });
        }
    }
    // 3. Optional user profile details update
    if (name || phone || photo) {
        let photoUrl = existingUser?.photo;
        if (photo && photo !== existingUser?.photo) {
            if (photo.startsWith("data:image")) {
                photoUrl = (await (0, handleImages_1.handleImageUpdate)(req, existingUser?.photo, photo, "users")) || null;
            }
            else {
                photoUrl = photo || null;
            }
        }
        if (existingUser) {
            await connection_1.db.update(schema_1.users)
                .set({
                name: name || existingUser.name,
                phone: phone || existingUser.phone,
                photo: photoUrl,
            })
                .where((0, drizzle_orm_1.eq)(schema_1.users.id, existingUser.id));
        }
    }
    return (0, response_1.SuccessResponse)(res, {
        message: status === "blocked" ? "User blocked successfully for this restaurant" : "User updated successfully",
        data: { id, status }
    }, 200);
};
exports.updateRestaurantUser = updateRestaurantUser;
// =======================================================
// 4. Delete / Unlink User from Restaurant
// =======================================================
const deleteRestaurantUser = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID is required");
    }
    await connection_1.db.delete(schema_1.restaurant_users)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restaurant_users.restaurantId, restaurantId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.restaurant_users.userId, id), (0, drizzle_orm_1.eq)(schema_1.restaurant_users.id, id))));
    return (0, response_1.SuccessResponse)(res, { message: "User removed from restaurant successfully", data: { id } }, 200);
};
exports.deleteRestaurantUser = deleteRestaurantUser;
// =======================================================
// 5. Get Restaurant User by ID
// =======================================================
const getRestaurantUserById = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID is required");
    }
    const [userRecord] = await connection_1.db.select({
        id: schema_1.restaurant_users.id,
        userId: schema_1.users.id,
        name: schema_1.users.name,
        phone: schema_1.users.phone,
        email: schema_1.users.email,
        photo: schema_1.users.photo,
        status: schema_1.restaurant_users.status,
        userStatus: schema_1.users.status,
        createdAt: schema_1.restaurant_users.createdAt,
        updatedAt: schema_1.restaurant_users.updatedAt,
        restaurant: {
            id: schema_1.restaurants.id,
            name: schema_1.restaurants.name,
        }
    })
        .from(schema_1.restaurant_users)
        .innerJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.restaurant_users.userId, schema_1.users.id))
        .innerJoin(schema_1.restaurants, (0, drizzle_orm_1.eq)(schema_1.restaurant_users.restaurantId, schema_1.restaurants.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restaurant_users.restaurantId, restaurantId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.restaurant_users.userId, id), (0, drizzle_orm_1.eq)(schema_1.restaurant_users.id, id))))
        .limit(1);
    if (!userRecord) {
        throw new Errors_1.NotFound("User not found for this restaurant");
    }
    return (0, response_1.SuccessResponse)(res, { message: "User fetched successfully", data: userRecord }, 200);
};
exports.getRestaurantUserById = getRestaurantUserById;
