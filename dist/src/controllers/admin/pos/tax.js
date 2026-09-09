"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBranches = exports.getFoods = exports.getSubcategories = exports.toggleTaxStatus = exports.deleteTax = exports.updateTax = exports.getTaxById = exports.getTaxListOptions = exports.getAllTaxes = exports.createTax = void 0;
const connection_1 = require("../../../models/connection");
const schema_1 = require("../../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../../utils/response");
const Errors_1 = require("../../../Errors");
const uuid_1 = require("uuid");
const taxes_1 = require("../../../validation/admin/taxes");
const localization_helper_1 = require("../../../helpers/localization.helper");
/**
 * Helper to enrich tax items with branch and food details
 */
async function enrichTaxesWithBranchesAndFoods(items, restaurantId, lang = "en") {
    if (items.length === 0)
        return items;
    // Collect all unique branchIds and foodIds
    const allBranchIds = Array.from(new Set(items.flatMap((item) => (Array.isArray(item.branchIds) ? item.branchIds : []))));
    const allFoodIds = Array.from(new Set(items.flatMap((item) => (Array.isArray(item.foodIds) ? item.foodIds : []))));
    // Fetch matching branches and foods concurrently
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
        const itemBranches = (Array.isArray(item.branchIds) ? item.branchIds : [])
            .map((id) => branchMap.get(id))
            .filter(Boolean)
            .map((b) => ({
            id: b.id,
            name: (0, localization_helper_1.getLocalizedName)(b, lang),
            nameAr: b.nameAr,
            nameFr: b.nameFr,
        }));
        const itemFoods = (Array.isArray(item.foodIds) ? item.foodIds : [])
            .map((id) => foodMap.get(id))
            .filter(Boolean)
            .map((f) => ({
            id: f.id,
            name: (0, localization_helper_1.getLocalizedName)(f, lang),
            nameAr: f.nameAr,
            nameFr: f.nameFr,
        }));
        const localizedName = (0, localization_helper_1.getLocalizedName)({
            name: item.name,
            nameAr: item.nameAr,
            nameFr: item.nameFr,
        }, lang);
        return {
            ...item,
            name: localizedName,
            branches: itemBranches,
            foods: itemFoods,
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
        branchIds: Array.isArray(branchIds) ? branchIds : [],
        foodIds: Array.isArray(foodIds) ? foodIds : [],
        modules: Array.isArray(modules) ? modules : ["all"],
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
// 2. Get All Taxes (Restaurant Scoped)
// ==========================================
const getAllTaxes = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const { status, type, moduleType, module_type } = req.query;
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
    const allItems = await connection_1.db
        .select()
        .from(schema_1.taxes)
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.taxes.createdAt));
    const enrichedList = await enrichTaxesWithBranchesAndFoods(allItems, restaurantId, lang);
    return (0, response_1.SuccessResponse)(res, {
        message: "Taxes fetched successfully",
        data: enrichedList,
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
        updateData.branchIds = branchIds;
    if (foodIds !== undefined)
        updateData.foodIds = foodIds;
    if (modules !== undefined)
        updateData.modules = modules;
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
// 10. Get Branches (Localized by lang en, ar, fr with fallback to en)
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
