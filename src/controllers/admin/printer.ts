import { Request, Response } from "express";
import { db } from "../../models/connection";
import { printers, branches } from "../../models/schema";
import { eq, and, like, desc, count } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest, NotFound } from "../../Errors";
import { v4 as uuidv4 } from "uuid";

/**
 * Helper – resolves the authenticated restaurant ID from the request context.
 */
const getRestaurantId = (req: Request): string => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }
    return String(restaurantId);
};

// ==========================================
// 1. Create Printer
// POST /api/admin/printers
// ==========================================
export const createPrinter = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);

    const { name, ip, port, type, branchId, branch_id } = req.body;

    const resolvedBranchId: string | null = branchId || branch_id || null;

    // Validate branch if provided
    if (resolvedBranchId) {
        const [targetBranch] = await db
            .select()
            .from(branches)
            .where(and(eq(branches.id, resolvedBranchId), eq(branches.restaurantId, restaurantId)))
            .limit(1);

        if (!targetBranch) {
            throw new BadRequest(
                "Invalid branchId: branch not found or does not belong to your restaurant"
            );
        }
    }

    const id = uuidv4();
    await db.insert(printers).values({
        id,
        restaurantId,
        branchId: resolvedBranchId,
        name: name.trim(),
        ip: ip ? String(ip).trim() : null,
        port: port ? Number(port) : null,
        type: type as "usb" | "network",
    });

    const [created] = await db
        .select()
        .from(printers)
        .where(eq(printers.id, id))
        .limit(1);

    return SuccessResponse(res, { message: "Printer created successfully", data: created }, 201);
};

// ==========================================
// 2. Get All Printers (paginated + filtered)
// GET /api/admin/printers
// ==========================================
export const getAllPrinters = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);

    const page = Math.max(1, parseInt(String(req.query.page ?? 1), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? 10), 10)));
    const all = req.query.all === "true";
    const search = req.query.search ? String(req.query.search) : null;
    const typeFilter = req.query.type ? String(req.query.type) : null;
    const branchFilter =
        req.query.branchId || req.query.branch_id
            ? String(req.query.branchId || req.query.branch_id)
            : null;

    // Build where conditions
    const conditions: any[] = [eq(printers.restaurantId, restaurantId)];
    if (branchFilter) conditions.push(eq(printers.branchId, branchFilter));
    if (typeFilter && ["usb", "network"].includes(typeFilter)) {
        conditions.push(eq(printers.type, typeFilter as "usb" | "network"));
    }
    if (search) conditions.push(like(printers.name, `%${search}%`));

    const whereClause = and(...conditions);

    if (all) {
        const rows = await db
            .select()
            .from(printers)
            .where(whereClause)
            .orderBy(desc(printers.createdAt));

        return SuccessResponse(res, { data: rows, total: rows.length }, 200);
    }

    const offset = (page - 1) * limit;

    const [totalResult] = await db
        .select({ total: count() })
        .from(printers)
        .where(whereClause);

    const rows = await db
        .select()
        .from(printers)
        .where(whereClause)
        .orderBy(desc(printers.createdAt))
        .limit(limit)
        .offset(offset);

    return SuccessResponse(
        res,
        {
            data: rows,
            pagination: {
                page,
                limit,
                total: Number(totalResult?.total ?? 0),
                pages: Math.ceil(Number(totalResult?.total ?? 0) / limit),
            },
        },
        200
    );
};

// ==========================================
// 3. Get Printer by ID
// GET /api/admin/printers/:id
// ==========================================
export const getPrinterById = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);
    const { id } = req.params;

    const [printer] = await db
        .select()
        .from(printers)
        .where(and(eq(printers.id, id), eq(printers.restaurantId, restaurantId)))
        .limit(1);

    if (!printer) {
        throw new NotFound("Printer not found");
    }

    return SuccessResponse(res, { data: printer }, 200);
};

// ==========================================
// 4. Update Printer
// PUT /api/admin/printers/:id
// ==========================================
export const updatePrinter = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);
    const { id } = req.params;

    // Check existence
    const [existing] = await db
        .select()
        .from(printers)
        .where(and(eq(printers.id, id), eq(printers.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) {
        throw new NotFound("Printer not found");
    }

    const { name, ip, port, type, branchId, branch_id } = req.body;

    const resolvedBranchId: string | null | undefined =
        branchId !== undefined
            ? branchId || null
            : branch_id !== undefined
            ? branch_id || null
            : undefined;

    // Validate branch if it's being updated
    if (resolvedBranchId) {
        const [targetBranch] = await db
            .select()
            .from(branches)
            .where(
                and(
                    eq(branches.id, resolvedBranchId),
                    eq(branches.restaurantId, restaurantId)
                )
            )
            .limit(1);

        if (!targetBranch) {
            throw new BadRequest(
                "Invalid branchId: branch not found or does not belong to your restaurant"
            );
        }
    }

    const updateData: Record<string, any> = {
        updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name.trim();
    if (ip !== undefined) updateData.ip = ip ? String(ip).trim() : null;
    if (port !== undefined) updateData.port = port ? Number(port) : null;
    if (type !== undefined) updateData.type = type;
    if (resolvedBranchId !== undefined) updateData.branchId = resolvedBranchId;

    await db.update(printers).set(updateData).where(eq(printers.id, id));

    const [updated] = await db
        .select()
        .from(printers)
        .where(eq(printers.id, id))
        .limit(1);

    return SuccessResponse(res, { message: "Printer updated successfully", data: updated }, 200);
};

// ==========================================
// 5. Delete Printer
// DELETE /api/admin/printers/:id
// ==========================================
export const deletePrinter = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);
    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(printers)
        .where(and(eq(printers.id, id), eq(printers.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) {
        throw new NotFound("Printer not found");
    }

    await db.delete(printers).where(eq(printers.id, id));

    return SuccessResponse(res, { message: "Printer deleted successfully" }, 200);
};
