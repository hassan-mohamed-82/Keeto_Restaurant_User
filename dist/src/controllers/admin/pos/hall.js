"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toggleHallStatus = exports.deleteHall = exports.updateHall = exports.getHallById = exports.getBranchesForHall = exports.getAllHalls = exports.createHall = void 0;
const connection_1 = require("../../../models/connection");
const schema_1 = require("../../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../../utils/response");
const Errors_1 = require("../../../Errors");
const uuid_1 = require("uuid");
const localization_helper_1 = require("../../../helpers/localization.helper");
// ==========================================
// 1. Create Hall
// ==========================================
const createHall = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { name, nameAr, nameFr, lat, lng, branch_id, branchId, branche_id, status, } = req.body;
    const targetBranchId = branch_id || branchId || branche_id;
    // 1. Validate Branch belongs to restaurant
    const [targetBranch] = await connection_1.db
        .select()
        .from(schema_1.branches)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.id, targetBranchId), (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId)))
        .limit(1);
    if (!targetBranch) {
        throw new Errors_1.BadRequest("Invalid branch selected: branch not found or does not belong to your restaurant");
    }
    const id = (0, uuid_1.v4)();
    await connection_1.db.insert(schema_1.halls).values({
        id,
        restaurantId,
        branchId: targetBranchId,
        name: name.trim(),
        nameAr: nameAr ? nameAr.trim() : null,
        nameFr: nameFr ? nameFr.trim() : null,
        lat: lat ? String(lat).trim() : null,
        lng: lng ? String(lng).trim() : null,
        status: status !== undefined ? Boolean(status) : true,
    });
    const [created] = await connection_1.db
        .select()
        .from(schema_1.halls)
        .where((0, drizzle_orm_1.eq)(schema_1.halls.id, id))
        .limit(1);
    return (0, response_1.SuccessResponse)(res, {
        message: "Hall created successfully",
        data: {
            ...created,
            map: created.lat && created.lng ? `https://maps.google.com/?q=${created.lat},${created.lng}` : null,
        },
    }, 201);
};
exports.createHall = createHall;
// ==========================================
// 2. Get All Halls (Paginated & Filtered)
// ==========================================
const getAllHalls = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const params = { ...req.query, ...req.body };
    const { search, status, branch_id, branchId, branche_id, all } = params;
    const page = Math.max(1, parseInt(params.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(params.limit) || 10));
    const offset = (page - 1) * limit;
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.halls.restaurantId, restaurantId)];
    const targetBranchId = branch_id || branchId || branche_id;
    if (targetBranchId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.halls.branchId, targetBranchId));
    }
    if (status !== undefined && status !== "") {
        const boolStatus = status === true || status === "true" || status === 1 || status === "1";
        conditions.push((0, drizzle_orm_1.eq)(schema_1.halls.status, boolStatus));
    }
    if (search && typeof search === "string" && search.trim() !== "") {
        const term = `%${search.trim()}%`;
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(schema_1.halls.name, term), (0, drizzle_orm_1.like)(schema_1.halls.nameAr, term), (0, drizzle_orm_1.like)(schema_1.halls.nameFr, term)));
    }
    const isAll = all === "true" || all === true;
    const [totalCountResult, rawHalls] = await Promise.all([
        connection_1.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema_1.halls)
            .where((0, drizzle_orm_1.and)(...conditions)),
        isAll
            ? connection_1.db
                .select({
                id: schema_1.halls.id,
                restaurantId: schema_1.halls.restaurantId,
                branchId: schema_1.halls.branchId,
                name: schema_1.halls.name,
                nameAr: schema_1.halls.nameAr,
                nameFr: schema_1.halls.nameFr,
                lat: schema_1.halls.lat,
                lng: schema_1.halls.lng,
                status: schema_1.halls.status,
                createdAt: schema_1.halls.createdAt,
                updatedAt: schema_1.halls.updatedAt,
                branchName: schema_1.branches.name,
                branchNameAr: schema_1.branches.nameAr,
                branchNameFr: schema_1.branches.nameFr,
            })
                .from(schema_1.halls)
                .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.halls.branchId, schema_1.branches.id))
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.halls.createdAt))
            : connection_1.db
                .select({
                id: schema_1.halls.id,
                restaurantId: schema_1.halls.restaurantId,
                branchId: schema_1.halls.branchId,
                name: schema_1.halls.name,
                nameAr: schema_1.halls.nameAr,
                nameFr: schema_1.halls.nameFr,
                lat: schema_1.halls.lat,
                lng: schema_1.halls.lng,
                status: schema_1.halls.status,
                createdAt: schema_1.halls.createdAt,
                updatedAt: schema_1.halls.updatedAt,
                branchName: schema_1.branches.name,
                branchNameAr: schema_1.branches.nameAr,
                branchNameFr: schema_1.branches.nameFr,
            })
                .from(schema_1.halls)
                .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.halls.branchId, schema_1.branches.id))
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.halls.createdAt))
                .limit(limit)
                .offset(offset),
    ]);
    const totalItems = Number(totalCountResult[0]?.count || 0);
    const totalPages = isAll ? 1 : Math.ceil(totalItems / limit);
    const formattedList = rawHalls.map((item) => ({
        id: item.id,
        name: item.name,
        nameAr: item.nameAr,
        nameFr: item.nameFr,
        displayName: (0, localization_helper_1.getLocalizedName)({
            name: item.name,
            nameAr: item.nameAr,
            nameFr: item.nameFr,
        }, lang),
        lat: item.lat,
        lng: item.lng,
        map: item.lat && item.lng ? `https://maps.google.com/?q=${item.lat},${item.lng}` : null,
        status: item.status,
        branch: item.branchId
            ? {
                id: item.branchId,
                name: (0, localization_helper_1.getLocalizedName)({
                    name: item.branchName || "",
                    nameAr: item.branchNameAr,
                    nameFr: item.branchNameFr,
                }, lang),
            }
            : null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
    }));
    return (0, response_1.SuccessResponse)(res, {
        message: "Halls fetched successfully",
        data: formattedList,
        pagination: {
            page: isAll ? 1 : page,
            limit: isAll ? totalItems : limit,
            totalItems,
            totalPages,
        },
    });
};
exports.getAllHalls = getAllHalls;
// ==========================================
// 3. Get Branches for Selection (id & name by lang)
// ==========================================
const getBranchesForHall = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const activeBranches = await connection_1.db
        .select({
        id: schema_1.branches.id,
        name: schema_1.branches.name,
        nameAr: schema_1.branches.nameAr,
        nameFr: schema_1.branches.nameFr,
    })
        .from(schema_1.branches)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.branches.status, "active")))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.branches.createdAt));
    const formatted = activeBranches.map((b) => ({
        id: b.id,
        name: (0, localization_helper_1.getLocalizedName)(b, lang),
    }));
    return (0, response_1.SuccessResponse)(res, {
        message: "Branches for dropdown fetched successfully",
        data: formatted,
    });
};
exports.getBranchesForHall = getBranchesForHall;
// ==========================================
// 4. Get Hall By ID
// ==========================================
const getHallById = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const { id } = req.params;
    const [row] = await connection_1.db
        .select({
        id: schema_1.halls.id,
        restaurantId: schema_1.halls.restaurantId,
        branchId: schema_1.halls.branchId,
        name: schema_1.halls.name,
        nameAr: schema_1.halls.nameAr,
        nameFr: schema_1.halls.nameFr,
        lat: schema_1.halls.lat,
        lng: schema_1.halls.lng,
        status: schema_1.halls.status,
        createdAt: schema_1.halls.createdAt,
        updatedAt: schema_1.halls.updatedAt,
        branchName: schema_1.branches.name,
        branchNameAr: schema_1.branches.nameAr,
        branchNameFr: schema_1.branches.nameFr,
    })
        .from(schema_1.halls)
        .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.halls.branchId, schema_1.branches.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.halls.id, id), (0, drizzle_orm_1.eq)(schema_1.halls.restaurantId, restaurantId)))
        .limit(1);
    if (!row) {
        throw new Errors_1.NotFound("Hall not found");
    }
    const result = {
        id: row.id,
        name: row.name,
        nameAr: row.nameAr,
        nameFr: row.nameFr,
        displayName: (0, localization_helper_1.getLocalizedName)({
            name: row.name,
            nameAr: row.nameAr,
            nameFr: row.nameFr,
        }, lang),
        lat: row.lat,
        lng: row.lng,
        map: row.lat && row.lng ? `https://maps.google.com/?q=${row.lat},${row.lng}` : null,
        status: row.status,
        branch: row.branchId
            ? {
                id: row.branchId,
                name: (0, localization_helper_1.getLocalizedName)({
                    name: row.branchName || "",
                    nameAr: row.branchNameAr,
                    nameFr: row.branchNameFr,
                }, lang),
            }
            : null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
    return (0, response_1.SuccessResponse)(res, {
        message: "Hall fetched successfully",
        data: result,
    });
};
exports.getHallById = getHallById;
// ==========================================
// 5. Update Hall
// ==========================================
const updateHall = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.halls)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.halls.id, id), (0, drizzle_orm_1.eq)(schema_1.halls.restaurantId, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Hall not found");
    }
    const { name, nameAr, nameFr, lat, lng, branch_id, branchId, branche_id, status, } = req.body;
    const targetBranchId = branch_id || branchId || branche_id;
    if (targetBranchId && targetBranchId !== existing.branchId) {
        const [targetBranch] = await connection_1.db
            .select()
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.id, targetBranchId), (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId)))
            .limit(1);
        if (!targetBranch) {
            throw new Errors_1.BadRequest("Invalid branch selected: branch not found or does not belong to your restaurant");
        }
    }
    const updateData = {};
    if (name !== undefined)
        updateData.name = name.trim();
    if (nameAr !== undefined)
        updateData.nameAr = nameAr ? nameAr.trim() : null;
    if (nameFr !== undefined)
        updateData.nameFr = nameFr ? nameFr.trim() : null;
    if (lat !== undefined)
        updateData.lat = lat ? String(lat).trim() : null;
    if (lng !== undefined)
        updateData.lng = lng ? String(lng).trim() : null;
    if (targetBranchId !== undefined)
        updateData.branchId = targetBranchId;
    if (status !== undefined)
        updateData.status = Boolean(status);
    if (Object.keys(updateData).length > 0) {
        await connection_1.db
            .update(schema_1.halls)
            .set(updateData)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.halls.id, id), (0, drizzle_orm_1.eq)(schema_1.halls.restaurantId, restaurantId)));
    }
    const [updated] = await connection_1.db
        .select()
        .from(schema_1.halls)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.halls.id, id), (0, drizzle_orm_1.eq)(schema_1.halls.restaurantId, restaurantId)))
        .limit(1);
    return (0, response_1.SuccessResponse)(res, {
        message: "Hall updated successfully",
        data: {
            ...updated,
            map: updated.lat && updated.lng ? `https://maps.google.com/?q=${updated.lat},${updated.lng}` : null,
        },
    });
};
exports.updateHall = updateHall;
// ==========================================
// 6. Delete Hall
// ==========================================
const deleteHall = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.halls)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.halls.id, id), (0, drizzle_orm_1.eq)(schema_1.halls.restaurantId, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Hall not found");
    }
    await connection_1.db
        .delete(schema_1.halls)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.halls.id, id), (0, drizzle_orm_1.eq)(schema_1.halls.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: "Hall deleted successfully",
    });
};
exports.deleteHall = deleteHall;
// ==========================================
// 7. Toggle Hall Status
// ==========================================
const toggleHallStatus = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.halls)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.halls.id, id), (0, drizzle_orm_1.eq)(schema_1.halls.restaurantId, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Hall not found");
    }
    const newStatus = !existing.status;
    await connection_1.db
        .update(schema_1.halls)
        .set({ status: newStatus })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.halls.id, id), (0, drizzle_orm_1.eq)(schema_1.halls.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: `Hall status changed to ${newStatus ? "active" : "inactive"}`,
        data: { id, status: newStatus },
    });
};
exports.toggleHallStatus = toggleHallStatus;
