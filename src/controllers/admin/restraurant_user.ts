import { Request, Response } from "express";
import { db } from "../../models/connection";
import { users, restaurant_users, restaurants } from "../../models/schema";
import { eq } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors";
import { handleImageUpdate } from "../../utils/handleImages";
export const getRestaurantUsers = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) {
        throw new BadRequest("Restaurant ID is required");
    }

    const data = await db.select({
        user: users,
        restaurant: restaurants
    })
    .from(restaurant_users)
    .innerJoin(users, eq(restaurant_users.userId, users.id))
    .innerJoin(restaurants, eq(restaurant_users.restaurantId, restaurants.id))
    .where(eq(restaurant_users.restaurantId, restaurantId));

    return SuccessResponse(res, { message: "Restaurant users fetched successfully", data }, 200);
};

export const updateRestaurantUser = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, phone, status } = req.body;
    const photo = req.body.photo;
    const restaurantId = req.user?.restaurantId;

    if (!restaurantId) {
        throw new BadRequest("Restaurant ID is required");
    }
    const [existingUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);

    if (!existingUser) {
        throw new NotFound("User not found");
    }

    let photoUrl = existingUser.photo;
    if (photo && photo !== existingUser.photo) {
        if (photo.startsWith("data:image")) {
            photoUrl = (await handleImageUpdate(req, existingUser.photo, photo, "users")) || null;
        } else {
            photoUrl = photo as string || null;
        }
    }
    await db.update(users)
        .set({
            name: name || existingUser.name,
            phone: phone || existingUser.phone,
            status: status || existingUser.status,
            photo: photoUrl,
        })
        .where(eq(users.id, id));

    return SuccessResponse(res, { message: "User updated successfully", data: { id } }, 200);
};

export const deleteRestaurantUser = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId;

    if (!restaurantId) {
        throw new BadRequest("Restaurant ID is required");
    }

    const [existingUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);

    if (!existingUser) {
        throw new NotFound("User not found");
    }

    await db.delete(restaurant_users)
        .where(eq(restaurant_users.userId, id));

    return SuccessResponse(res, { message: "User deleted successfully", data: { id } }, 200);
};
export const getRestaurantUserById = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId;

    if (!restaurantId) {
        throw new BadRequest("Restaurant ID is required");
    }

    const [existingUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);

    if (!existingUser) {
        throw new NotFound("User not found");
    }

    return SuccessResponse(res, { message: "User fetched successfully", data: existingUser }, 200);
};