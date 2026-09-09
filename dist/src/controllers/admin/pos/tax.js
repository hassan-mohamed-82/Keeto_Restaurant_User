"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTaxFoods = exports.getTaxBranches = exports.getBranches = exports.getFoods = exports.getSubcategories = exports.toggleTaxStatus = exports.deleteTax = exports.updateTax = exports.getTaxById = exports.getTaxListOptions = exports.getAllTaxes = exports.createTax = void 0;
const connection_1 = require("../../../models/connection");
const schema_1 = require("../../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../../utils/response");
const Errors_1 = require("../../../Errors");
const uuid_1 = require("uuid");
const taxes_1 = require("../../../validation/admin/taxes");
const localization_helper_1 = require("../../../helpers/localization.helper");
/**
 * Helper to format tax items without heavy nested objects
 */
function formatTaxItem(item, lang = "en") {
    const localizedName = (0, localization_helper_1.getLocalizedName)({
        name: item.name || "",
        nameAr: item.nameAr,
        nameFr: item.nameFr,
    }, lang);
    return {
        id: item.id,
        restaurantId: item.restaurantId,
        name: localizedName,
        type: item.type,
        moduleType: item.moduleType,
        modules: (0, localization_helper_1.parseJsonArray)(item.modules),
        status: item.status,
    };
}
/**
 * Helper to enrich tax items with branch and food details
 */
async function enrichTaxesWithBranchesAndFoods(items, restaurantId, lang = "en") {
    if (items.length === 0)
        return [];
    const allBranchIds = Array.from(new Set(items.flatMap((item) => (0, localization_helper_1.parseJsonArray)(item.branchIds))));
    const allFoodIds = Array.from(new Set(items.flatMap((item) => (0, localization_helper_1.parseJsonArray)(item.foodIds))));
    const [branchList, foodList] = await Promise.all([
        allBranchIds.length > 0
            ? connection_1.db
                .select({
                id: schema_1.branches.id,
                name: schema_1.branches.name,
                nameAr: schema_1.branches.nameAr,
                nameFr: schema_1.branches.nameFr,
            })
                .from(schema_1.branches)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.branches.id, allBranchIds)))
            : Promise.resolve([]),
        allFoodIds.length > 0
            ? connection_1.db
                .select({
                id: schema_1.food.id,
                name: schema_1.food.name,
                nameAr: schema_1.food.nameAr,
                nameFr: schema_1.food.nameFr,
            })
                .from(schema_1.food)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.food.id, allFoodIds)))
            : Promise.resolve([]),
    ]);
    const branchMap = new Map();
    for (const b of branchList) {
        branchMap.set(b.id, b);
    }
    const foodMap = new Map();
    for (const f of foodList) {
        foodMap.set(f.id, f);
    }
    return items.map((item) => {
        const itemBranchIds = (0, localization_helper_1.parseJsonArray)(item.branchIds);
        const itemFoodIds = (0, localization_helper_1.parseJsonArray)(item.foodIds);
        const itemBranches = itemBranchIds
            .map((id) => branchMap.get(id))
            .filter(Boolean)
            .map((b) => ({
            id: b.id,
            name: (0, localization_helper_1.getLocalizedName)(b, lang),
            nameAr: b.nameAr,
            nameFr: b.nameFr,
        }));
        const itemFoods = itemFoodIds
            .map((id) => foodMap.get(id))
            .filter(Boolean)
            .map((f) => ({
            id: f.id,
            name: (0, localization_helper_1.getLocalizedName)(f, lang),
            nameAr: f.nameAr,
            nameFr: f.nameFr,
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
            foodIds: itemFoodIds,
            branches: itemBranches,
            foods: itemFoods,
            status: item.status,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
        };
    });
}
// ==========================================
// 1. Create Tax
// ==========================================
const createTax = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const { name, nameAr, nameFr, amount, type, moduleType, module_type, branchIds, foodIds, modules, status } = req.body;
    const finalModuleType = moduleType || module_type || "all";
    const finalBranchIds = (0, localization_helper_1.parseJsonArray)(branchIds);
    const finalFoodIds = (0, localization_helper_1.parseJsonArray)(foodIds);
    const finalModules = (0, localization_helper_1.parseJsonArray)(modules).length > 0 ? (0, localization_helper_1.parseJsonArray)(modules) : ["all"];
    const id = (0, uuid_1.v4)();
    await connection_1.db.insert(schema_1.taxes).values({
        id,
        restaurantId,
        name,
        nameAr: nameAr || null,
        nameFr: nameFr || null,
        amount: String(amount),
        type,
        moduleType: finalModuleType,
        branchIds: finalBranchIds,
        foodIds: finalFoodIds,
        modules: finalModules,
        status: status || "active",
    });
    const [createdItem] = await connection_1.db
        .select()
        .from(schema_1.taxes)
        .where((0, drizzle_orm_1.eq)(schema_1.taxes.id, id))
        .limit(1);
    const [enriched] = await enrichTaxesWithBranchesAndFoods([createdItem], restaurantId, lang);
    return (0, response_1.SuccessResponse)(res, {
        message: "Tax created successfully",
        data: enriched || createdItem,
    }, 201);
};
exports.createTax = createTax;
// ==========================================
// 2. Get All Taxes (Paginated & Restaurant Scoped)
// ==========================================
const getAllTaxes = async (req, res) => {
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
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.taxes.restaurantId, restaurantId)];
    if (status && (status === "active" || status === "inactive")) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.taxes.status, status));
    }
    if (type && (type === "web" || type === "app" || type === "all")) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.taxes.type, type));
    }
    const filterModuleType = moduleType || module_type;
    if (filterModuleType &&
        (filterModuleType === "pos" || filterModuleType === "online" || filterModuleType === "all")) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.taxes.moduleType, filterModuleType));
    }
    if (search && typeof search === "string" && search.trim() !== "") {
        const term = `%${search.trim()}%`;
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(schema_1.taxes.name, term), (0, drizzle_orm_1.like)(schema_1.taxes.nameAr, term), (0, drizzle_orm_1.like)(schema_1.taxes.nameFr, term)));
    }
    const isAll = all === "true";
    const [totalCountResult, rawItems] = await Promise.all([
        connection_1.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema_1.taxes)
            .where((0, drizzle_orm_1.and)(...conditions)),
        isAll
            ? connection_1.db
                .select()
                .from(schema_1.taxes)
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.taxes.createdAt))
            : connection_1.db
                .select()
                .from(schema_1.taxes)
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.taxes.createdAt))
                .limit(limit)
                .offset(offset),
    ]);
    const totalItems = Number(totalCountResult[0]?.count || 0);
    const totalPages = isAll ? 1 : Math.ceil(totalItems / limit);
    const formattedList = rawItems.map((item) => formatTaxItem(item, lang));
    return (0, response_1.SuccessResponse)(res, {
        message: "Taxes fetched successfully",
        data: formattedList,
        pagination: {
            page: isAll ? 1 : page,
            limit: isAll ? totalItems : limit,
            totalItems,
            totalPages,
        },
    });
};
exports.getAllTaxes = getAllTaxes;
// ==========================================
// 3. Get Tax Options / List Data (Branches, Foods, Modules, Types)
// ==========================================
const getTaxListOptions = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    // Concurrent fetch for active branches and restaurant foods
    const [myBranches, myFoods] = await Promise.all([
        connection_1.db
            .select({
            id: schema_1.branches.id,
            name: schema_1.branches.name,
            nameAr: schema_1.branches.nameAr,
            nameFr: schema_1.branches.nameFr,
        })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.branches.status, "active"))),
        connection_1.db
            .select({
            id: schema_1.food.id,
            name: schema_1.food.name,
            nameAr: schema_1.food.nameAr,
            nameFr: schema_1.food.nameFr,
        })
            .from(schema_1.food)
            .where((0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)),
    ]);
    const localizedBranches = myBranches.map((b) => ({
        id: b.id,
        name: (0, localization_helper_1.getLocalizedName)(b, lang),
        nameAr: b.nameAr,
        nameFr: b.nameFr,
    }));
    const localizedFoods = myFoods.map((f) => ({
        id: f.id,
        name: (0, localization_helper_1.getLocalizedName)(f, lang),
        nameAr: f.nameAr,
        nameFr: f.nameFr,
    }));
    return (0, response_1.SuccessResponse)(res, {
        message: "Tax options fetched successfully",
        data: {
            branches: localizedBranches,
            foods: localizedFoods,
            modules: taxes_1.TAX_MODULES,
            types: taxes_1.TAX_TYPES,
            moduleTypes: taxes_1.TAX_MODULE_TYPES,
        },
    });
};
exports.getTaxListOptions = getTaxListOptions;
// ==========================================
// 4. Get Tax By ID
// ==========================================
const getTaxById = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const { id } = req.params;
    const [item] = await connection_1.db
        .select()
        .from(schema_1.taxes)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.taxes.id, id), (0, drizzle_orm_1.eq)(schema_1.taxes.restaurantId, restaurantId)))
        .limit(1);
    if (!item) {
        throw new Errors_1.NotFound("Tax not found");
    }
    const [enriched] = await enrichTaxesWithBranchesAndFoods([item], restaurantId, lang);
    return (0, response_1.SuccessResponse)(res, {
        message: "Tax fetched successfully",
        data: enriched || item,
    });
};
exports.getTaxById = getTaxById;
// ==========================================
// 5. Update Tax
// ==========================================
const updateTax = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const { id } = req.params;
    const [existingItem] = await connection_1.db
        .select()
        .from(schema_1.taxes)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.taxes.id, id), (0, drizzle_orm_1.eq)(schema_1.taxes.restaurantId, restaurantId)))
        .limit(1);
    if (!existingItem) {
        throw new Errors_1.NotFound("Tax not found");
    }
    const { name, nameAr, nameFr, amount, type, moduleType, module_type, branchIds, foodIds, modules, status } = req.body;
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
    if (foodIds !== undefined)
        updateData.foodIds = (0, localization_helper_1.parseJsonArray)(foodIds);
    if (modules !== undefined)
        updateData.modules = (0, localization_helper_1.parseJsonArray)(modules);
    if (status !== undefined)
        updateData.status = status;
    if (Object.keys(updateData).length > 0) {
        await connection_1.db
            .update(schema_1.taxes)
            .set(updateData)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.taxes.id, id), (0, drizzle_orm_1.eq)(schema_1.taxes.restaurantId, restaurantId)));
    }
    const [updatedItem] = await connection_1.db
        .select()
        .from(schema_1.taxes)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.taxes.id, id), (0, drizzle_orm_1.eq)(schema_1.taxes.restaurantId, restaurantId)))
        .limit(1);
    const [enriched] = await enrichTaxesWithBranchesAndFoods([updatedItem], restaurantId, lang);
    return (0, response_1.SuccessResponse)(res, {
        message: "Tax updated successfully",
        data: enriched || updatedItem,
    });
};
exports.updateTax = updateTax;
// ==========================================
// 6. Delete Tax
// ==========================================
const deleteTax = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existingItem] = await connection_1.db
        .select()
        .from(schema_1.taxes)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.taxes.id, id), (0, drizzle_orm_1.eq)(schema_1.taxes.restaurantId, restaurantId)))
        .limit(1);
    if (!existingItem) {
        throw new Errors_1.NotFound("Tax not found");
    }
    await connection_1.db
        .delete(schema_1.taxes)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.taxes.id, id), (0, drizzle_orm_1.eq)(schema_1.taxes.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: "Tax deleted successfully",
    });
};
exports.deleteTax = deleteTax;
// ==========================================
// 7. Toggle Tax Status (Active / Inactive)
// ==========================================
const toggleTaxStatus = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existingItem] = await connection_1.db
        .select()
        .from(schema_1.taxes)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.taxes.id, id), (0, drizzle_orm_1.eq)(schema_1.taxes.restaurantId, restaurantId)))
        .limit(1);
    if (!existingItem) {
        throw new Errors_1.NotFound("Tax not found");
    }
    const newStatus = existingItem.status === "active" ? "inactive" : "active";
    await connection_1.db
        .update(schema_1.taxes)
        .set({ status: newStatus })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.taxes.id, id), (0, drizzle_orm_1.eq)(schema_1.taxes.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: `Tax status changed to ${newStatus}`,
        data: { id, status: newStatus },
    });
};
exports.toggleTaxStatus = toggleTaxStatus;
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
// 9. Get Foods (Localized by lang & filtered by tax or subcategory_id)
// ==========================================
const getFoods = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const taxId = req.params.id ||
        req.query.taxId ||
        req.body.taxId ||
        req.query.tax_id ||
        req.body.tax_id;
    if (taxId) {
        const [taxItem] = await connection_1.db
            .select({ foodIds: schema_1.taxes.foodIds })
            .from(schema_1.taxes)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.taxes.id, String(taxId)), (0, drizzle_orm_1.eq)(schema_1.taxes.restaurantId, restaurantId)))
            .limit(1);
        if (!taxItem) {
            throw new Errors_1.NotFound("Tax not found");
        }
        const foodIds = (0, localization_helper_1.parseJsonArray)(taxItem.foodIds);
        if (foodIds.length === 0) {
            return (0, response_1.SuccessResponse)(res, {
                message: "Foods fetched successfully",
                data: [],
            });
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
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.food.id, foodIds)));
        const formatted = foodList.map((f) => ({
            id: f.id,
            name: (0, localization_helper_1.getLocalizedName)(f, lang),
            subcategoryId: f.subcategoryId,
        }));
        return (0, response_1.SuccessResponse)(res, {
            message: "Foods fetched successfully",
            data: formatted,
        });
    }
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
// 10. Get Branches (Localized by lang en, ar, fr with optional taxId filter)
// ==========================================
const getBranches = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const taxId = req.params.id ||
        req.query.taxId ||
        req.body.taxId ||
        req.query.tax_id ||
        req.body.tax_id;
    if (taxId) {
        const [taxItem] = await connection_1.db
            .select({ branchIds: schema_1.taxes.branchIds })
            .from(schema_1.taxes)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.taxes.id, String(taxId)), (0, drizzle_orm_1.eq)(schema_1.taxes.restaurantId, restaurantId)))
            .limit(1);
        if (!taxItem) {
            throw new Errors_1.NotFound("Tax not found");
        }
        const branchIds = (0, localization_helper_1.parseJsonArray)(taxItem.branchIds);
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
// 11. Get Branches of a Specific Tax
// ==========================================
const getTaxBranches = async (req, res) => {
    return (0, exports.getBranches)(req, res);
};
exports.getTaxBranches = getTaxBranches;
// ==========================================
// 12. Get Foods of a Specific Tax
// ==========================================
const getTaxFoods = async (req, res) => {
    return (0, exports.getFoods)(req, res);
};
exports.getTaxFoods = getTaxFoods;
