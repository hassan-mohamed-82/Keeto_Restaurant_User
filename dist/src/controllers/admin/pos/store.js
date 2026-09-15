"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toggleStoreStatus = exports.deleteStore = exports.updateStore = exports.getStoreById = exports.getBranchForSelection = exports.getAllStores = exports.createStore = void 0;
const connection_1 = require("../../../models/connection");
const schema_1 = require("../../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../../utils/response");
const Errors_1 = require("../../../Errors");
const uuid_1 = require("uuid");
const localization_helper_1 = require("../../../helpers/localization.helper");
const buildGoogleMapsLink = (lat, lng) => {
    if (!lat || !lng)
        return null;
    return `https://maps.google.com/?q=${lat},${lng}`;
};
// ==========================================
// 1. Create Store
// ==========================================
const createStore = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { name, nameAr, nameFr, lat, lng, branche_ids, brancheIds, status, } = req.body;
    const rawBranches = branche_ids !== undefined ? branche_ids : brancheIds;
    const finalBranchIds = (0, localization_helper_1.parseJsonArray)(rawBranches);
    const id = (0, uuid_1.v4)();
    await connection_1.db.insert(schema_1.stores).values({
        id,
        restaurantId,
        name,
        nameAr: nameAr || null,
        nameFr: nameFr || null,
        lat: lat !== undefined && lat !== null ? String(lat) : null,
        lng: lng !== undefined && lng !== null ? String(lng) : null,
        brancheIds: finalBranchIds,
        status: status !== undefined ? Boolean(status) : true,
    });
    const [created] = await connection_1.db
        .select()
        .from(schema_1.stores)
        .where((0, drizzle_orm_1.eq)(schema_1.stores.id, id))
        .limit(1);
    return (0, response_1.SuccessResponse)(res, {
        message: "Store created successfully",
        data: {
            ...created,
            branche_ids: (0, localization_helper_1.parseJsonArray)(created.brancheIds),
            map: buildGoogleMapsLink(created.lat, created.lng),
        },
    }, 201);
};
exports.createStore = createStore;
// ==========================================
// 2. Get All Stores (Returns localized name only for list view)
// ==========================================
const getAllStores = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const params = { ...req.query, ...req.body };
    const { search, status, all } = params;
    const page = Math.max(1, parseInt(params.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(params.limit) || 10));
    const offset = (page - 1) * limit;
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.stores.restaurantId, restaurantId)];
    if (status !== undefined && status !== "") {
        const boolStatus = status === true || status === "true" || status === 1 || status === "1";
        conditions.push((0, drizzle_orm_1.eq)(schema_1.stores.status, boolStatus));
    }
    if (search && typeof search === "string" && search.trim() !== "") {
        const term = `%${search.trim()}%`;
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(schema_1.stores.name, term), (0, drizzle_orm_1.like)(schema_1.stores.nameAr, term), (0, drizzle_orm_1.like)(schema_1.stores.nameFr, term)));
    }
    const isAll = all === "true" || all === true;
    const [totalCountResult, rawStores] = await Promise.all([
        connection_1.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema_1.stores)
            .where((0, drizzle_orm_1.and)(...conditions)),
        isAll
            ? connection_1.db
                .select()
                .from(schema_1.stores)
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.stores.createdAt))
            : connection_1.db
                .select()
                .from(schema_1.stores)
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.stores.createdAt))
                .limit(limit)
                .offset(offset),
    ]);
    const totalItems = Number(totalCountResult[0]?.count || 0);
    const totalPages = isAll ? 1 : Math.ceil(totalItems / limit);
    // Rule: In fetch all, only display name by lang along with essentials
    const formattedStores = rawStores.map((s) => ({
        id: s.id,
        name: (0, localization_helper_1.getLocalizedName)(s, lang),
        status: s.status,
        map: buildGoogleMapsLink(s.lat, s.lng),
        createdAt: s.createdAt,
    }));
    return (0, response_1.SuccessResponse)(res, {
        message: "Stores fetched successfully",
        data: formattedStores,
        pagination: {
            page: isAll ? 1 : page,
            limit: isAll ? totalItems : limit,
            totalItems,
            totalPages,
        },
    });
};
exports.getAllStores = getAllStores;
// ==========================================
// 3. Get Stores For Selection (Dropdown API: id & name by lang)
// ==========================================
const getBranchForSelection = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const activeBranch = await connection_1.db
        .select({
        id: schema_1.branches.id,
        name: schema_1.branches.name,
        nameAr: schema_1.branches.nameAr,
        nameFr: schema_1.branches.nameFr,
    })
        .from(schema_1.branches)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.branches.status, "active")))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.branches.createdAt));
    const formatted = activeBranch.map((s) => ({
        id: s.id,
        name: (0, localization_helper_1.getLocalizedName)(s, lang),
    }));
    return (0, response_1.SuccessResponse)(res, {
        message: "Branch for selection fetched successfully",
        data: formatted,
    });
};
exports.getBranchForSelection = getBranchForSelection;
// ==========================================
// 4. Get Store By ID (Full details + map link + branches as [{id, name by lang}])
// ==========================================
const getStoreById = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const { id } = req.params;
    const [store] = await connection_1.db
        .select()
        .from(schema_1.stores)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.stores.id, id), (0, drizzle_orm_1.eq)(schema_1.stores.restaurantId, restaurantId)))
        .limit(1);
    if (!store) {
        throw new Errors_1.NotFound("Store not found");
    }
    const branchIds = (0, localization_helper_1.parseJsonArray)(store.brancheIds);
    let resolvedBranches = [];
    if (branchIds.length > 0) {
        const branchRows = await connection_1.db
            .select({
            id: schema_1.branches.id,
            name: schema_1.branches.name,
            nameAr: schema_1.branches.nameAr,
            nameFr: schema_1.branches.nameFr,
        })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.branches.id, branchIds)));
        resolvedBranches = branchRows.map((b) => ({
            id: b.id,
            name: (0, localization_helper_1.getLocalizedName)(b, lang),
        }));
    }
    const result = {
        id: store.id,
        restaurantId: store.restaurantId,
        name: store.name,
        nameAr: store.nameAr,
        nameFr: store.nameFr,
        localizedName: (0, localization_helper_1.getLocalizedName)(store, lang),
        lat: store.lat,
        lng: store.lng,
        map: buildGoogleMapsLink(store.lat, store.lng),
        branche_ids: branchIds,
        branches: resolvedBranches,
        status: store.status,
        createdAt: store.createdAt,
        updatedAt: store.updatedAt,
    };
    return (0, response_1.SuccessResponse)(res, {
        message: "Store fetched successfully",
        data: result,
    });
};
exports.getStoreById = getStoreById;
// ==========================================
// 5. Update Store
// ==========================================
const updateStore = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.stores)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.stores.id, id), (0, drizzle_orm_1.eq)(schema_1.stores.restaurantId, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Store not found");
    }
    const { name, nameAr, nameFr, lat, lng, branche_ids, brancheIds, status, } = req.body;
    const updateData = {};
    if (name !== undefined)
        updateData.name = name;
    if (nameAr !== undefined)
        updateData.nameAr = nameAr;
    if (nameFr !== undefined)
        updateData.nameFr = nameFr;
    if (lat !== undefined)
        updateData.lat = lat !== null ? String(lat) : null;
    if (lng !== undefined)
        updateData.lng = lng !== null ? String(lng) : null;
    const rawBranches = branche_ids !== undefined ? branche_ids : brancheIds;
    if (rawBranches !== undefined) {
        updateData.brancheIds = (0, localization_helper_1.parseJsonArray)(rawBranches);
    }
    if (status !== undefined)
        updateData.status = Boolean(status);
    if (Object.keys(updateData).length > 0) {
        await connection_1.db
            .update(schema_1.stores)
            .set(updateData)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.stores.id, id), (0, drizzle_orm_1.eq)(schema_1.stores.restaurantId, restaurantId)));
    }
    const [updated] = await connection_1.db
        .select()
        .from(schema_1.stores)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.stores.id, id), (0, drizzle_orm_1.eq)(schema_1.stores.restaurantId, restaurantId)))
        .limit(1);
    return (0, response_1.SuccessResponse)(res, {
        message: "Store updated successfully",
        data: {
            ...updated,
            branche_ids: (0, localization_helper_1.parseJsonArray)(updated.brancheIds),
            map: buildGoogleMapsLink(updated.lat, updated.lng),
        },
    });
};
exports.updateStore = updateStore;
// ==========================================
// 6. Delete Store
// ==========================================
const deleteStore = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.stores)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.stores.id, id), (0, drizzle_orm_1.eq)(schema_1.stores.restaurantId, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Store not found");
    }
    await connection_1.db
        .delete(schema_1.stores)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.stores.id, id), (0, drizzle_orm_1.eq)(schema_1.stores.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: "Store deleted successfully",
    });
};
exports.deleteStore = deleteStore;
// ==========================================
// 7. Toggle Store Status
// ==========================================
const toggleStoreStatus = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.stores)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.stores.id, id), (0, drizzle_orm_1.eq)(schema_1.stores.restaurantId, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Store not found");
    }
    const newStatus = !existing.status;
    await connection_1.db
        .update(schema_1.stores)
        .set({ status: newStatus })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.stores.id, id), (0, drizzle_orm_1.eq)(schema_1.stores.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: `Store status changed to ${newStatus ? "active" : "inactive"}`,
        data: { id, status: newStatus },
    });
};
exports.toggleStoreStatus = toggleStoreStatus;
