import { Request, Response } from "express";
import { db } from "../../models/connection";
import { deliveryMen, restaurants } from "../../models/schema";
import { eq, and } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { UnauthorizedError } from "../../Errors";
import { NotFound } from "../../Errors/NotFound";
import bcrypt from "bcrypt";

// ==========================================
// GET /delivery-man/profile
// ==========================================
export const getMyProfile = async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");
    const deliveryManId = req.user.id;

    const [deliveryMan] = await db
        .select({
            id: deliveryMen.id,
            name: deliveryMen.name,
            phone: deliveryMen.phone,
            email: deliveryMen.email,
            image: deliveryMen.image,
            isActive: deliveryMen.isActive,
            restaurantId: deliveryMen.restaurantId,
            restaurant: {
                name: restaurants.name,
                nameAr: restaurants.nameAr,
                logo: restaurants.logo,
            },
            branchId: deliveryMen.branchId,
            createdAt: deliveryMen.createdAt,
            updatedAt: deliveryMen.updatedAt,
        })
        .from(deliveryMen)
        .leftJoin(restaurants, eq(deliveryMen.restaurantId, restaurants.id))
        .where(
            and(
                eq(deliveryMen.id, deliveryManId),
                eq(deliveryMen.isDeleted, false),
                req.user.restaurantId ? eq(deliveryMen.restaurantId, req.user.restaurantId) : undefined
            )
        )
        .limit(1);

    if (!deliveryMan) throw new NotFound("Delivery man profile not found");

    return SuccessResponse(res, {
        message: "Profile fetched successfully",
        data: {
            ...deliveryMan,
            restaurant: deliveryMan.restaurant?.name ? deliveryMan.restaurant : null,
        },
    });
};

// ==========================================
// PUT /delivery-man/profile
// ==========================================
export const updateMyProfile = async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");
    const deliveryManId = req.user.id;

    const { name, phone, email, image, currentPassword, newPassword } = req.body;

    const [existing] = await db
        .select()
        .from(deliveryMen)
        .where(and(eq(deliveryMen.id, deliveryManId), eq(deliveryMen.isDeleted, false)))
        .limit(1);

    if (!existing) throw new NotFound("Delivery man not found");

    const updateData: any = {};

    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    if (email !== undefined) updateData.email = email || null;
    if (image !== undefined) updateData.image = image || null;

    // Handle password change
    if (newPassword) {
        if (!currentPassword) throw new BadRequest("Current password is required to set a new password");

        if (!existing.password) throw new BadRequest("Account has no password set");

        const isValid = await bcrypt.compare(currentPassword, existing.password);
        if (!isValid) throw new BadRequest("Current password is incorrect");

        updateData.password = await bcrypt.hash(newPassword, 10);
    }

    if (Object.keys(updateData).length === 0) {
        throw new BadRequest("No valid fields provided to update");
    }

    updateData.updatedAt = new Date();

    await db.update(deliveryMen).set(updateData).where(eq(deliveryMen.id, deliveryManId));

    // Return updated profile (without password)
    const [updated] = await db
        .select({
            id: deliveryMen.id,
            name: deliveryMen.name,
            phone: deliveryMen.phone,
            email: deliveryMen.email,
            image: deliveryMen.image,
            isActive: deliveryMen.isActive,
            restaurantId: deliveryMen.restaurantId,
            branchId: deliveryMen.branchId,
            updatedAt: deliveryMen.updatedAt,
        })
        .from(deliveryMen)
        .where(eq(deliveryMen.id, deliveryManId))
        .limit(1);

    return SuccessResponse(res, {
        message: "Profile updated successfully",
        data: updated,
    });
};
