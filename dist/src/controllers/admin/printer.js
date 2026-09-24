"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletePrinter = exports.updatePrinter = exports.getPrinterById = exports.getAllPrinters = exports.createPrinter = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const Errors_1 = require("../../Errors");
const uuid_1 = require("uuid");
/**
 * Helper – resolves the authenticated restaurant ID from the request context.
 */
const getRestaurantId = (req) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    return String(restaurantId);
};
// ==========================================
// 1. Create Printer
// POST /api/admin/printers
// ==========================================
const createPrinter = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const { name, ip, port, type, branchId, branch_id } = req.body;
    const resolvedBranchId = branchId || branch_id || null;
    // Validate branch if provided
    if (resolvedBranchId) {
        const [targetBranch] = await connection_1.db
            .select()
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.id, resolvedBranchId), (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId)))
            .limit(1);
        if (!targetBranch) {
            throw new Errors_1.BadRequest("Invalid branchId: branch not found or does not belong to your restaurant");
        }
    }
    const id = (0, uuid_1.v4)();
    await connection_1.db.insert(schema_1.printers).values({
        id,
        restaurantId,
        branchId: resolvedBranchId,
        name: name.trim(),
        ip: ip ? String(ip).trim() : null,
        port: port ? Number(port) : null,
        type: type,
    });
    const [created] = await connection_1.db
        .select()
        .from(schema_1.printers)
        .where((0, drizzle_orm_1.eq)(schema_1.printers.id, id))
        .limit(1);
    return (0, response_1.SuccessResponse)(res, { message: "Printer created successfully", data: created }, 201);
};
exports.createPrinter = createPrinter;
// ==========================================
// 2. Get All Printers (paginated + filtered)
// GET /api/admin/printers
// ==========================================
const getAllPrinters = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const page = Math.max(1, parseInt(String(req.query.page ?? 1), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? 10), 10)));
    const all = req.query.all === "true";
    const search = req.query.search ? String(req.query.search) : null;
    const typeFilter = req.query.type ? String(req.query.type) : null;
    const branchFilter = req.query.branchId || req.query.branch_id
        ? String(req.query.branchId || req.query.branch_id)
        : null;
    // Build where conditions
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.printers.restaurantId, restaurantId)];
    if (branchFilter)
        conditions.push((0, drizzle_orm_1.eq)(schema_1.printers.branchId, branchFilter));
    if (typeFilter && ["usb", "network"].includes(typeFilter)) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.printers.type, typeFilter));
    }
    if (search)
        conditions.push((0, drizzle_orm_1.like)(schema_1.printers.name, `%${search}%`));
    const whereClause = (0, drizzle_orm_1.and)(...conditions);
    if (all) {
        const rows = await connection_1.db
            .select()
            .from(schema_1.printers)
            .where(whereClause)
            .orderBy((0, drizzle_orm_1.desc)(schema_1.printers.createdAt));
        return (0, response_1.SuccessResponse)(res, { data: rows, total: rows.length }, 200);
    }
    const offset = (page - 1) * limit;
    const [totalResult] = await connection_1.db
        .select({ total: (0, drizzle_orm_1.count)() })
        .from(schema_1.printers)
        .where(whereClause);
    const rows = await connection_1.db
        .select()
        .from(schema_1.printers)
        .where(whereClause)
        .orderBy((0, drizzle_orm_1.desc)(schema_1.printers.createdAt))
        .limit(limit)
        .offset(offset);
    return (0, response_1.SuccessResponse)(res, {
        data: rows,
        pagination: {
            page,
            limit,
            total: Number(totalResult?.total ?? 0),
            pages: Math.ceil(Number(totalResult?.total ?? 0) / limit),
        },
    }, 200);
};
exports.getAllPrinters = getAllPrinters;
// ==========================================
// 3. Get Printer by ID
// GET /api/admin/printers/:id
// ==========================================
const getPrinterById = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const { id } = req.params;
    const [printer] = await connection_1.db
        .select()
        .from(schema_1.printers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.printers.id, id), (0, drizzle_orm_1.eq)(schema_1.printers.restaurantId, restaurantId)))
        .limit(1);
    if (!printer) {
        throw new Errors_1.NotFound("Printer not found");
    }
    return (0, response_1.SuccessResponse)(res, { data: printer }, 200);
};
exports.getPrinterById = getPrinterById;
// ==========================================
// 4. Update Printer
// PUT /api/admin/printers/:id
// ==========================================
const updatePrinter = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const { id } = req.params;
    // Check existence
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.printers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.printers.id, id), (0, drizzle_orm_1.eq)(schema_1.printers.restaurantId, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Printer not found");
    }
    const { name, ip, port, type, branchId, branch_id } = req.body;
    const resolvedBranchId = branchId !== undefined
        ? branchId || null
        : branch_id !== undefined
            ? branch_id || null
            : undefined;
    // Validate branch if it's being updated
    if (resolvedBranchId) {
        const [targetBranch] = await connection_1.db
            .select()
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.id, resolvedBranchId), (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId)))
            .limit(1);
        if (!targetBranch) {
            throw new Errors_1.BadRequest("Invalid branchId: branch not found or does not belong to your restaurant");
        }
    }
    const updateData = {
        updatedAt: new Date(),
    };
    if (name !== undefined)
        updateData.name = name.trim();
    if (ip !== undefined)
        updateData.ip = ip ? String(ip).trim() : null;
    if (port !== undefined)
        updateData.port = port ? Number(port) : null;
    if (type !== undefined)
        updateData.type = type;
    if (resolvedBranchId !== undefined)
        updateData.branchId = resolvedBranchId;
    await connection_1.db.update(schema_1.printers).set(updateData).where((0, drizzle_orm_1.eq)(schema_1.printers.id, id));
    const [updated] = await connection_1.db
        .select()
        .from(schema_1.printers)
        .where((0, drizzle_orm_1.eq)(schema_1.printers.id, id))
        .limit(1);
    return (0, response_1.SuccessResponse)(res, { message: "Printer updated successfully", data: updated }, 200);
};
exports.updatePrinter = updatePrinter;
// ==========================================
// 5. Delete Printer
// DELETE /api/admin/printers/:id
// ==========================================
const deletePrinter = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.printers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.printers.id, id), (0, drizzle_orm_1.eq)(schema_1.printers.restaurantId, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Printer not found");
    }
    await connection_1.db.delete(schema_1.printers).where((0, drizzle_orm_1.eq)(schema_1.printers.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Printer deleted successfully" }, 200);
};
exports.deletePrinter = deletePrinter;
