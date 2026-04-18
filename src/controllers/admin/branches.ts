// controllers/branch.controller.ts

import { Request, Response } from "express";
import { db } from "../../models/connection";
import { branches, zones } from "../../models/schema";
import { eq, and } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";

export const createBranch = async (req: Request, res: Response) => {
    // صاحب المطعم هو اللي بيكريت
    const restaurantId = req.user?.restaurantId || req.user?.id; 
    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    const { name, address, phoneNumber, zoneId } = req.body;

    if (!name || !address || !zoneId) {
        throw new BadRequest("Missing required fields (name, address, zoneId)");
    }

    // التأكد إن منطقة التوصيل دي موجودة
    const zoneExists = await db.select().from(zones).where(eq(zones.id, zoneId)).limit(1);
    if (!zoneExists[0]) throw new BadRequest("Zone not found");

    const id = uuidv4();

    await db.insert(branches).values({
        id,
        restaurantId,
        name,
        address,
        phoneNumber: phoneNumber || null,
        zoneId,
        status: "active"
    });

    return SuccessResponse(res, { message: "Branch created successfully", data: { id } }, 201);
};

export const getMyBranches = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    const myBranches = await db.select({
        id: branches.id,
        name: branches.name,
        address: branches.address,
        phoneNumber: branches.phoneNumber,
        status: branches.status,
        zone: {
            id: zones.id,
            name: zones.name
        }
    })
    .from(branches)
    .leftJoin(zones, eq(branches.zoneId, zones.id))
    .where(eq(branches.restaurantId, restaurantId));

    return SuccessResponse(res, { message: "Get branches success", data: myBranches });
};

export const getBranchById = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    const branch = await db.select({
        id: branches.id,
        name: branches.name,
        address: branches.address,
        phoneNumber: branches.phoneNumber,
        status: branches.status,
        zone: {
            id: zones.id,
            name: zones.name
        }
    })
    .from(branches)
    .leftJoin(zones, eq(branches.zoneId, zones.id))
    .where(
        and(
            eq(branches.id, id),
            eq(branches.restaurantId, restaurantId)
        )
    )
    .limit(1);

    if (!branch[0]) throw new NotFound("Branch not found or does not belong to your restaurant");

    return SuccessResponse(res, { message: "Get branch by id success", data: branch[0] });
};

export const updateBranch = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, address, phoneNumber, zoneId, status } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    const existingBranch = await db
        .select()
        .from(branches)
        .where(
            and(
                eq(branches.id, id),
                eq(branches.restaurantId, restaurantId)
            )
        )
        .limit(1);

    if (!existingBranch[0]) throw new NotFound("Branch not found or you don't have permission to edit it");

    const updateData: any = {};
    if (name) updateData.name = name;
    if (address) updateData.address = address;
    if (phoneNumber) updateData.phoneNumber = phoneNumber;
    if (zoneId) {
        const zoneExists = await db.select().from(zones).where(eq(zones.id, zoneId)).limit(1);
        if (!zoneExists[0]) throw new BadRequest("Zone not found");
        updateData.zoneId = zoneId;
    }
    if (status) updateData.status = status;

    await db
        .update(branches)
        .set(updateData)
        .where(eq(branches.id, id));

    return SuccessResponse(res, { message: "Branch updated successfully" });
};

export const deleteBranch = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    const existingBranch = await db
        .select()
        .from(branches)
        .where(
            and(
                eq(branches.id, id),
                eq(branches.restaurantId, restaurantId)
            )
        )
        .limit(1);

    if (!existingBranch[0]) throw new NotFound("Branch not found or you don't have permission to delete it");

    await db.delete(branches).where(eq(branches.id, id));

    return SuccessResponse(res, { message: "Branch deleted successfully" });
};


export const updateBranchStatus = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    const existingBranch = await db
        .select()
        .from(branches)
        .where(
            and(
                eq(branches.id, id),
                eq(branches.restaurantId, restaurantId)
            )
        )
        .limit(1);

    if (!existingBranch[0]) throw new NotFound("Branch not found or you don't have permission to edit it");

    await db
        .update(branches)
        .set({ status })
        .where(eq(branches.id, id));

    return SuccessResponse(res, { message: "Branch status updated successfully" });
};



export const getallzones = async (req: Request, res: Response) => {
    const zone = await db.select().from(zones).where(eq(zones.status, "active"));
    return SuccessResponse(res, { message: "Get zones success", data: zone });
};