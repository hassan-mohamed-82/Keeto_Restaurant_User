import { Request, Response } from "express";
import { db } from "../../../models/connection";
import { shifts } from "../../../models/schema";
import { eq, and, desc } from "drizzle-orm";
import { SuccessResponse } from "../../../utils/response";
import { BadRequest, NotFound } from "../../../Errors";
import { v4 as uuidv4 } from "uuid";

/**
 * Calculates whether the shift spans to the next day.
 * Returns true if `to < from`, otherwise false.
 */
export const calculateIsTomorrow = (fromTime: string, toTime: string): boolean => {
    const toMinutes = (timeStr: string): number => {
        const parts = timeStr.split(":").map(Number);
        const hours = parts[0] || 0;
        const minutes = parts[1] || 0;
        return hours * 60 + minutes;
    };
    return toMinutes(toTime) < toMinutes(fromTime);
};

// ==========================================
// 1. Create Shift
// ==========================================
export const createShift = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { name, from, to, status } = req.body;

    if (!name || !from || !to) {
        throw new BadRequest("Missing required fields: name, from, to");
    }

    // Auto-calculate isTomorrow: true if to < from, else false
    const isTomorrow = calculateIsTomorrow(from, to);

    const id = uuidv4();
    await db.insert(shifts).values({
        id,
        restaurantId,
        name,
        from,
        to,
        isTomorrow,
        status: status || "active",
    });

    const [createdShift] = await db
        .select()
        .from(shifts)
        .where(eq(shifts.id, id))
        .limit(1);

    return SuccessResponse(
        res,
        {
            message: "Shift created successfully",
            data: createdShift,
        },
        201
    );
};

// ==========================================
// 2. Get All Shifts (Restaurant Scoped)
// ==========================================
export const getAllShifts = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { status } = req.query;

    const conditions = [eq(shifts.restaurantId, restaurantId)];
    if (status && (status === "active" || status === "inactive")) {
        conditions.push(eq(shifts.status, status));
    }

    const allShifts = await db
        .select()
        .from(shifts)
        .where(and(...conditions))
        .orderBy(desc(shifts.createdAt));

    return SuccessResponse(res, {
        message: "Shifts fetched successfully",
        data: allShifts,
    });
};

// ==========================================
// 3. Get Shift By ID
// ==========================================
export const getShiftById = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [shift] = await db
        .select()
        .from(shifts)
        .where(and(eq(shifts.id, id), eq(shifts.restaurantId, restaurantId)))
        .limit(1);

    if (!shift) {
        throw new NotFound("Shift not found");
    }

    return SuccessResponse(res, {
        message: "Shift fetched successfully",
        data: shift,
    });
};

// ==========================================
// 4. Update Shift
// ==========================================
export const updateShift = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    // Check if shift exists and belongs to this restaurant
    const [existingShift] = await db
        .select()
        .from(shifts)
        .where(and(eq(shifts.id, id), eq(shifts.restaurantId, restaurantId)))
        .limit(1);

    if (!existingShift) {
        throw new NotFound("Shift not found");
    }

    const { name, from, to, status } = req.body;

    const newFrom = from !== undefined ? from : existingShift.from;
    const newTo = to !== undefined ? to : existingShift.to;

    // Recalculate isTomorrow if from or to was provided
    const isTomorrow = calculateIsTomorrow(newFrom, newTo);

    await db
        .update(shifts)
        .set({
            ...(name !== undefined && { name }),
            ...(from !== undefined && { from }),
            ...(to !== undefined && { to }),
            ...(status !== undefined && { status }),
            isTomorrow,
        })
        .where(and(eq(shifts.id, id), eq(shifts.restaurantId, restaurantId)));

    const [updatedShift] = await db
        .select()
        .from(shifts)
        .where(and(eq(shifts.id, id), eq(shifts.restaurantId, restaurantId)))
        .limit(1);

    return SuccessResponse(res, {
        message: "Shift updated successfully",
        data: updatedShift,
    });
};

// ==========================================
// 5. Delete Shift
// ==========================================
export const deleteShift = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existingShift] = await db
        .select()
        .from(shifts)
        .where(and(eq(shifts.id, id), eq(shifts.restaurantId, restaurantId)))
        .limit(1);

    if (!existingShift) {
        throw new NotFound("Shift not found");
    }

    await db
        .delete(shifts)
        .where(and(eq(shifts.id, id), eq(shifts.restaurantId, restaurantId)));

    return SuccessResponse(res, {
        message: "Shift deleted successfully",
    });
};

// ==========================================
// 6. Toggle Shift Status (Active / Inactive)
// ==========================================
export const toggleShiftStatus = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existingShift] = await db
        .select()
        .from(shifts)
        .where(and(eq(shifts.id, id), eq(shifts.restaurantId, restaurantId)))
        .limit(1);

    if (!existingShift) {
        throw new NotFound("Shift not found");
    }

    const newStatus = existingShift.status === "active" ? "inactive" : "active";

    await db
        .update(shifts)
        .set({ status: newStatus })
        .where(and(eq(shifts.id, id), eq(shifts.restaurantId, restaurantId)));

    return SuccessResponse(res, {
        message: `Shift status changed to ${newStatus}`,
        data: { id, status: newStatus },
    });
};
