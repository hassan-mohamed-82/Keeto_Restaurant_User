import { Request, Response } from "express";
import { db } from "../../models/connection";
import {
    firstOrderDiscounts,
    firstOrderDiscountUsages,
} from "../../models/schema";
import { eq, and, sql } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";

// =====================================================================
// Helper — get restaurantId from JWT
// =====================================================================
const getRestaurantId = (req: Request): string => {
    const id = req.user?.restaurantId || req.user?.id;
    if (!id) throw new BadRequest("Unauthorized");
    return id;
};

// =====================================================================
// 1. Create First-Order Discount
// POST /admin/first-order-discounts
// =====================================================================
export const createFirstOrderDiscount = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);

    const {
        name, nameAr, nameFr,
        firstOrderCount,
        discountType, discountValue,
        maxDiscountAmount,
        maxUsage, maxUsagePerUser,
        startDate, endDate,
        status,
    } = req.body;

    const id = uuidv4();

    await db.insert(firstOrderDiscounts).values({
        id,
        name,
        nameAr: nameAr ?? null,
        nameFr: nameFr ?? null,
        restaurantId,
        firstOrderCount: Number(firstOrderCount),
        discountType,
        discountValue: String(discountValue),
        maxDiscountAmount: maxDiscountAmount ? String(maxDiscountAmount) : null,
        maxUsage: maxUsage ? Number(maxUsage) : null,
        usedCount: 0,
        maxUsagePerUser: maxUsagePerUser ? Number(maxUsagePerUser) : 1,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        status: status ?? "active",
    });

    return SuccessResponse(res, {
        message: "First-order discount created successfully",
        data: { id },
    }, 201);
};

// =====================================================================
// 2. Get All First-Order Discounts for this Restaurant
// GET /admin/first-order-discounts
// =====================================================================
export const getAllFirstOrderDiscounts = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);

    const data = await db
        .select()
        .from(firstOrderDiscounts)
        .where(eq(firstOrderDiscounts.restaurantId, restaurantId));

    return SuccessResponse(res, { message: "Fetched successfully", data });
};

// =====================================================================
// 3. Get Single First-Order Discount by ID
// GET /admin/first-order-discounts/:id
// =====================================================================
export const getFirstOrderDiscountById = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);
    const { id } = req.params;

    const [data] = await db
        .select()
        .from(firstOrderDiscounts)
        .where(
            and(
                eq(firstOrderDiscounts.id, id),
                eq(firstOrderDiscounts.restaurantId, restaurantId),
            )
        )
        .limit(1);

    if (!data) throw new NotFound("First-order discount not found");

    return SuccessResponse(res, { message: "Fetched successfully", data });
};

// =====================================================================
// 4. Update First-Order Discount
// PUT /admin/first-order-discounts/:id
// =====================================================================
export const updateFirstOrderDiscount = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);
    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(firstOrderDiscounts)
        .where(
            and(
                eq(firstOrderDiscounts.id, id),
                eq(firstOrderDiscounts.restaurantId, restaurantId),
            )
        )
        .limit(1);

    if (!existing) throw new NotFound("First-order discount not found or unauthorized");

    const {
        name, nameAr, nameFr,
        firstOrderCount,
        discountType, discountValue,
        maxDiscountAmount,
        maxUsage, maxUsagePerUser,
        startDate, endDate,
        status,
    } = req.body;

    const updateData: Record<string, any> = { updatedAt: new Date() };

    if (name !== undefined) updateData.name = name;
    if (nameAr !== undefined) updateData.nameAr = nameAr;
    if (nameFr !== undefined) updateData.nameFr = nameFr;
    if (firstOrderCount !== undefined) updateData.firstOrderCount = Number(firstOrderCount);
    if (discountType !== undefined) updateData.discountType = discountType;
    if (discountValue !== undefined) updateData.discountValue = String(discountValue);
    if (maxDiscountAmount !== undefined) updateData.maxDiscountAmount = maxDiscountAmount ? String(maxDiscountAmount) : null;
    if (maxUsage !== undefined) updateData.maxUsage = maxUsage ? Number(maxUsage) : null;
    if (maxUsagePerUser !== undefined) updateData.maxUsagePerUser = Number(maxUsagePerUser);
    if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
    if (status !== undefined) updateData.status = status;

    await db.update(firstOrderDiscounts).set(updateData).where(eq(firstOrderDiscounts.id, id));

    return SuccessResponse(res, { message: "First-order discount updated successfully" });
};

// =====================================================================
// 5. Delete First-Order Discount
// DELETE /admin/first-order-discounts/:id
// =====================================================================
export const deleteFirstOrderDiscount = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);
    const { id } = req.params;

    const [existing] = await db
        .select({ id: firstOrderDiscounts.id })
        .from(firstOrderDiscounts)
        .where(
            and(
                eq(firstOrderDiscounts.id, id),
                eq(firstOrderDiscounts.restaurantId, restaurantId),
            )
        )
        .limit(1);

    if (!existing) throw new NotFound("First-order discount not found or unauthorized");

    // cascade will delete usages automatically (ON DELETE CASCADE)
    await db.delete(firstOrderDiscounts).where(eq(firstOrderDiscounts.id, id));

    return SuccessResponse(res, { message: "First-order discount deleted successfully" });
};

// =====================================================================
// 6. Toggle Status (active ↔ inactive)
// PATCH /admin/first-order-discounts/:id/toggle-status
// =====================================================================
export const toggleFirstOrderDiscountStatus = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);
    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(firstOrderDiscounts)
        .where(
            and(
                eq(firstOrderDiscounts.id, id),
                eq(firstOrderDiscounts.restaurantId, restaurantId),
            )
        )
        .limit(1);

    if (!existing) throw new NotFound("First-order discount not found or unauthorized");

    const newStatus: "active" | "inactive" = existing.status === "active" ? "inactive" : "active";

    await db
        .update(firstOrderDiscounts)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(firstOrderDiscounts.id, id));

    return SuccessResponse(res, {
        message: `First-order discount ${newStatus === "active" ? "activated" : "deactivated"} successfully`,
        data: { status: newStatus },
    });
};

// =====================================================================
// 7. Get Usage History for a Discount
// GET /admin/first-order-discounts/:id/usages
// =====================================================================
export const getFirstOrderDiscountUsages = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);
    const { id } = req.params;

    const [existing] = await db
        .select({ id: firstOrderDiscounts.id })
        .from(firstOrderDiscounts)
        .where(
            and(
                eq(firstOrderDiscounts.id, id),
                eq(firstOrderDiscounts.restaurantId, restaurantId),
            )
        )
        .limit(1);

    if (!existing) throw new NotFound("First-order discount not found or unauthorized");

    const usages = await db
        .select()
        .from(firstOrderDiscountUsages)
        .where(eq(firstOrderDiscountUsages.firstOrderDiscountId, id));

    return SuccessResponse(res, {
        message: "Usage history fetched successfully",
        data: usages,
    });
};
