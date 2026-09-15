"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toggleSupplierStatus = exports.deleteSupplier = exports.updateSupplier = exports.getSupplierById = exports.getAllSuppliers = exports.createSupplier = void 0;
const connection_1 = require("../../../models/connection");
const schema_1 = require("../../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../../utils/response");
const Errors_1 = require("../../../Errors");
const uuid_1 = require("uuid");
// ==========================================
// 1. Create Supplier (balance can be set at add)
// ==========================================
const createSupplier = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { name, email, phone, balance, status } = req.body;
    const id = (0, uuid_1.v4)();
    await connection_1.db.insert(schema_1.suppliers).values({
        id,
        restaurantId,
        name,
        email: email || null,
        phone,
        balance: balance !== undefined ? String(balance) : "0.00",
        status: status !== undefined ? Boolean(status) : true,
    });
    const [created] = await connection_1.db
        .select()
        .from(schema_1.suppliers)
        .where((0, drizzle_orm_1.eq)(schema_1.suppliers.id, id))
        .limit(1);
    return (0, response_1.SuccessResponse)(res, {
        message: "Supplier created successfully",
        data: created,
    }, 201);
};
exports.createSupplier = createSupplier;
// ==========================================
// 2. Get All Suppliers (Paginated & Filtered)
// ==========================================
const getAllSuppliers = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const params = { ...req.query, ...req.body };
    const { search, status, all } = params;
    const page = Math.max(1, parseInt(params.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(params.limit) || 10));
    const offset = (page - 1) * limit;
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.suppliers.restaurantId, restaurantId)];
    if (status !== undefined && status !== "") {
        const boolStatus = status === true || status === "true" || status === 1 || status === "1";
        conditions.push((0, drizzle_orm_1.eq)(schema_1.suppliers.status, boolStatus));
    }
    if (search && typeof search === "string" && search.trim() !== "") {
        const term = `%${search.trim()}%`;
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(schema_1.suppliers.name, term), (0, drizzle_orm_1.like)(schema_1.suppliers.phone, term), (0, drizzle_orm_1.like)(schema_1.suppliers.email, term)));
    }
    const isAll = all === "true" || all === true;
    const [totalCountResult, supplierList] = await Promise.all([
        connection_1.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema_1.suppliers)
            .where((0, drizzle_orm_1.and)(...conditions)),
        isAll
            ? connection_1.db
                .select()
                .from(schema_1.suppliers)
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.suppliers.createdAt))
            : connection_1.db
                .select()
                .from(schema_1.suppliers)
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.suppliers.createdAt))
                .limit(limit)
                .offset(offset),
    ]);
    const totalItems = Number(totalCountResult[0]?.count || 0);
    const totalPages = isAll ? 1 : Math.ceil(totalItems / limit);
    return (0, response_1.SuccessResponse)(res, {
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
exports.getAllSuppliers = getAllSuppliers;
// ==========================================
// 3. Get Supplier By ID
// ==========================================
const getSupplierById = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [supplier] = await connection_1.db
        .select()
        .from(schema_1.suppliers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.suppliers.id, id), (0, drizzle_orm_1.eq)(schema_1.suppliers.restaurantId, restaurantId)))
        .limit(1);
    if (!supplier) {
        throw new Errors_1.NotFound("Supplier not found");
    }
    return (0, response_1.SuccessResponse)(res, {
        message: "Supplier fetched successfully",
        data: supplier,
    });
};
exports.getSupplierById = getSupplierById;
// ==========================================
// 4. Update Supplier (BALANCE IS STRICTLY NOT UPDATED)
// ==========================================
const updateSupplier = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.suppliers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.suppliers.id, id), (0, drizzle_orm_1.eq)(schema_1.suppliers.restaurantId, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Supplier not found");
    }
    const { name, email, phone, status } = req.body;
    const updateData = {};
    if (name !== undefined)
        updateData.name = name;
    if (email !== undefined)
        updateData.email = email || null;
    if (phone !== undefined)
        updateData.phone = phone;
    if (status !== undefined)
        updateData.status = Boolean(status);
    // Notice: balance is explicitly excluded and NOT updated!
    if (Object.keys(updateData).length > 0) {
        await connection_1.db
            .update(schema_1.suppliers)
            .set(updateData)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.suppliers.id, id), (0, drizzle_orm_1.eq)(schema_1.suppliers.restaurantId, restaurantId)));
    }
    const [updated] = await connection_1.db
        .select()
        .from(schema_1.suppliers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.suppliers.id, id), (0, drizzle_orm_1.eq)(schema_1.suppliers.restaurantId, restaurantId)))
        .limit(1);
    return (0, response_1.SuccessResponse)(res, {
        message: "Supplier updated successfully",
        data: updated,
    });
};
exports.updateSupplier = updateSupplier;
// ==========================================
// 5. Delete Supplier
// ==========================================
const deleteSupplier = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.suppliers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.suppliers.id, id), (0, drizzle_orm_1.eq)(schema_1.suppliers.restaurantId, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Supplier not found");
    }
    await connection_1.db
        .delete(schema_1.suppliers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.suppliers.id, id), (0, drizzle_orm_1.eq)(schema_1.suppliers.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: "Supplier deleted successfully",
    });
};
exports.deleteSupplier = deleteSupplier;
// ==========================================
// 6. Toggle Supplier Status
// ==========================================
const toggleSupplierStatus = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.suppliers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.suppliers.id, id), (0, drizzle_orm_1.eq)(schema_1.suppliers.restaurantId, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Supplier not found");
    }
    const newStatus = !existing.status;
    await connection_1.db
        .update(schema_1.suppliers)
        .set({ status: newStatus })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.suppliers.id, id), (0, drizzle_orm_1.eq)(schema_1.suppliers.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: `Supplier status changed to ${newStatus ? "active" : "inactive"}`,
        data: { id, status: newStatus },
    });
};
exports.toggleSupplierStatus = toggleSupplierStatus;
