"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRestaurantUserStats = exports.getRestaurantUserById = exports.deleteRestaurantUser = exports.updateRestaurantUser = exports.getBlockedRestaurantUsers = exports.getRestaurantUsers = void 0;
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
        points: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.userRestaurantPoints.points}, 0)`,
        totalOrders: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.userRestaurantPoints.totalOrders}, 0)`,
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
        .leftJoin(schema_1.userRestaurantPoints, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userRestaurantPoints.userId, schema_1.users.id), (0, drizzle_orm_1.eq)(schema_1.userRestaurantPoints.restaurantId, schema_1.restaurant_users.restaurantId)))
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
        points: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.userRestaurantPoints.points}, 0)`,
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
        .leftJoin(schema_1.userRestaurantPoints, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userRestaurantPoints.userId, schema_1.users.id), (0, drizzle_orm_1.eq)(schema_1.userRestaurantPoints.restaurantId, schema_1.restaurant_users.restaurantId)))
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
        points: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.userRestaurantPoints.points}, 0)`,
        totalOrders: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.userRestaurantPoints.totalOrders}, 0)`,
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
        .leftJoin(schema_1.userRestaurantPoints, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userRestaurantPoints.userId, schema_1.users.id), (0, drizzle_orm_1.eq)(schema_1.userRestaurantPoints.restaurantId, schema_1.restaurant_users.restaurantId)))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restaurant_users.restaurantId, restaurantId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.restaurant_users.userId, id), (0, drizzle_orm_1.eq)(schema_1.restaurant_users.id, id))))
        .limit(1);
    if (!userRecord) {
        throw new Errors_1.NotFound("User not found for this restaurant");
    }
    return (0, response_1.SuccessResponse)(res, { message: "User fetched successfully", data: userRecord }, 200);
};
exports.getRestaurantUserById = getRestaurantUserById;
// =======================================================
// Get Single User Stats (User Analytics Page)
// Returns: user info, points, total spendings, order source
// breakdown (pie chart), top-5 most ordered items, and a
// paginated recent orders list — all scoped to this restaurant.
// =======================================================
const getRestaurantUserStats = async (req, res) => {
    const userId = req.params.id;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID is required");
    // ─── 1. Verify user exists ──────────────────────────────────────────────
    const [userRecord] = await connection_1.db
        .select({
        id: schema_1.users.id,
        name: schema_1.users.name,
        email: schema_1.users.email,
        phone: schema_1.users.phone,
        photo: schema_1.users.photo,
        status: schema_1.users.status,
        isVerified: schema_1.users.isVerified,
        createdAt: schema_1.users.createdAt,
    })
        .from(schema_1.users)
        .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))
        .limit(1);
    if (!userRecord)
        throw new Errors_1.NotFound("User not found");
    // ─── 2. Run parallel queries ─────────────────────────────────────────────
    const baseCondition = (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orders.userId, userId), (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId));
    const [pointsRows, aggregateRows, recentOrderRows, topItemRows] = await Promise.all([
        // Points for this restaurant
        connection_1.db.select({ points: schema_1.userRestaurantPoints.points })
            .from(schema_1.userRestaurantPoints)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userRestaurantPoints.userId, userId), (0, drizzle_orm_1.eq)(schema_1.userRestaurantPoints.restaurantId, restaurantId)))
            .limit(1),
        // Aggregate: total orders & total spendings (exclude cancelled)
        connection_1.db.select({
            totalOrders: (0, drizzle_orm_1.sql) `COUNT(*)`,
            totalSpendings: (0, drizzle_orm_1.sql) `COALESCE(SUM(${schema_1.orders.totalAmount}), 0)`,
        })
            .from(schema_1.orders)
            .where((0, drizzle_orm_1.and)(baseCondition, (0, drizzle_orm_1.sql) `${schema_1.orders.status} != 'cancelled'`)),
        // Recent 50 orders
        connection_1.db.select({
            orderNumber: schema_1.orders.orderNumber,
            totalAmount: schema_1.orders.totalAmount,
            orderSource: schema_1.orders.orderSource,
            orderType: schema_1.orders.orderType,
            paymentMethod: schema_1.orders.paymentMethod,
            status: schema_1.orders.status,
            createdAt: schema_1.orders.createdAt,
        })
            .from(schema_1.orders)
            .where(baseCondition)
            .orderBy((0, drizzle_orm_1.desc)(schema_1.orders.createdAt))
            .limit(50),
        // Top 5 most ordered food items
        connection_1.db.select({
            foodId: schema_1.orderItems.foodId,
            name: schema_1.food.name,
            nameAr: schema_1.food.nameAr,
            image: schema_1.food.image,
            totalQuantity: (0, drizzle_orm_1.sql) `SUM(${schema_1.orderItems.quantity})`,
            orderCount: (0, drizzle_orm_1.sql) `COUNT(DISTINCT ${schema_1.orderItems.orderId})`,
        })
            .from(schema_1.orderItems)
            .innerJoin(schema_1.orders, (0, drizzle_orm_1.eq)(schema_1.orderItems.orderId, schema_1.orders.id))
            .innerJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.orderItems.foodId, schema_1.food.id))
            .where(baseCondition)
            .groupBy(schema_1.orderItems.foodId, schema_1.food.name, schema_1.food.nameAr, schema_1.food.image)
            .orderBy((0, drizzle_orm_1.sql) `SUM(${schema_1.orderItems.quantity}) DESC`)
            .limit(5),
    ]);
    // ─── 3. Build order-source breakdown (for pie chart) ────────────────────
    const sourceMap = {};
    for (const o of recentOrderRows) {
        const src = o.orderSource ?? "unknown";
        sourceMap[src] = (sourceMap[src] ?? 0) + 1;
    }
    const orderSourceBreakdown = Object.entries(sourceMap).map(([source, count]) => ({ source, count }));
    // ─── 4. Build response ──────────────────────────────────────────────────
    const aggregate = aggregateRows[0];
    return (0, response_1.SuccessResponse)(res, {
        message: "User stats fetched successfully",
        data: {
            user: userRecord,
            stats: {
                points: pointsRows[0]?.points ?? 0,
                totalOrders: Number(aggregate?.totalOrders ?? 0),
                totalSpendings: Number(aggregate?.totalSpendings ?? 0).toFixed(2),
            },
            orderSourceBreakdown,
            topItems: topItemRows,
            recentOrders: recentOrderRows,
        },
    }, 200);
};
exports.getRestaurantUserStats = getRestaurantUserStats;
