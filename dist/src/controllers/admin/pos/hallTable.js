"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toggleHallTableOccupied = exports.toggleHallTableStatus = exports.deleteHallTable = exports.updateHallTable = exports.getHallTableById = exports.getHallsForTable = exports.getAllHallTables = exports.createHallTable = void 0;
const connection_1 = require("../../../models/connection");
const schema_1 = require("../../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../../utils/response");
const Errors_1 = require("../../../Errors");
const uuid_1 = require("uuid");
const qrcode_1 = __importDefault(require("qrcode"));
const handleImages_1 = require("../../../utils/handleImages");
const localization_helper_1 = require("../../../helpers/localization.helper");
// ==========================================
// 1. Create HallTable (Auto-generates QR code)
// ==========================================
const createHallTable = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { tbl_number, tblNumber, capacity, hall_id, hallId, status, } = req.body;
    const targetHallId = hall_id || hallId;
    const targetTblNumber = String(tbl_number || tblNumber).trim();
    // 1. Validate Hall belongs to restaurant
    const [targetHall] = await connection_1.db
        .select()
        .from(schema_1.halls)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.halls.id, targetHallId), (0, drizzle_orm_1.eq)(schema_1.halls.restaurantId, restaurantId)))
        .limit(1);
    if (!targetHall) {
        throw new Errors_1.BadRequest("Invalid hall selected: hall not found or does not belong to your restaurant");
    }
    // 2. Generate UUID for Table
    const id = (0, uuid_1.v4)();
    // 3. Generate QR code automatic: value = "hallTable/" + id
    const qrValue = `hallTable/${id}`;
    let savedQrUrl;
    try {
        const qrBase64 = await qrcode_1.default.toDataURL(qrValue);
        savedQrUrl = await (0, handleImages_1.saveBase64Image)(qrBase64, req, "hall_tables");
    }
    catch (err) {
        console.error("❌ Failed to generate QR Code for table:", err);
        throw new Errors_1.BadRequest(`Failed to generate QR Code: ${err.message}`);
    }
    // 4. Insert table with occupied = false automatically
    await connection_1.db.insert(schema_1.hallTables).values({
        id,
        restaurantId,
        hallId: targetHallId,
        tblNumber: targetTblNumber,
        capacity: capacity !== undefined ? Number(capacity) : 1,
        qr: savedQrUrl,
        occupied: false,
        status: status !== undefined ? Boolean(status) : true,
    });
    const [created] = await connection_1.db
        .select()
        .from(schema_1.hallTables)
        .where((0, drizzle_orm_1.eq)(schema_1.hallTables.id, id))
        .limit(1);
    return (0, response_1.SuccessResponse)(res, {
        message: "Hall table created successfully",
        data: created,
    }, 201);
};
exports.createHallTable = createHallTable;
// ==========================================
// 2. Get All HallTables (Paginated & Filtered)
// ==========================================
const getAllHallTables = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const params = { ...req.query, ...req.body };
    const { search, status, occupied, hall_id, hallId, all } = params;
    const page = Math.max(1, parseInt(params.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(params.limit) || 10));
    const offset = (page - 1) * limit;
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.hallTables.restaurantId, restaurantId)];
    const targetHallId = hall_id || hallId;
    if (targetHallId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.hallTables.hallId, targetHallId));
    }
    if (status !== undefined && status !== "") {
        const boolStatus = status === true || status === "true" || status === 1 || status === "1";
        conditions.push((0, drizzle_orm_1.eq)(schema_1.hallTables.status, boolStatus));
    }
    if (occupied !== undefined && occupied !== "") {
        const boolOccupied = occupied === true || occupied === "true" || occupied === 1 || occupied === "1";
        conditions.push((0, drizzle_orm_1.eq)(schema_1.hallTables.occupied, boolOccupied));
    }
    if (search && typeof search === "string" && search.trim() !== "") {
        const term = `%${search.trim()}%`;
        conditions.push((0, drizzle_orm_1.like)(schema_1.hallTables.tblNumber, term));
    }
    const isAll = all === "true" || all === true;
    const [totalCountResult, rawTables] = await Promise.all([
        connection_1.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema_1.hallTables)
            .where((0, drizzle_orm_1.and)(...conditions)),
        isAll
            ? connection_1.db
                .select({
                id: schema_1.hallTables.id,
                restaurantId: schema_1.hallTables.restaurantId,
                hallId: schema_1.hallTables.hallId,
                tblNumber: schema_1.hallTables.tblNumber,
                capacity: schema_1.hallTables.capacity,
                qr: schema_1.hallTables.qr,
                occupied: schema_1.hallTables.occupied,
                status: schema_1.hallTables.status,
                createdAt: schema_1.hallTables.createdAt,
                updatedAt: schema_1.hallTables.updatedAt,
                hallName: schema_1.halls.name,
                hallNameAr: schema_1.halls.nameAr,
                hallNameFr: schema_1.halls.nameFr,
                hallLat: schema_1.halls.lat,
                hallLng: schema_1.halls.lng,
                branchId: schema_1.halls.branchId,
            })
                .from(schema_1.hallTables)
                .leftJoin(schema_1.halls, (0, drizzle_orm_1.eq)(schema_1.hallTables.hallId, schema_1.halls.id))
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.hallTables.createdAt))
            : connection_1.db
                .select({
                id: schema_1.hallTables.id,
                restaurantId: schema_1.hallTables.restaurantId,
                hallId: schema_1.hallTables.hallId,
                tblNumber: schema_1.hallTables.tblNumber,
                capacity: schema_1.hallTables.capacity,
                qr: schema_1.hallTables.qr,
                occupied: schema_1.hallTables.occupied,
                status: schema_1.hallTables.status,
                createdAt: schema_1.hallTables.createdAt,
                updatedAt: schema_1.hallTables.updatedAt,
                hallName: schema_1.halls.name,
                hallNameAr: schema_1.halls.nameAr,
                hallNameFr: schema_1.halls.nameFr,
                hallLat: schema_1.halls.lat,
                hallLng: schema_1.halls.lng,
                branchId: schema_1.halls.branchId,
            })
                .from(schema_1.hallTables)
                .leftJoin(schema_1.halls, (0, drizzle_orm_1.eq)(schema_1.hallTables.hallId, schema_1.halls.id))
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.hallTables.createdAt))
                .limit(limit)
                .offset(offset),
    ]);
    const totalItems = Number(totalCountResult[0]?.count || 0);
    const totalPages = isAll ? 1 : Math.ceil(totalItems / limit);
    const formattedList = rawTables.map((item) => ({
        id: item.id,
        tbl_number: item.tblNumber,
        capacity: item.capacity,
        qr: item.qr,
        occupied: item.occupied,
        status: item.status,
        hall: item.hallId
            ? {
                id: item.hallId,
                name: (0, localization_helper_1.getLocalizedName)({
                    name: item.hallName || "",
                    nameAr: item.hallNameAr,
                    nameFr: item.hallNameFr,
                }, lang),
                branch_id: item.branchId,
            }
            : null,
        map: item.hallLat && item.hallLng ? `https://maps.google.com/?q=${item.hallLat},${item.hallLng}` : null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
    }));
    return (0, response_1.SuccessResponse)(res, {
        message: "Hall tables fetched successfully",
        data: formattedList,
        pagination: {
            page: isAll ? 1 : page,
            limit: isAll ? totalItems : limit,
            totalItems,
            totalPages,
        },
    });
};
exports.getAllHallTables = getAllHallTables;
// ==========================================
// 3. Get Halls for Selection (id & name by lang)
// ==========================================
const getHallsForTable = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const activeHalls = await connection_1.db
        .select({
        id: schema_1.halls.id,
        name: schema_1.halls.name,
        nameAr: schema_1.halls.nameAr,
        nameFr: schema_1.halls.nameFr,
    })
        .from(schema_1.halls)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.halls.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.halls.status, true)))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.halls.createdAt));
    const formatted = activeHalls.map((h) => ({
        id: h.id,
        name: (0, localization_helper_1.getLocalizedName)(h, lang),
    }));
    return (0, response_1.SuccessResponse)(res, {
        message: "Halls for dropdown fetched successfully",
        data: formatted,
    });
};
exports.getHallsForTable = getHallsForTable;
// ==========================================
// 4. Get HallTable By ID
// ==========================================
const getHallTableById = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const { id } = req.params;
    const [row] = await connection_1.db
        .select({
        id: schema_1.hallTables.id,
        restaurantId: schema_1.hallTables.restaurantId,
        hallId: schema_1.hallTables.hallId,
        tblNumber: schema_1.hallTables.tblNumber,
        capacity: schema_1.hallTables.capacity,
        qr: schema_1.hallTables.qr,
        occupied: schema_1.hallTables.occupied,
        status: schema_1.hallTables.status,
        createdAt: schema_1.hallTables.createdAt,
        updatedAt: schema_1.hallTables.updatedAt,
        hallName: schema_1.halls.name,
        hallNameAr: schema_1.halls.nameAr,
        hallNameFr: schema_1.halls.nameFr,
        hallLat: schema_1.halls.lat,
        hallLng: schema_1.halls.lng,
        branchId: schema_1.halls.branchId,
    })
        .from(schema_1.hallTables)
        .leftJoin(schema_1.halls, (0, drizzle_orm_1.eq)(schema_1.hallTables.hallId, schema_1.halls.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.hallTables.id, id), (0, drizzle_orm_1.eq)(schema_1.hallTables.restaurantId, restaurantId)))
        .limit(1);
    if (!row) {
        throw new Errors_1.NotFound("Hall table not found");
    }
    const result = {
        id: row.id,
        tbl_number: row.tblNumber,
        capacity: row.capacity,
        qr: row.qr,
        occupied: row.occupied,
        status: row.status,
        hall: row.hallId
            ? {
                id: row.hallId,
                name: (0, localization_helper_1.getLocalizedName)({
                    name: row.hallName || "",
                    nameAr: row.hallNameAr,
                    nameFr: row.hallNameFr,
                }, lang),
                branch_id: row.branchId,
            }
            : null,
        map: row.hallLat && row.hallLng ? `https://maps.google.com/?q=${row.hallLat},${row.hallLng}` : null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
    return (0, response_1.SuccessResponse)(res, {
        message: "Hall table fetched successfully",
        data: result,
    });
};
exports.getHallTableById = getHallTableById;
// ==========================================
// 5. Update HallTable (QR & occupied NOT updated)
// ==========================================
const updateHallTable = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.hallTables)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.hallTables.id, id), (0, drizzle_orm_1.eq)(schema_1.hallTables.restaurantId, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Hall table not found");
    }
    const { tbl_number, tblNumber, capacity, hall_id, hallId, status, } = req.body;
    const targetHallId = hall_id || hallId;
    if (targetHallId && targetHallId !== existing.hallId) {
        const [targetHall] = await connection_1.db
            .select()
            .from(schema_1.halls)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.halls.id, targetHallId), (0, drizzle_orm_1.eq)(schema_1.halls.restaurantId, restaurantId)))
            .limit(1);
        if (!targetHall) {
            throw new Errors_1.BadRequest("Invalid hall selected: hall not found or does not belong to your restaurant");
        }
    }
    const updateData = {};
    const finalTblNumber = tbl_number || tblNumber;
    if (finalTblNumber !== undefined)
        updateData.tblNumber = String(finalTblNumber).trim();
    if (capacity !== undefined)
        updateData.capacity = Number(capacity);
    if (targetHallId !== undefined)
        updateData.hallId = targetHallId;
    if (status !== undefined)
        updateData.status = Boolean(status);
    // Note: 'qr' and 'occupied' are explicitly NOT updated per requirement
    if (Object.keys(updateData).length > 0) {
        await connection_1.db
            .update(schema_1.hallTables)
            .set(updateData)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.hallTables.id, id), (0, drizzle_orm_1.eq)(schema_1.hallTables.restaurantId, restaurantId)));
    }
    const [updated] = await connection_1.db
        .select()
        .from(schema_1.hallTables)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.hallTables.id, id), (0, drizzle_orm_1.eq)(schema_1.hallTables.restaurantId, restaurantId)))
        .limit(1);
    return (0, response_1.SuccessResponse)(res, {
        message: "Hall table updated successfully",
        data: updated,
    });
};
exports.updateHallTable = updateHallTable;
// ==========================================
// 6. Delete HallTable (Deletes QR image file first)
// ==========================================
const deleteHallTable = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.hallTables)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.hallTables.id, id), (0, drizzle_orm_1.eq)(schema_1.hallTables.restaurantId, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Hall table not found");
    }
    // Delete QR code image file first before removing database record
    if (existing.qr) {
        await (0, handleImages_1.deleteImage)(existing.qr);
    }
    await connection_1.db
        .delete(schema_1.hallTables)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.hallTables.id, id), (0, drizzle_orm_1.eq)(schema_1.hallTables.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: "Hall table deleted successfully",
    });
};
exports.deleteHallTable = deleteHallTable;
// ==========================================
// 7. Toggle HallTable Status
// ==========================================
const toggleHallTableStatus = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.hallTables)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.hallTables.id, id), (0, drizzle_orm_1.eq)(schema_1.hallTables.restaurantId, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Hall table not found");
    }
    const newStatus = !existing.status;
    await connection_1.db
        .update(schema_1.hallTables)
        .set({ status: newStatus })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.hallTables.id, id), (0, drizzle_orm_1.eq)(schema_1.hallTables.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: `Hall table status changed to ${newStatus ? "active" : "inactive"}`,
        data: { id, status: newStatus },
    });
};
exports.toggleHallTableStatus = toggleHallTableStatus;
// ==========================================
// 8. Toggle HallTable Occupied Status
// ==========================================
const toggleHallTableOccupied = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.hallTables)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.hallTables.id, id), (0, drizzle_orm_1.eq)(schema_1.hallTables.restaurantId, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Hall table not found");
    }
    const newOccupied = !existing.occupied;
    await connection_1.db
        .update(schema_1.hallTables)
        .set({ occupied: newOccupied })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.hallTables.id, id), (0, drizzle_orm_1.eq)(schema_1.hallTables.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: `Hall table occupied status changed to ${newOccupied ? "occupied" : "vacant"}`,
        data: { id, occupied: newOccupied },
    });
};
exports.toggleHallTableOccupied = toggleHallTableOccupied;
