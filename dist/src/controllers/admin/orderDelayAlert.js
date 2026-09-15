"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAlertGroup = exports.toggleAlertGroupStatus = exports.updateAlertGroup = exports.getAlertGroupById = exports.getAllAlertGroups = exports.createAlertGroup = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const Errors_1 = require("../../Errors");
const uuid_1 = require("uuid");
// Helper to safely parse JSON strings or return array
function parseJsonField(val, fallback) {
    if (typeof val === "string") {
        try {
            const parsed = JSON.parse(val);
            return parsed !== null && parsed !== undefined ? parsed : fallback;
        }
        catch {
            return fallback;
        }
    }
    if (val !== undefined && val !== null) {
        return val;
    }
    return fallback;
}
// Helper to enrich and cleanly format groups with parsed arrays and branch details
async function enrichGroupsWithBranches(groups) {
    const allBranchIds = new Set();
    const normalizedGroups = groups.map((g) => {
        const emails = parseJsonField(g.emails, []);
        const branchIds = parseJsonField(g.branchIds, []);
        const orderStatus = parseJsonField(g.orderStatus, ["pending"]);
        const allBranches = g.allBranches !== false;
        const isActive = Boolean(g.isActive);
        if (!allBranches && Array.isArray(branchIds)) {
            for (const bId of branchIds) {
                if (bId)
                    allBranchIds.add(bId);
            }
        }
        return {
            id: g.id,
            restaurantId: g.restaurantId,
            name: g.name,
            emails,
            allBranches,
            branchIds,
            maxDelayMinutes: g.maxDelayMinutes,
            orderStatus,
            isActive,
            createdAt: g.createdAt,
            updatedAt: g.updatedAt,
        };
    });
    let branchMap = new Map();
    if (allBranchIds.size > 0) {
        const branchList = await connection_1.db
            .select({
            id: schema_1.branches.id,
            name: schema_1.branches.name,
            nameAr: schema_1.branches.nameAr,
        })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.inArray)(schema_1.branches.id, Array.from(allBranchIds)));
        for (const b of branchList) {
            branchMap.set(b.id, b);
        }
    }
    return normalizedGroups.map((g) => {
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
const createAlertGroup = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { name, emails, allBranches = true, branchIds = [], maxDelayMinutes, orderStatus = ["pending"], isActive = true, } = req.body;
    const id = (0, uuid_1.v4)();
    await connection_1.db.insert(schema_1.orderDelayAlertGroups).values({
        id,
        restaurantId,
        isSuperAdmin: false,
        name: name.trim(),
        emails: Array.isArray(emails) ? emails : [emails],
        allBranches: Boolean(allBranches),
        branchIds: allBranches ? [] : (Array.isArray(branchIds) ? branchIds : []),
        maxDelayMinutes: Number(maxDelayMinutes),
        orderStatus: Array.isArray(orderStatus) && orderStatus.length > 0 ? orderStatus : ["pending"],
        isActive: Boolean(isActive),
    });
    const [created] = await connection_1.db
        .select()
        .from(schema_1.orderDelayAlertGroups)
        .where((0, drizzle_orm_1.eq)(schema_1.orderDelayAlertGroups.id, id))
        .limit(1);
    const [enriched] = await enrichGroupsWithBranches([created]);
    return (0, response_1.SuccessResponse)(res, {
        message: "تم إنشاء مجموعة تنبيه التأخير بنجاح",
        data: enriched,
    }, 201);
};
exports.createAlertGroup = createAlertGroup;
// ==========================================
// 2. Get All Alert Groups (Scoped to restaurant & isSuperAdmin = false)
// ==========================================
const getAllAlertGroups = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    // Never return superadmin groups to the restaurant user
    const groups = await connection_1.db
        .select()
        .from(schema_1.orderDelayAlertGroups)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orderDelayAlertGroups.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.orderDelayAlertGroups.isSuperAdmin, false)))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.orderDelayAlertGroups.createdAt));
    const enriched = await enrichGroupsWithBranches(groups);
    return (0, response_1.SuccessResponse)(res, {
        message: "تم جلب مجموعات تنبيه التأخير بنجاح",
        data: enriched,
    });
};
exports.getAllAlertGroups = getAllAlertGroups;
// ==========================================
// 3. Get Alert Group By ID
// ==========================================
const getAlertGroupById = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [group] = await connection_1.db
        .select()
        .from(schema_1.orderDelayAlertGroups)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orderDelayAlertGroups.id, id), (0, drizzle_orm_1.eq)(schema_1.orderDelayAlertGroups.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.orderDelayAlertGroups.isSuperAdmin, false)))
        .limit(1);
    if (!group) {
        throw new Errors_1.NotFound("مجموعة التنبيه غير موجودة");
    }
    const [enriched] = await enrichGroupsWithBranches([group]);
    return (0, response_1.SuccessResponse)(res, {
        message: "تم جلب تفاصيل مجموعة التنبيه بنجاح",
        data: enriched,
    });
};
exports.getAlertGroupById = getAlertGroupById;
// ==========================================
// 4. Update Alert Group
// ==========================================
const updateAlertGroup = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.orderDelayAlertGroups)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orderDelayAlertGroups.id, id), (0, drizzle_orm_1.eq)(schema_1.orderDelayAlertGroups.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.orderDelayAlertGroups.isSuperAdmin, false)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("مجموعة التنبيه غير موجودة");
    }
    const { name, emails, allBranches, branchIds, maxDelayMinutes, orderStatus, isActive } = req.body;
    const updateData = {};
    if (name !== undefined)
        updateData.name = name.trim();
    if (emails !== undefined)
        updateData.emails = Array.isArray(emails) ? emails : [emails];
    if (allBranches !== undefined) {
        updateData.allBranches = Boolean(allBranches);
        if (allBranches === true) {
            updateData.branchIds = [];
        }
    }
    if (branchIds !== undefined && updateData.allBranches !== true) {
        updateData.branchIds = Array.isArray(branchIds) ? branchIds : [];
    }
    if (maxDelayMinutes !== undefined)
        updateData.maxDelayMinutes = Number(maxDelayMinutes);
    if (orderStatus !== undefined) {
        updateData.orderStatus = Array.isArray(orderStatus) && orderStatus.length > 0 ? orderStatus : ["pending"];
    }
    if (isActive !== undefined)
        updateData.isActive = Boolean(isActive);
    await connection_1.db
        .update(schema_1.orderDelayAlertGroups)
        .set(updateData)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orderDelayAlertGroups.id, id), (0, drizzle_orm_1.eq)(schema_1.orderDelayAlertGroups.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.orderDelayAlertGroups.isSuperAdmin, false)));
    const [updated] = await connection_1.db
        .select()
        .from(schema_1.orderDelayAlertGroups)
        .where((0, drizzle_orm_1.eq)(schema_1.orderDelayAlertGroups.id, id))
        .limit(1);
    const [enriched] = await enrichGroupsWithBranches([updated]);
    return (0, response_1.SuccessResponse)(res, {
        message: "تم تحديث مجموعة التنبيه بنجاح",
        data: enriched,
    });
};
exports.updateAlertGroup = updateAlertGroup;
// ==========================================
// 5. Toggle Alert Group Status
// ==========================================
const toggleAlertGroupStatus = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.orderDelayAlertGroups)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orderDelayAlertGroups.id, id), (0, drizzle_orm_1.eq)(schema_1.orderDelayAlertGroups.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.orderDelayAlertGroups.isSuperAdmin, false)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("مجموعة التنبيه غير موجودة");
    }
    const newStatus = !existing.isActive;
    await connection_1.db
        .update(schema_1.orderDelayAlertGroups)
        .set({ isActive: newStatus })
        .where((0, drizzle_orm_1.eq)(schema_1.orderDelayAlertGroups.id, id));
    return (0, response_1.SuccessResponse)(res, {
        message: newStatus ? "تم تفعيل مجموعة التنبيه" : "تم تعطيل مجموعة التنبيه",
        data: { id, isActive: newStatus },
    });
};
exports.toggleAlertGroupStatus = toggleAlertGroupStatus;
// ==========================================
// 6. Delete Alert Group
// ==========================================
const deleteAlertGroup = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.orderDelayAlertGroups)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orderDelayAlertGroups.id, id), (0, drizzle_orm_1.eq)(schema_1.orderDelayAlertGroups.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.orderDelayAlertGroups.isSuperAdmin, false)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("مجموعة التنبيه غير موجودة");
    }
    await connection_1.db
        .delete(schema_1.orderDelayAlertGroups)
        .where((0, drizzle_orm_1.eq)(schema_1.orderDelayAlertGroups.id, id));
    return (0, response_1.SuccessResponse)(res, {
        message: "تم حذف مجموعة التنبيه بنجاح",
        data: { id },
    });
};
exports.deleteAlertGroup = deleteAlertGroup;
