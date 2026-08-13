import { Request, Response } from "express";
import { db } from "../../models/connection";
import { deliveryMen } from "../../models/schema";
import { eq, and } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";

export const createDeliveryMan = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    const { branchId, name, phone, email, password, image , isActive } = req.body;

    if (!name || !phone) {
        throw new BadRequest("Missing required fields (name, phone)");
    }

    const id = uuidv4();
    
    let hashedPassword = null;
    if (password) {
        hashedPassword = await bcrypt.hash(password, 10);
    }

    await db.insert(deliveryMen).values({
        id,
        restaurantId,
        branchId: branchId || null,
        name,
        phone,
        email: email || null,
        password: hashedPassword,
        image: image || null,
        isActive: isActive ?? true,
    });

    return SuccessResponse(res, { message: "Delivery man created successfully", data: { id } }, 201);
};

export const getDeliveryMen = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    const { branchId } = req.query;

    let condition = eq(deliveryMen.restaurantId, restaurantId);
    if (branchId) {
        condition = and(condition, eq(deliveryMen.branchId, branchId as string)) as any;
    }

    const allDeliveryMen = await db.select({
        id: deliveryMen.id,
        restaurantId: deliveryMen.restaurantId,
        branchId: deliveryMen.branchId,
        name: deliveryMen.name,
        phone: deliveryMen.phone,
        email: deliveryMen.email,
        image: deliveryMen.image,
        isActive: deliveryMen.isActive,
        createdAt: deliveryMen.createdAt,
        updatedAt: deliveryMen.updatedAt,
    })
    .from(deliveryMen)
    .where(condition);

    return SuccessResponse(res, { message: "Get delivery men success", data: allDeliveryMen });
};

export const getDeliveryManById = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    const deliveryMan = await db.select({
        id: deliveryMen.id,
        restaurantId: deliveryMen.restaurantId,
        branchId: deliveryMen.branchId,
        name: deliveryMen.name,
        phone: deliveryMen.phone,
        email: deliveryMen.email,
        image: deliveryMen.image,
        isActive: deliveryMen.isActive,
        createdAt: deliveryMen.createdAt,
        updatedAt: deliveryMen.updatedAt,
    })
    .from(deliveryMen)
    .where(
        and(
            eq(deliveryMen.id, id),
            eq(deliveryMen.restaurantId, restaurantId)
        )
    )
    .limit(1);

    if (!deliveryMan[0]) throw new NotFound("Delivery man not found or does not belong to your restaurant");

    return SuccessResponse(res, { message: "Get delivery man by id success", data: deliveryMan[0] });
};

export const updateDeliveryMan = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { branchId, name, phone, email, password, image, isActive } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    const existing = await db
        .select()
        .from(deliveryMen)
        .where(
            and(
                eq(deliveryMen.id, id),
                eq(deliveryMen.restaurantId, restaurantId)
            )
        )
        .limit(1);

    if (!existing[0]) throw new NotFound("Delivery man not found or you don't have permission to edit it");

    const updateData: any = {};
    if (branchId !== undefined) updateData.branchId = branchId || null;
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    if (email !== undefined) updateData.email = email || null;
    if (image !== undefined) updateData.image = image || null;
    
    if (password) {
        updateData.password = await bcrypt.hash(password, 10);
    }

    if (isActive !== undefined) updateData.isActive = isActive;

    await db
        .update(deliveryMen)
        .set(updateData)
        .where(eq(deliveryMen.id, id));

    return SuccessResponse(res, { message: "Delivery man updated successfully" });
};

export const deleteDeliveryMan = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    const existing = await db
        .select()
        .from(deliveryMen)
        .where(
            and(
                eq(deliveryMen.id, id),
                eq(deliveryMen.restaurantId, restaurantId)
            )
        )
        .limit(1);

    if (!existing[0]) throw new NotFound("Delivery man not found or you don't have permission to delete it");

    await db.delete(deliveryMen).where(eq(deliveryMen.id, id));

    return SuccessResponse(res, { message: "Delivery man deleted successfully" });
};
