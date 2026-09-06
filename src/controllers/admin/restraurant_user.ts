import { Request, Response } from "express";
import { db } from "../../models/connection";
import { users, restaurant_users, restaurants, userRestaurantPoints } from "../../models/schema";
import { eq, and, or, sql } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors";
import { handleImageUpdate } from "../../utils/handleImages";

// =======================================================
// 1. Get Restaurant Users (Supports ?status=active/blocked)
// =======================================================
export const getRestaurantUsers = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id || req.user?.branchId;

    if (!restaurantId) {
        throw new BadRequest("Restaurant ID is required");
    }

    const conditions: any[] = [
        eq(restaurant_users.restaurantId, restaurantId)
    ];

    const data = await db.select({
        id: restaurant_users.id,
        userId: users.id,
        name: users.name,
        phone: users.phone,
        email: users.email,
        photo: users.photo,
        points: sql<number>`COALESCE(${userRestaurantPoints.points}, 0)`,
        status: restaurant_users.status,
        userStatus: users.status,
        createdAt: restaurant_users.createdAt,
        updatedAt: restaurant_users.updatedAt,
        restaurant: {
            id: restaurants.id,
            name: restaurants.name,
        }
    })
        .from(restaurant_users)
        .innerJoin(users, eq(restaurant_users.userId, users.id))
        .innerJoin(restaurants, eq(restaurant_users.restaurantId, restaurants.id))
        .leftJoin(
            userRestaurantPoints,
            and(
                eq(userRestaurantPoints.userId, users.id),
                eq(userRestaurantPoints.restaurantId, restaurant_users.restaurantId)
            )
        )
        .where(and(...conditions));

    return SuccessResponse(res, { message: "Restaurant users fetched successfully", data }, 200);
};

// =======================================================
// 2. Get Blocked Users specifically for this Restaurant
// =======================================================
export const getBlockedRestaurantUsers = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) {
        throw new BadRequest("Restaurant ID is required");
    }

    // Returns users who are blocked either by this restaurant OR globally by Keeto
    const data = await db.select({
        id: restaurant_users.id,
        userId: users.id,
        name: users.name,
        phone: users.phone,
        email: users.email,
        photo: users.photo,
        points: sql<number>`COALESCE(${userRestaurantPoints.points}, 0)`,
        status: restaurant_users.status,   // blocked by this restaurant
        userStatus: users.status,                  // blocked globally by Keeto
        createdAt: restaurant_users.createdAt,
        updatedAt: restaurant_users.updatedAt,
        restaurant: {
            id: restaurants.id,
            name: restaurants.name,
        }
    })
        .from(restaurant_users)
        .innerJoin(users, eq(restaurant_users.userId, users.id))
        .innerJoin(restaurants, eq(restaurant_users.restaurantId, restaurants.id))
        .leftJoin(
            userRestaurantPoints,
            and(
                eq(userRestaurantPoints.userId, users.id),
                eq(userRestaurantPoints.restaurantId, restaurant_users.restaurantId)
            )
        )
        .where(and(
            eq(restaurant_users.restaurantId, restaurantId),
            or(
                eq(restaurant_users.status, "blocked"),  // blocked by restaurant
                eq(users.status, "blocked")              // blocked globally by Keeto
            )
        ));

    return SuccessResponse(res, { message: "Blocked restaurant users fetched successfully", data }, 200);
};

// =======================================================
// 3. Update Restaurant User (Updates status in restaurant_users)
// =======================================================
export const updateRestaurantUser = async (req: Request, res: Response) => {
    const { id } = req.params; // userId or restaurant_users.id
    const { name, phone, status } = req.body;
    const photo = req.body.photo;
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) {
        throw new BadRequest("Restaurant ID is required");
    }

    // 1. Check if relation exists in restaurant_users
    const [existingLink] = await db
        .select()
        .from(restaurant_users)
        .where(
            and(
                eq(restaurant_users.restaurantId, restaurantId),
                or(
                    eq(restaurant_users.userId, id),
                    eq(restaurant_users.id, id)
                )
            )
        )
        .limit(1);

    const targetUserId = existingLink?.userId || id;
    const [existingUser] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);

    if (!existingUser && !existingLink) {
        throw new NotFound("User not found");
    }

    // 2. Update status in restaurant_users for this restaurant
    if (status && (status === "active" || status === "blocked")) {
        // If trying to activate a user who is globally blocked by Keeto, reject it
        if (status === "active" && existingUser?.status === "blocked") {
            throw new BadRequest(
                "Cannot activate this user. Keeto has blocked this user globally and only Keeto admins can unblock them."
            );
        }

        if (existingLink) {
            await db.update(restaurant_users)
                .set({
                    status: status,
                    updatedAt: new Date()
                })
                .where(eq(restaurant_users.id, existingLink.id));
        } else if (existingUser) {
            await db.insert(restaurant_users).values({
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
                photoUrl = (await handleImageUpdate(req, existingUser?.photo, photo, "users")) || null;
            } else {
                photoUrl = photo as string || null;
            }
        }
        if (existingUser) {
            await db.update(users)
                .set({
                    name: name || existingUser.name,
                    phone: phone || existingUser.phone,
                    photo: photoUrl,
                })
                .where(eq(users.id, existingUser.id));
        }
    }

    return SuccessResponse(res, {
        message: status === "blocked" ? "User blocked successfully for this restaurant" : "User updated successfully",
        data: { id, status }
    }, 200);
};

// =======================================================
// 4. Delete / Unlink User from Restaurant
// =======================================================
export const deleteRestaurantUser = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) {
        throw new BadRequest("Restaurant ID is required");
    }

    await db.delete(restaurant_users)
        .where(
            and(
                eq(restaurant_users.restaurantId, restaurantId),
                or(
                    eq(restaurant_users.userId, id),
                    eq(restaurant_users.id, id)
                )
            )
        );

    return SuccessResponse(res, { message: "User removed from restaurant successfully", data: { id } }, 200);
};

// =======================================================
// 5. Get Restaurant User by ID
// =======================================================
export const getRestaurantUserById = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) {
        throw new BadRequest("Restaurant ID is required");
    }

    const [userRecord] = await db.select({
        id: restaurant_users.id,
        userId: users.id,
        name: users.name,
        phone: users.phone,
        email: users.email,
        photo: users.photo,
        points: sql<number>`COALESCE(${userRestaurantPoints.points}, 0)`,
        status: restaurant_users.status,
        userStatus: users.status,
        createdAt: restaurant_users.createdAt,
        updatedAt: restaurant_users.updatedAt,
        restaurant: {
            id: restaurants.id,
            name: restaurants.name,
        }
    })
        .from(restaurant_users)
        .innerJoin(users, eq(restaurant_users.userId, users.id))
        .innerJoin(restaurants, eq(restaurant_users.restaurantId, restaurants.id))
        .leftJoin(
            userRestaurantPoints,
            and(
                eq(userRestaurantPoints.userId, users.id),
                eq(userRestaurantPoints.restaurantId, restaurant_users.restaurantId)
            )
        )
        .where(
            and(
                eq(restaurant_users.restaurantId, restaurantId),
                or(
                    eq(restaurant_users.userId, id),
                    eq(restaurant_users.id, id)
                )
            )
        )
        .limit(1);

    if (!userRecord) {
        throw new NotFound("User not found for this restaurant");
    }

    return SuccessResponse(res, { message: "User fetched successfully", data: userRecord }, 200);
};