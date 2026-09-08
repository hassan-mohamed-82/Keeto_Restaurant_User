"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toggleShiftStatus = exports.deleteShift = exports.updateShift = exports.getShiftById = exports.getAllShifts = exports.createShift = exports.calculateIsTomorrow = void 0;
const connection_1 = require("../../../models/connection");
const schema_1 = require("../../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../../utils/response");
const Errors_1 = require("../../../Errors");
const uuid_1 = require("uuid");
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
// ==========================================
// 1. Create Shift
// ==========================================
const createShift = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { name, from, to, status } = req.body;
    if (!name || !from || !to) {
        throw new Errors_1.BadRequest("Missing required fields: name, from, to");
    }
    // Auto-calculate isTomorrow: true if to < from, else false
    const isTomorrow = (0, exports.calculateIsTomorrow)(from, to);
    const id = (0, uuid_1.v4)();
    await connection_1.db.insert(schema_1.shifts).values({
        id,
        restaurantId,
        name,
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
    return (0, response_1.SuccessResponse)(res, {
        message: "Shift created successfully",
        data: createdShift,
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
    const { status } = req.query;
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.shifts.restaurantId, restaurantId)];
    if (status && (status === "active" || status === "inactive")) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.shifts.status, status));
    }
    const allShifts = await connection_1.db
        .select()
        .from(schema_1.shifts)
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.shifts.createdAt));
    return (0, response_1.SuccessResponse)(res, {
        message: "Shifts fetched successfully",
        data: allShifts,
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
    const [shift] = await connection_1.db
        .select()
        .from(schema_1.shifts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.shifts.id, id), (0, drizzle_orm_1.eq)(schema_1.shifts.restaurantId, restaurantId)))
        .limit(1);
    if (!shift) {
        throw new Errors_1.NotFound("Shift not found");
    }
    return (0, response_1.SuccessResponse)(res, {
        message: "Shift fetched successfully",
        data: shift,
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
    const { name, from, to, status } = req.body;
    const newFrom = from !== undefined ? from : existingShift.from;
    const newTo = to !== undefined ? to : existingShift.to;
    // Recalculate isTomorrow if from or to was provided
    const isTomorrow = (0, exports.calculateIsTomorrow)(newFrom, newTo);
    await connection_1.db
        .update(schema_1.shifts)
        .set({
        ...(name !== undefined && { name }),
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
    return (0, response_1.SuccessResponse)(res, {
        message: "Shift updated successfully",
        data: updatedShift,
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
