import { Request, Response } from "express";
import { db } from "../../models/connection";
import { orderDelayAlertGroups, branches } from "../../models/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest, NotFound } from "../../Errors";
import { v4 as uuidv4 } from "uuid";

// Helper to enrich groups with branch information
async function enrichGroupsWithBranches(groups: (typeof orderDelayAlertGroups.$inferSelect)[]) {
    const allBranchIds = new Set<string>();
    for (const group of groups) {
        if (!group.allBranches && Array.isArray(group.branchIds)) {
            for (const bId of group.branchIds) {
                if (bId) allBranchIds.add(bId);
            }
        }
    }

    let branchMap = new Map<string, { id: string; name: string; nameAr?: string | null }>();
    if (allBranchIds.size > 0) {
        const branchList = await db
            .select({
                id: branches.id,
                name: branches.name,
                nameAr: branches.nameAr,
            })
            .from(branches)
            .where(inArray(branches.id, Array.from(allBranchIds)));

        for (const b of branchList) {
            branchMap.set(b.id, b);
        }
    }

    return groups.map((g) => {
        const branchesInfo = (!g.allBranches && Array.isArray(g.branchIds))
            ? g.branchIds.map((id) => branchMap.get(id) || { id, name: "Unknown" })
            : [];

        return {
            ...g,
            branches: branchesInfo,
        };
    });
}

// ==========================================
// 1. Create Alert Group
// ==========================================
export const createAlertGroup = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { name, emails, allBranches = true, branchIds = [], maxDelayMinutes, orderStatus = ["pending"], isActive = true } = req.body;

    const id = uuidv4();

    await db.insert(orderDelayAlertGroups).values({
        id,
        restaurantId,
        name: name.trim(),
        emails: Array.isArray(emails) ? emails : [emails],
        allBranches: Boolean(allBranches),
        branchIds: allBranches ? [] : (Array.isArray(branchIds) ? branchIds : []),
        maxDelayMinutes: Number(maxDelayMinutes),
        orderStatus: Array.isArray(orderStatus) && orderStatus.length > 0 ? orderStatus : ["pending"],
        isActive: Boolean(isActive),
    });

    const [created] = await db
        .select()
        .from(orderDelayAlertGroups)
        .where(eq(orderDelayAlertGroups.id, id))
        .limit(1);

    const [enriched] = await enrichGroupsWithBranches([created]);

    return SuccessResponse(
        res,
        {
            message: "تم إنشاء مجموعة تنبيه التأخير بنجاح",
            data: enriched,
        },
        201
    );
};

// ==========================================
// 2. Get All Alert Groups
// ==========================================
export const getAllAlertGroups = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const groups = await db
        .select()
        .from(orderDelayAlertGroups)
        .where(eq(orderDelayAlertGroups.restaurantId, restaurantId))
        .orderBy(desc(orderDelayAlertGroups.createdAt));

    const enriched = await enrichGroupsWithBranches(groups);

    return SuccessResponse(res, {
        message: "تم جلب مجموعات تنبيه التأخير بنجاح",
        data: enriched,
    });
};

// ==========================================
// 3. Get Alert Group By ID
// ==========================================
export const getAlertGroupById = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [group] = await db
        .select()
        .from(orderDelayAlertGroups)
        .where(
            and(
                eq(orderDelayAlertGroups.id, id),
                eq(orderDelayAlertGroups.restaurantId, restaurantId)
            )
        )
        .limit(1);

    if (!group) {
        throw new NotFound("مجموعة التنبيه غير موجودة");
    }

    const [enriched] = await enrichGroupsWithBranches([group]);

    return SuccessResponse(res, {
        message: "تم جلب تفاصيل مجموعة التنبيه بنجاح",
        data: enriched,
    });
};

// ==========================================
// 4. Update Alert Group
// ==========================================
export const updateAlertGroup = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(orderDelayAlertGroups)
        .where(
            and(
                eq(orderDelayAlertGroups.id, id),
                eq(orderDelayAlertGroups.restaurantId, restaurantId)
            )
        )
        .limit(1);

    if (!existing) {
        throw new NotFound("مجموعة التنبيه غير موجودة");
    }

    const { name, emails, allBranches, branchIds, maxDelayMinutes, orderStatus, isActive } = req.body;

    const updateData: Partial<typeof orderDelayAlertGroups.$inferInsert> = {};

    if (name !== undefined) updateData.name = name.trim();
    if (emails !== undefined) updateData.emails = Array.isArray(emails) ? emails : [emails];
    if (allBranches !== undefined) {
        updateData.allBranches = Boolean(allBranches);
        if (allBranches === true) {
            updateData.branchIds = [];
        }
    }
    if (branchIds !== undefined && updateData.allBranches !== true) {
        updateData.branchIds = Array.isArray(branchIds) ? branchIds : [];
    }
    if (maxDelayMinutes !== undefined) updateData.maxDelayMinutes = Number(maxDelayMinutes);
    if (orderStatus !== undefined) {
        updateData.orderStatus = Array.isArray(orderStatus) && orderStatus.length > 0 ? orderStatus : ["pending"];
    }
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    await db
        .update(orderDelayAlertGroups)
        .set(updateData)
        .where(
            and(
                eq(orderDelayAlertGroups.id, id),
                eq(orderDelayAlertGroups.restaurantId, restaurantId)
            )
        );

    const [updated] = await db
        .select()
        .from(orderDelayAlertGroups)
        .where(eq(orderDelayAlertGroups.id, id))
        .limit(1);

    const [enriched] = await enrichGroupsWithBranches([updated]);

    return SuccessResponse(res, {
        message: "تم تحديث مجموعة التنبيه بنجاح",
        data: enriched,
    });
};

// ==========================================
// 5. Toggle Alert Group Status
// ==========================================
export const toggleAlertGroupStatus = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(orderDelayAlertGroups)
        .where(
            and(
                eq(orderDelayAlertGroups.id, id),
                eq(orderDelayAlertGroups.restaurantId, restaurantId)
            )
        )
        .limit(1);

    if (!existing) {
        throw new NotFound("مجموعة التنبيه غير موجودة");
    }

    const newStatus = !existing.isActive;

    await db
        .update(orderDelayAlertGroups)
        .set({ isActive: newStatus })
        .where(eq(orderDelayAlertGroups.id, id));

    return SuccessResponse(res, {
        message: newStatus ? "تم تفعيل مجموعة التنبيه" : "تم تعطيل مجموعة التنبيه",
        data: { id, isActive: newStatus },
    });
};

// ==========================================
// 6. Delete Alert Group
// ==========================================
export const deleteAlertGroup = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(orderDelayAlertGroups)
        .where(
            and(
                eq(orderDelayAlertGroups.id, id),
                eq(orderDelayAlertGroups.restaurantId, restaurantId)
            )
        )
        .limit(1);

    if (!existing) {
        throw new NotFound("مجموعة التنبيه غير موجودة");
    }

    await db
        .delete(orderDelayAlertGroups)
        .where(eq(orderDelayAlertGroups.id, id));

    return SuccessResponse(res, {
        message: "تم حذف مجموعة التنبيه بنجاح",
        data: { id },
    });
};
