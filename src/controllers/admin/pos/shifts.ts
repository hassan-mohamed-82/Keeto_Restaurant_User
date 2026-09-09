import { Request, Response } from "express";
import { db } from "../../../models/connection";
import { shifts, branches } from "../../../models/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { SuccessResponse } from "../../../utils/response";
import { BadRequest, NotFound } from "../../../Errors";
import { v4 as uuidv4 } from "uuid";
import { extractLang, getLocalizedName, Language } from "../../../helpers/localization.helper";

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

/**
 * Helper to enrich shifts with localized branch details
 */
async function enrichShiftsWithBranches<
    T extends { branchId: string; name: string; nameAr?: string | null; nameFr?: string | null }
>(items: T[], restaurantId: string, lang: Language = "en") {
    if (items.length === 0) return items;

    const branchIds = Array.from(new Set(items.map((i) => i.branchId).filter(Boolean)));
    const branchList =
        branchIds.length > 0
            ? await db
                  .select({
                      id: branches.id,
                      name: branches.name,
                      nameAr: branches.nameAr,
                      nameFr: branches.nameFr,
                  })
                  .from(branches)
                  .where(
                      and(
                          eq(branches.restaurantId, restaurantId),
                          inArray(branches.id, branchIds)
                      )
                  )
            : [];

    const branchMap = new Map<
        string,
        { id: string; name: string; nameAr: string | null; nameFr: string | null }
    >();
    for (const b of branchList) {
        branchMap.set(b.id, b);
    }

    return items.map((item) => {
        const branchObj = branchMap.get(item.branchId);
        return {
            ...item,
            name: getLocalizedName(item, lang),
            branch: branchObj
                ? {
                      id: branchObj.id,
                      name: getLocalizedName(branchObj, lang),
                      nameAr: branchObj.nameAr,
                      nameFr: branchObj.nameFr,
                  }
                : null,
        };
    });
}

// ==========================================
// 1. Create Shift
// ==========================================
export const createShift = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const { name, nameAr, nameFr, branchId, branch_id, from, to, status } = req.body;
    const finalBranchId = branchId || branch_id;

    if (!name || !from || !to || !finalBranchId) {
        throw new BadRequest("Missing required fields: name, branch_id, from, to");
    }

    // Verify branch belongs to this restaurant
    const [branchCheck] = await db
        .select({ id: branches.id })
        .from(branches)
        .where(and(eq(branches.id, finalBranchId), eq(branches.restaurantId, restaurantId)))
        .limit(1);

    if (!branchCheck) {
        throw new BadRequest("Selected branch does not belong to this restaurant or does not exist");
    }

    // Auto-calculate isTomorrow: true if to < from, else false
    const isTomorrow = calculateIsTomorrow(from, to);

    const id = uuidv4();
    await db.insert(shifts).values({
        id,
        restaurantId,
        branchId: finalBranchId,
        name,
        nameAr: nameAr || null,
        nameFr: nameFr || null,
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

    const [enriched] = await enrichShiftsWithBranches([createdShift], restaurantId, lang);

    return SuccessResponse(
        res,
        {
            message: "Shift created successfully",
            data: enriched || createdShift,
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

    const lang = extractLang(req);
    const { status, branchId, branch_id } = req.query;
    const targetBranchId = branchId || branch_id;

    const conditions = [eq(shifts.restaurantId, restaurantId)];
    if (status && (status === "active" || status === "inactive")) {
        conditions.push(eq(shifts.status, status));
    }
    if (targetBranchId && typeof targetBranchId === "string") {
        conditions.push(eq(shifts.branchId, targetBranchId));
    }

    const allShifts = await db
        .select()
        .from(shifts)
        .where(and(...conditions))
        .orderBy(desc(shifts.createdAt));

    const enrichedList = await enrichShiftsWithBranches(allShifts, restaurantId, lang);

    return SuccessResponse(res, {
        message: "Shifts fetched successfully",
        data: enrichedList,
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

    const lang = extractLang(req);
    const { id } = req.params;

    const [shift] = await db
        .select()
        .from(shifts)
        .where(and(eq(shifts.id, id), eq(shifts.restaurantId, restaurantId)))
        .limit(1);

    if (!shift) {
        throw new NotFound("Shift not found");
    }

    const [enriched] = await enrichShiftsWithBranches([shift], restaurantId, lang);

    return SuccessResponse(res, {
        message: "Shift fetched successfully",
        data: enriched || shift,
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

    const lang = extractLang(req);
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

    const { name, nameAr, nameFr, branchId, branch_id, from, to, status } = req.body;
    const finalBranchId = branchId || branch_id;

    if (finalBranchId) {
        const [branchCheck] = await db
            .select({ id: branches.id })
            .from(branches)
            .where(and(eq(branches.id, finalBranchId), eq(branches.restaurantId, restaurantId)))
            .limit(1);

        if (!branchCheck) {
            throw new BadRequest("Selected branch does not belong to this restaurant or does not exist");
        }
    }

    const newFrom = from !== undefined ? from : existingShift.from;
    const newTo = to !== undefined ? to : existingShift.to;

    // Recalculate isTomorrow if from or to was provided
    const isTomorrow = calculateIsTomorrow(newFrom, newTo);

    await db
        .update(shifts)
        .set({
            ...(name !== undefined && { name }),
            ...(nameAr !== undefined && { nameAr }),
            ...(nameFr !== undefined && { nameFr }),
            ...(finalBranchId !== undefined && { branchId: finalBranchId }),
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

    const [enriched] = await enrichShiftsWithBranches([updatedShift], restaurantId, lang);

    return SuccessResponse(res, {
        message: "Shift updated successfully",
        data: enriched || updatedShift,
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

// ==========================================
// 7. Get Branches (Localized by lang en, ar, fr with fallback to en)
// ==========================================
export const getBranches = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);

    const myBranches = await db
        .select({
            id: branches.id,
            name: branches.name,
            nameAr: branches.nameAr,
            nameFr: branches.nameFr,
        })
        .from(branches)
        .where(
            and(
                eq(branches.restaurantId, restaurantId),
                eq(branches.status, "active")
            )
        );

    const formatted = myBranches.map((b) => ({
        id: b.id,
        name: getLocalizedName(b, lang),
    }));

    return SuccessResponse(res, {
        message: "Branches fetched successfully",
        data: formatted,
    });
};
