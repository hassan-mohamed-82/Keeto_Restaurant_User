"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getServiceFeeBranches = exports.getBranches = exports.getFoods = exports.getSubcategories = exports.toggleServiceFeeStatus = exports.deleteServiceFee = exports.updateServiceFee = exports.getServiceFeeById = exports.getServiceFeeListOptions = exports.getAllServiceFees = exports.createServiceFee = void 0;
const connection_1 = require("../../../models/connection");
const schema_1 = require("../../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../../utils/response");
const Errors_1 = require("../../../Errors");
const uuid_1 = require("uuid");
const serviceFees_1 = require("../../../validation/admin/serviceFees");
const localization_helper_1 = require("../../../helpers/localization.helper");
/**
 * Helper to format service fee items without heavy nested objects
 */
function formatServiceFeeItem(item, lang = "en") {
    const localizedName = (0, localization_helper_1.getLocalizedName)({
        name: item.name || "",
        nameAr: item.nameAr,
        nameFr: item.nameFr,
    }, lang);
    return {
        id: item.id,
        name: localizedName,
        amount: item.amount,
        type: item.type,
        moduleType: item.moduleType,
        modules: (0, localization_helper_1.parseJsonArray)(item.modules),
        status: item.status,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
    };
}
/**
 * Helper to enrich service fee items with branch details (id, name, nameAr, nameFr)
 */
async function enrichServiceFeesWithBranches(items, restaurantId, lang = "en") {
    if (items.length === 0)
        return [];
    const allBranchIds = Array.from(new Set(items.flatMap((item) => (0, localization_helper_1.parseJsonArray)(item.branchIds))));
    const branchList = allBranchIds.length > 0
        ? await connection_1.db
            .select({
            id: schema_1.branches.id,
            name: schema_1.branches.name,
            nameAr: schema_1.branches.nameAr,
            nameFr: schema_1.branches.nameFr,
        })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.branches.id, allBranchIds)))
        : [];
    const branchMap = new Map();
    for (const b of branchList) {
        branchMap.set(b.id, b);
    }
    return items.map((item) => {
        const itemBranchIds = (0, localization_helper_1.parseJsonArray)(item.branchIds);
        const itemBranches = itemBranchIds
            .map((id) => branchMap.get(id))
            .filter(Boolean)
            .map((b) => ({
            id: b.id,
            name: (0, localization_helper_1.getLocalizedName)(b, lang),
            nameAr: b.nameAr,
            nameFr: b.nameFr,
        }));
        const localizedName = (0, localization_helper_1.getLocalizedName)({
            name: item.name || "",
            nameAr: item.nameAr,
            nameFr: item.nameFr,
        }, lang);
        return {
            id: item.id,
            restaurantId: item.restaurantId,
            name: localizedName,
            nameAr: item.nameAr,
            nameFr: item.nameFr,
            amount: item.amount,
            type: item.type,
            moduleType: item.moduleType,
            modules: (0, localization_helper_1.parseJsonArray)(item.modules),
            branchIds: itemBranchIds,
            branches: itemBranches,
            status: item.status,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
        };
    });
}
// ==========================================
// 1. Create Service Fee
// ==========================================
const createServiceFee = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const { name, nameAr, nameFr, amount, type, moduleType, module_type, branchIds, modules, status } = req.body;
    const finalModuleType = moduleType || module_type || "all";
    const finalBranchIds = (0, localization_helper_1.parseJsonArray)(branchIds);
    const finalModules = (0, localization_helper_1.parseJsonArray)(modules).length > 0 ? (0, localization_helper_1.parseJsonArray)(modules) : ["all"];
    const id = (0, uuid_1.v4)();
    await connection_1.db.insert(schema_1.serviceFees).values({
        id,
        restaurantId,
        name: name || null,
        nameAr: nameAr || null,
        nameFr: nameFr || null,
        amount: String(amount),
        type,
        moduleType: finalModuleType,
        branchIds: finalBranchIds,
        modules: finalModules,
        status: status || "active",
    });
    const [createdItem] = await connection_1.db
        .select()
        .from(schema_1.serviceFees)
        .where((0, drizzle_orm_1.eq)(schema_1.serviceFees.id, id))
        .limit(1);
    const [enriched] = await enrichServiceFeesWithBranches([createdItem], restaurantId, lang);
    return (0, response_1.SuccessResponse)(res, {
        message: "Service fee created successfully",
        data: enriched || createdItem,
    }, 201);
};
exports.createServiceFee = createServiceFee;
// ==========================================
// 2. Get All Service Fees (Paginated & Restaurant Scoped)
// ==========================================
const getAllServiceFees = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const params = { ...req.query, ...req.body };
    const { status, type, moduleType, module_type, search, all } = params;
    const page = Math.max(1, parseInt(params.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(params.limit) || 10));
    const offset = (page - 1) * limit;
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.serviceFees.restaurantId, restaurantId)];
    if (status && (status === "active" || status === "inactive")) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.serviceFees.status, status));
    }
    if (type && (type === "web" || type === "app" || type === "all")) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.serviceFees.type, type));
    }
    const filterModuleType = moduleType || module_type;
    if (filterModuleType &&
        (filterModuleType === "pos" || filterModuleType === "online" || filterModuleType === "all")) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.serviceFees.moduleType, filterModuleType));
    }
    if (search && typeof search === "string" && search.trim() !== "") {
        const term = `%${search.trim()}%`;
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(schema_1.serviceFees.name, term), (0, drizzle_orm_1.like)(schema_1.serviceFees.nameAr, term), (0, drizzle_orm_1.like)(schema_1.serviceFees.nameFr, term)));
    }
    const isAll = all === "true";
    const [totalCountResult, rawItems] = await Promise.all([
        connection_1.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema_1.serviceFees)
            .where((0, drizzle_orm_1.and)(...conditions)),
        isAll
            ? connection_1.db
                .select()
                .from(schema_1.serviceFees)
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.serviceFees.createdAt))
            : connection_1.db
                .select()
                .from(schema_1.serviceFees)
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.serviceFees.createdAt))
                .limit(limit)
                .offset(offset),
    ]);
    const totalItems = Number(totalCountResult[0]?.count || 0);
    const totalPages = isAll ? 1 : Math.ceil(totalItems / limit);
    const formattedList = rawItems.map((item) => formatServiceFeeItem(item, lang));
    return (0, response_1.SuccessResponse)(res, {
        message: "Service fees fetched successfully",
        data: formattedList,
        pagination: {
            page: isAll ? 1 : page,
            limit: isAll ? totalItems : limit,
            totalItems,
            totalPages,
        },
    });
};
exports.getAllServiceFees = getAllServiceFees;
// ==========================================
// 3. Get Service Fee Options / List Data (Branches, Modules, Types)
// ==========================================
const getServiceFeeListOptions = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    // Get active branches for this restaurant
    const myBranches = await connection_1.db
        .select({
        id: schema_1.branches.id,
        name: schema_1.branches.name,
        nameAr: schema_1.branches.nameAr,
        nameFr: schema_1.branches.nameFr,
    })
        .from(schema_1.branches)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.branches.status, "active")));
    const localizedBranches = myBranches.map((b) => ({
        id: b.id,
        name: (0, localization_helper_1.getLocalizedName)(b, lang),
        nameAr: b.nameAr,
        nameFr: b.nameFr,
    }));
    return (0, response_1.SuccessResponse)(res, {
        message: "Service fee options fetched successfully",
        data: {
            branches: localizedBranches,
            modules: serviceFees_1.SERVICE_FEE_MODULES,
            types: serviceFees_1.SERVICE_FEE_TYPES,
            moduleTypes: serviceFees_1.SERVICE_FEE_MODULE_TYPES,
        },
    });
};
exports.getServiceFeeListOptions = getServiceFeeListOptions;
// ==========================================
// 4. Get Service Fee By ID
// ==========================================
const getServiceFeeById = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const { id } = req.params;
    const [item] = await connection_1.db
        .select()
        .from(schema_1.serviceFees)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.serviceFees.id, id), (0, drizzle_orm_1.eq)(schema_1.serviceFees.restaurantId, restaurantId)))
        .limit(1);
    if (!item) {
        throw new Errors_1.NotFound("Service fee not found");
    }
    const [enriched] = await enrichServiceFeesWithBranches([item], restaurantId, lang);
    return (0, response_1.SuccessResponse)(res, {
        message: "Service fee fetched successfully",
        data: enriched || item,
    });
};
exports.getServiceFeeById = getServiceFeeById;
// ==========================================
// 5. Update Service Fee
// ==========================================
const updateServiceFee = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const { id } = req.params;
    const [existingItem] = await connection_1.db
        .select()
        .from(schema_1.serviceFees)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.serviceFees.id, id), (0, drizzle_orm_1.eq)(schema_1.serviceFees.restaurantId, restaurantId)))
        .limit(1);
    if (!existingItem) {
        throw new Errors_1.NotFound("Service fee not found");
    }
    const { name, nameAr, nameFr, amount, type, moduleType, module_type, branchIds, modules, status } = req.body;
    const updateData = {};
    if (name !== undefined)
        updateData.name = name;
    if (nameAr !== undefined)
        updateData.nameAr = nameAr;
    if (nameFr !== undefined)
        updateData.nameFr = nameFr;
    if (amount !== undefined)
        updateData.amount = String(amount);
    if (type !== undefined)
        updateData.type = type;
    const finalModuleType = moduleType || module_type;
    if (finalModuleType !== undefined)
        updateData.moduleType = finalModuleType;
    if (branchIds !== undefined)
        updateData.branchIds = (0, localization_helper_1.parseJsonArray)(branchIds);
    if (modules !== undefined)
        updateData.modules = (0, localization_helper_1.parseJsonArray)(modules);
    if (status !== undefined)
        updateData.status = status;
    if (Object.keys(updateData).length > 0) {
        await connection_1.db
            .update(schema_1.serviceFees)
            .set(updateData)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.serviceFees.id, id), (0, drizzle_orm_1.eq)(schema_1.serviceFees.restaurantId, restaurantId)));
    }
    const [updatedItem] = await connection_1.db
        .select()
        .from(schema_1.serviceFees)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.serviceFees.id, id), (0, drizzle_orm_1.eq)(schema_1.serviceFees.restaurantId, restaurantId)))
        .limit(1);
    const [enriched] = await enrichServiceFeesWithBranches([updatedItem], restaurantId, lang);
    return (0, response_1.SuccessResponse)(res, {
        message: "Service fee updated successfully",
        data: enriched || updatedItem,
    });
};
exports.updateServiceFee = updateServiceFee;
// ==========================================
// 6. Delete Service Fee
// ==========================================
const deleteServiceFee = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existingItem] = await connection_1.db
        .select()
        .from(schema_1.serviceFees)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.serviceFees.id, id), (0, drizzle_orm_1.eq)(schema_1.serviceFees.restaurantId, restaurantId)))
        .limit(1);
    if (!existingItem) {
        throw new Errors_1.NotFound("Service fee not found");
    }
    await connection_1.db
        .delete(schema_1.serviceFees)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.serviceFees.id, id), (0, drizzle_orm_1.eq)(schema_1.serviceFees.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: "Service fee deleted successfully",
    });
};
exports.deleteServiceFee = deleteServiceFee;
// ==========================================
// 7. Toggle Service Fee Status (Active / Inactive)
// ==========================================
const toggleServiceFeeStatus = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existingItem] = await connection_1.db
        .select()
        .from(schema_1.serviceFees)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.serviceFees.id, id), (0, drizzle_orm_1.eq)(schema_1.serviceFees.restaurantId, restaurantId)))
        .limit(1);
    if (!existingItem) {
        throw new Errors_1.NotFound("Service fee not found");
    }
    const newStatus = existingItem.status === "active" ? "inactive" : "active";
    await connection_1.db
        .update(schema_1.serviceFees)
        .set({ status: newStatus })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.serviceFees.id, id), (0, drizzle_orm_1.eq)(schema_1.serviceFees.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: `Service fee status changed to ${newStatus}`,
        data: { id, status: newStatus },
    });
};
exports.toggleServiceFeeStatus = toggleServiceFeeStatus;
// ==========================================
// 8. Get Subcategories (Localized by lang in body/query/headers)
// ==========================================
const getSubcategories = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const subList = await connection_1.db
        .select({
        id: schema_1.subcategories.id,
        name: schema_1.subcategories.name,
        nameAr: schema_1.subcategories.nameAr,
        nameFr: schema_1.subcategories.nameFr,
    })
        .from(schema_1.subcategories)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.subcategories.status, "active")));
    const formatted = subList.map((sub) => ({
        id: sub.id,
        name: (0, localization_helper_1.getLocalizedName)(sub, lang),
    }));
    return (0, response_1.SuccessResponse)(res, {
        message: "Subcategories fetched successfully",
        data: formatted,
    });
};
exports.getSubcategories = getSubcategories;
// ==========================================
// 9. Get Foods (Localized by lang & filtered by subcategory_id)
// ==========================================
const getFoods = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const subcategoryId = req.query?.subcategory_id ||
        req.query?.subcategoryId ||
        req.body?.subcategory_id ||
        req.body?.subcategoryId;
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)];
    if (subcategoryId && typeof subcategoryId === "string") {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.food.subcategoryid, subcategoryId));
    }
    const foodList = await connection_1.db
        .select({
        id: schema_1.food.id,
        name: schema_1.food.name,
        nameAr: schema_1.food.nameAr,
        nameFr: schema_1.food.nameFr,
        subcategoryId: schema_1.food.subcategoryid,
    })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)(...conditions));
    const formatted = foodList.map((f) => ({
        id: f.id,
        name: (0, localization_helper_1.getLocalizedName)(f, lang),
        subcategoryId: f.subcategoryId,
    }));
    return (0, response_1.SuccessResponse)(res, {
        message: "Foods fetched successfully",
        data: formatted,
    });
};
exports.getFoods = getFoods;
// ==========================================
// 10. Get Branches (Localized by lang en, ar, fr with optional serviceFeeId filter)
// ==========================================
const getBranches = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const serviceFeeId = req.params?.id ||
        req.query?.serviceFeeId ||
        req.body?.serviceFeeId ||
        req.query?.service_fee_id ||
        req.body?.service_fee_id;
    if (serviceFeeId) {
        const [feeItem] = await connection_1.db
            .select({ branchIds: schema_1.serviceFees.branchIds })
            .from(schema_1.serviceFees)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.serviceFees.id, String(serviceFeeId)), (0, drizzle_orm_1.eq)(schema_1.serviceFees.restaurantId, restaurantId)))
            .limit(1);
        if (!feeItem) {
            throw new Errors_1.NotFound("Service fee not found");
        }
        const branchIds = (0, localization_helper_1.parseJsonArray)(feeItem.branchIds);
        if (branchIds.length === 0) {
            return (0, response_1.SuccessResponse)(res, {
                message: "Branches fetched successfully",
                data: [],
            });
        }
        const myBranches = await connection_1.db
            .select({
            id: schema_1.branches.id,
            name: schema_1.branches.name,
            nameAr: schema_1.branches.nameAr,
            nameFr: schema_1.branches.nameFr,
        })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.branches.id, branchIds)));
        const formatted = myBranches.map((b) => ({
            id: b.id,
            name: (0, localization_helper_1.getLocalizedName)(b, lang),
        }));
        return (0, response_1.SuccessResponse)(res, {
            message: "Branches fetched successfully",
            data: formatted,
        });
    }
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
// ==========================================
// 11. Get Branches of a Specific Service Fee
// ==========================================
const getServiceFeeBranches = async (req, res) => {
    return (0, exports.getBranches)(req, res);
};
exports.getServiceFeeBranches = getServiceFeeBranches;
