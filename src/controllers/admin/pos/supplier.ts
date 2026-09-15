import { Request, Response } from "express";
import { db } from "../../../models/connection";
import { suppliers } from "../../../models/schema";
import { eq, and, desc, count, or, like } from "drizzle-orm";
import { SuccessResponse } from "../../../utils/response";
import { BadRequest, NotFound } from "../../../Errors";
import { v4 as uuidv4 } from "uuid";

// ==========================================
// 1. Create Supplier (balance can be set at add)
// ==========================================
export const createSupplier = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { name, email, phone, balance, status } = req.body;

    const id = uuidv4();
    await db.insert(suppliers).values({
        id,
        restaurantId,
        name,
        email: email || null,
        phone,
        balance: balance !== undefined ? String(balance) : "0.00",
        status: status !== undefined ? Boolean(status) : true,
    });

    const [created] = await db
        .select()
        .from(suppliers)
        .where(eq(suppliers.id, id))
        .limit(1);

    return SuccessResponse(
        res,
        {
            message: "Supplier created successfully",
            data: created,
        },
        201
    );
};

// ==========================================
// 2. Get All Suppliers (Paginated & Filtered)
// ==========================================
export const getAllSuppliers = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const params = { ...req.query, ...req.body };
    const { search, status, all } = params;

    const page = Math.max(1, parseInt(params.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(params.limit as string) || 10));
    const offset = (page - 1) * limit;

    const conditions = [eq(suppliers.restaurantId, restaurantId)];

    if (status !== undefined && status !== "") {
        const boolStatus = status === true || status === "true" || status === 1 || status === "1";
        conditions.push(eq(suppliers.status, boolStatus));
    }

    if (search && typeof search === "string" && search.trim() !== "") {
        const term = `%${search.trim()}%`;
        conditions.push(
            or(
                like(suppliers.name, term),
                like(suppliers.phone, term),
                like(suppliers.email, term)
            ) as any
        );
    }

    const isAll = all === "true" || all === true;

    const [totalCountResult, supplierList] = await Promise.all([
        db
            .select({ count: count() })
            .from(suppliers)
            .where(and(...conditions)),
        isAll
            ? db
                  .select()
                  .from(suppliers)
                  .where(and(...conditions))
                  .orderBy(desc(suppliers.createdAt))
            : db
                  .select()
                  .from(suppliers)
                  .where(and(...conditions))
                  .orderBy(desc(suppliers.createdAt))
                  .limit(limit)
                  .offset(offset),
    ]);

    const totalItems = Number(totalCountResult[0]?.count || 0);
    const totalPages = isAll ? 1 : Math.ceil(totalItems / limit);

    return SuccessResponse(res, {
        message: "Suppliers fetched successfully",
        data: supplierList,
        pagination: {
            page: isAll ? 1 : page,
            limit: isAll ? totalItems : limit,
            totalItems,
            totalPages,
        },
    });
};

// ==========================================
// 3. Get Supplier By ID
// ==========================================
export const getSupplierById = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [supplier] = await db
        .select()
        .from(suppliers)
        .where(and(eq(suppliers.id, id), eq(suppliers.restaurantId, restaurantId)))
        .limit(1);

    if (!supplier) {
        throw new NotFound("Supplier not found");
    }

    return SuccessResponse(res, {
        message: "Supplier fetched successfully",
        data: supplier,
    });
};

// ==========================================
// 4. Update Supplier (BALANCE IS STRICTLY NOT UPDATED)
// ==========================================
export const updateSupplier = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(suppliers)
        .where(and(eq(suppliers.id, id), eq(suppliers.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) {
        throw new NotFound("Supplier not found");
    }

    const { name, email, phone, status } = req.body;

    const updateData: Partial<typeof suppliers.$inferInsert> = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email || null;
    if (phone !== undefined) updateData.phone = phone;
    if (status !== undefined) updateData.status = Boolean(status);

    // Notice: balance is explicitly excluded and NOT updated!

    if (Object.keys(updateData).length > 0) {
        await db
            .update(suppliers)
            .set(updateData)
            .where(and(eq(suppliers.id, id), eq(suppliers.restaurantId, restaurantId)));
    }

    const [updated] = await db
        .select()
        .from(suppliers)
        .where(and(eq(suppliers.id, id), eq(suppliers.restaurantId, restaurantId)))
        .limit(1);

    return SuccessResponse(res, {
        message: "Supplier updated successfully",
        data: updated,
    });
};

// ==========================================
// 5. Delete Supplier
// ==========================================
export const deleteSupplier = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(suppliers)
        .where(and(eq(suppliers.id, id), eq(suppliers.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) {
        throw new NotFound("Supplier not found");
    }

    await db
        .delete(suppliers)
        .where(and(eq(suppliers.id, id), eq(suppliers.restaurantId, restaurantId)));

    return SuccessResponse(res, {
        message: "Supplier deleted successfully",
    });
};

// ==========================================
// 6. Toggle Supplier Status
// ==========================================
export const toggleSupplierStatus = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(suppliers)
        .where(and(eq(suppliers.id, id), eq(suppliers.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) {
        throw new NotFound("Supplier not found");
    }

    const newStatus = !existing.status;

    await db
        .update(suppliers)
        .set({ status: newStatus })
        .where(and(eq(suppliers.id, id), eq(suppliers.restaurantId, restaurantId)));

    return SuccessResponse(res, {
        message: `Supplier status changed to ${newStatus ? "active" : "inactive"}`,
        data: { id, status: newStatus },
    });
};
