"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBranches = exports.toggleShiftStatus = exports.deleteShift = exports.updateShift = exports.getShiftById = exports.getAllShifts = exports.createShift = exports.calculateIsTomorrow = void 0;
const connection_1 = require("../../../models/connection");
const schema_1 = require("../../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../../utils/response");
const Errors_1 = require("../../../Errors");
const uuid_1 = require("uuid");
const localization_helper_1 = require("../../../helpers/localization.helper");
/**
 * Calculates whether the shift spans to the next day.
 * Returns true if `to < from`, otherwise false.
 */
const calculateIsTomorrow = (fromTime, toTime) => {
    const toMinutes = (timeStr) => {
        const parts = timeStr.split(":").map(Number);
        const hours = parts[0] || 0;
        const minutes = parts[1] || 0;
        return hours * 60 + minutes;
    };
    return toMinutes(toTime) < toMinutes(fromTime);
};
exports.calculateIsTomorrow = calculateIsTomorrow;
/**
 * Helper to enrich shifts with localized branch details
 */
async function enrichShiftsWithBranches(items, restaurantId, lang = "en") {
    if (items.length === 0)
        return items;
    const branchIds = Array.from(new Set(items.map((i) => i.branchId).filter(Boolean)));
    const branchList = branchIds.length > 0
        ? await connection_1.db
            .select({
            id: schema_1.branches.id,
            name: schema_1.branches.name,
            nameAr: schema_1.branches.nameAr,
            nameFr: schema_1.branches.nameFr,
        })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.branches.id, branchIds)))
        : [];
    const branchMap = new Map();
    for (const b of branchList) {
        branchMap.set(b.id, b);
    }
    return items.map((item) => {
        const branchObj = branchMap.get(item.branchId);
        return {
            ...item,
            name: (0, localization_helper_1.getLocalizedName)(item, lang),
            branch: branchObj
                ? {
                    id: branchObj.id,
                    name: (0, localization_helper_1.getLocalizedName)(branchObj, lang),
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
const createShift = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const { name, nameAr, nameFr, branchId, branch_id, from, to, status } = req.body;
    const finalBranchId = branchId || branch_id;
    if (!name || !from || !to || !finalBranchId) {
        throw new Errors_1.BadRequest("Missing required fields: name, branch_id, from, to");
    }
    // Verify branch belongs to this restaurant
    const [branchCheck] = await connection_1.db
        .select({ id: schema_1.branches.id })
        .from(schema_1.branches)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.id, finalBranchId), (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId)))
        .limit(1);
    if (!branchCheck) {
        throw new Errors_1.BadRequest("Selected branch does not belong to this restaurant or does not exist");
    }
    // Auto-calculate isTomorrow: true if to < from, else false
    const isTomorrow = (0, exports.calculateIsTomorrow)(from, to);
    const id = (0, uuid_1.v4)();
    await connection_1.db.insert(schema_1.shifts).values({
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
    const [createdShift] = await connection_1.db
        .select()
        .from(schema_1.shifts)
        .where((0, drizzle_orm_1.eq)(schema_1.shifts.id, id))
        .limit(1);
    const [enriched] = await enrichShiftsWithBranches([createdShift], restaurantId, lang);
    return (0, response_1.SuccessResponse)(res, {
        message: "Shift created successfully",
        data: enriched || createdShift,
    }, 201);
};
exports.createShift = createShift;
// ==========================================
// 2. Get All Shifts (Restaurant Scoped)
// ==========================================
const getAllShifts = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const params = { ...req.query, ...req.body, ...req.params };
    const { status, search } = params;
    const rawBranchId = req.query?.branch_id ||
        req.query?.branchId ||
        req.body?.branch_id ||
        req.body?.branchId ||
        req.params?.branch_id ||
        req.params?.branchId ||
        params.branch_id ||
        params.branchId;
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.shifts.restaurantId, restaurantId)];
    if (status && (status === "active" || status === "inactive")) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.shifts.status, status));
    }
    // Filter by branch_id if provided and not "all"
    if (rawBranchId) {
        if (Array.isArray(rawBranchId)) {
            const filtered = rawBranchId.filter((b) => typeof b === "string" && b.trim().toLowerCase() !== "all" && b.trim() !== "");
            if (filtered.length > 0 && filtered.length === rawBranchId.length) {
                conditions.push((0, drizzle_orm_1.inArray)(schema_1.shifts.branchId, filtered));
            }
        }
        else if (typeof rawBranchId === "string") {
            const trimmed = rawBranchId.trim();
            if (trimmed.toLowerCase() !== "all" && trimmed !== "") {
                conditions.push((0, drizzle_orm_1.eq)(schema_1.shifts.branchId, trimmed));
            }
        }
    }
    if (search && typeof search === "string" && search.trim() !== "") {
        const term = `%${search.trim()}%`;
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(schema_1.shifts.name, term), (0, drizzle_orm_1.like)(schema_1.shifts.nameAr, term), (0, drizzle_orm_1.like)(schema_1.shifts.nameFr, term)));
    }
    const { all } = params;
    const page = Math.max(1, parseInt(params.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(params.limit) || 10));
    const offset = (page - 1) * limit;
    const isAll = all === "true";
    const [totalCountResult, rawShifts] = await Promise.all([
        connection_1.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema_1.shifts)
            .where((0, drizzle_orm_1.and)(...conditions)),
        isAll
            ? connection_1.db
                .select()
                .from(schema_1.shifts)
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.shifts.createdAt))
            : connection_1.db
                .select()
                .from(schema_1.shifts)
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.shifts.createdAt))
                .limit(limit)
                .offset(offset),
    ]);
    const totalItems = Number(totalCountResult[0]?.count || 0);
    const totalPages = isAll ? 1 : Math.ceil(totalItems / limit);
    const enrichedList = await enrichShiftsWithBranches(rawShifts, restaurantId, lang);
    return (0, response_1.SuccessResponse)(res, {
        message: "Shifts fetched successfully",
        data: enrichedList,
        pagination: {
            page: isAll ? 1 : page,
            limit: isAll ? totalItems : limit,
            totalItems,
            totalPages,
        },
    });
};
exports.getAllShifts = getAllShifts;
// ==========================================
// 3. Get Shift By ID
// ==========================================
const getShiftById = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    // If client hits /:id with "all", route to getAllShifts
    if (id && id.toLowerCase() === "all") {
        return (0, exports.getAllShifts)(req, res);
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const [shift] = await connection_1.db
        .select()
        .from(schema_1.shifts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.shifts.id, id), (0, drizzle_orm_1.eq)(schema_1.shifts.restaurantId, restaurantId)))
        .limit(1);
    if (!shift) {
        throw new Errors_1.NotFound("Shift not found");
    }
    const [enriched] = await enrichShiftsWithBranches([shift], restaurantId, lang);
    return (0, response_1.SuccessResponse)(res, {
        message: "Shift fetched successfully",
        data: enriched || shift,
    });
};
exports.getShiftById = getShiftById;
// ==========================================
// 4. Update Shift
// ==========================================
const updateShift = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const { id } = req.params;
    // Check if shift exists and belongs to this restaurant
    const [existingShift] = await connection_1.db
        .select()
        .from(schema_1.shifts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.shifts.id, id), (0, drizzle_orm_1.eq)(schema_1.shifts.restaurantId, restaurantId)))
        .limit(1);
    if (!existingShift) {
        throw new Errors_1.NotFound("Shift not found");
    }
    const { name, nameAr, nameFr, branchId, branch_id, from, to, status } = req.body;
    const finalBranchId = branchId || branch_id;
    if (finalBranchId) {
        const [branchCheck] = await connection_1.db
            .select({ id: schema_1.branches.id })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.id, finalBranchId), (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId)))
            .limit(1);
        if (!branchCheck) {
            throw new Errors_1.BadRequest("Selected branch does not belong to this restaurant or does not exist");
        }
    }
    const newFrom = from !== undefined ? from : existingShift.from;
    const newTo = to !== undefined ? to : existingShift.to;
    // Recalculate isTomorrow if from or to was provided
    const isTomorrow = (0, exports.calculateIsTomorrow)(newFrom, newTo);
    await connection_1.db
        .update(schema_1.shifts)
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
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.shifts.id, id), (0, drizzle_orm_1.eq)(schema_1.shifts.restaurantId, restaurantId)));
    const [updatedShift] = await connection_1.db
        .select()
        .from(schema_1.shifts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.shifts.id, id), (0, drizzle_orm_1.eq)(schema_1.shifts.restaurantId, restaurantId)))
        .limit(1);
    const [enriched] = await enrichShiftsWithBranches([updatedShift], restaurantId, lang);
    return (0, response_1.SuccessResponse)(res, {
        message: "Shift updated successfully",
        data: enriched || updatedShift,
    });
};
exports.updateShift = updateShift;
// ==========================================
// 5. Delete Shift
// ==========================================
const deleteShift = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existingShift] = await connection_1.db
        .select()
        .from(schema_1.shifts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.shifts.id, id), (0, drizzle_orm_1.eq)(schema_1.shifts.restaurantId, restaurantId)))
        .limit(1);
    if (!existingShift) {
        throw new Errors_1.NotFound("Shift not found");
    }
    await connection_1.db
        .delete(schema_1.shifts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.shifts.id, id), (0, drizzle_orm_1.eq)(schema_1.shifts.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: "Shift deleted successfully",
    });
};
exports.deleteShift = deleteShift;
// ==========================================
// 6. Toggle Shift Status (Active / Inactive)
// ==========================================
const toggleShiftStatus = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existingShift] = await connection_1.db
        .select()
        .from(schema_1.shifts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.shifts.id, id), (0, drizzle_orm_1.eq)(schema_1.shifts.restaurantId, restaurantId)))
        .limit(1);
    if (!existingShift) {
        throw new Errors_1.NotFound("Shift not found");
    }
    const newStatus = existingShift.status === "active" ? "inactive" : "active";
    await connection_1.db
        .update(schema_1.shifts)
        .set({ status: newStatus })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.shifts.id, id), (0, drizzle_orm_1.eq)(schema_1.shifts.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: `Shift status changed to ${newStatus}`,
        data: { id, status: newStatus },
    });
};
exports.toggleShiftStatus = toggleShiftStatus;
// ==========================================
// 7. Get Branches (Localized by lang en, ar, fr with fallback to en)
// ==========================================
const getBranches = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const myBranches = await connection_1.db
        .select({
        id: schema_1.branches.id,
        name: schema_1.branches.name,
        nameAr: schema_1.branches.nameAr,
        nameFr: schema_1.branches.nameFr,
    })
        .from(schema_1.branches)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.branches.status, "active")));
    const formatted = myBranches.map((b) => ({
        id: b.id,
        name: (0, localization_helper_1.getLocalizedName)(b, lang),
    }));
    return (0, response_1.SuccessResponse)(res, {
        message: "Branches fetched successfully",
        data: formatted,
    });
};
exports.getBranches = getBranches;
