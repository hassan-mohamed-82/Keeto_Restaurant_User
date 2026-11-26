"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBranches = exports.getFoods = exports.getSubcategories = exports.toggleTaxStatus = exports.deleteTax = exports.updateTax = exports.getTaxById = exports.getTaxListOptions = exports.getAllTaxes = exports.createTax = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const Errors_1 = require("../../Errors");
const uuid_1 = require("uuid");
const tax_1 = require("../../validation/admin/tax");
const localization_helper_1 = require("../../helpers/localization.helper");
const tax_helper_1 = require("../../helpers/tax.helper");
/**
 * Restaurant taxes
 * ─────────────────────────────────────────────────────────────
 *  source = "restaurant" → created here by the restaurant admin (taxType include | exclude).
 *  source = "keeto"      → created by the super admin for all restaurants or for selected ones (always exclude).
 *                          The restaurant can SEE Keeto taxes but cannot edit / delete / toggle them.
 *
 *  include → the food price already contains the tax (display only).
 *  exclude → calculated and added to the order total.
 */
const getRestaurantId = (req) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    return restaurantId;
};
const ownTax = (id, restaurantId) => (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.taxes.id, id), (0, drizzle_orm_1.eq)(schema_1.taxes.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.taxes.source, "restaurant"));
function formatTaxItem(item, lang = "en") {
    return {
        id: item.id,
        restaurantId: item.source === "keeto" ? null : item.restaurantId,
        name: (0, localization_helper_1.getLocalizedName)({ name: item.name || "", nameAr: item.nameAr, nameFr: item.nameFr }, lang),
        amount: item.amount,
        amountType: item.amountType,
        source: item.source,
        isKeetoTax: item.source === "keeto",
        taxType: item.source === "keeto" ? "exclude" : item.taxType,
        modules: item.modules,
        moduleType: item.moduleType,
        status: item.status,
    };
}
/** Enrich tax items with branch and food details. */
async function enrichTaxes(items, restaurantId, lang = "en") {
    if (items.length === 0)
        return [];
    const allBranchIds = Array.from(new Set(items.flatMap((i) => (0, localization_helper_1.parseJsonArray)(i.branchIds))));
    const allFoodIds = Array.from(new Set(items.flatMap((i) => (0, localization_helper_1.parseJsonArray)(i.foodIds))));
    const [branchList, foodList] = await Promise.all([
        allBranchIds.length
            ? connection_1.db
                .select({ id: schema_1.branches.id, name: schema_1.branches.name, nameAr: schema_1.branches.nameAr, nameFr: schema_1.branches.nameFr })
                .from(schema_1.branches)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.branches.id, allBranchIds)))
            : Promise.resolve([]),
        allFoodIds.length
            ? connection_1.db
                .select({ id: schema_1.food.id, name: schema_1.food.name, nameAr: schema_1.food.nameAr, nameFr: schema_1.food.nameFr })
                .from(schema_1.food)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.food.id, allFoodIds)))
            : Promise.resolve([]),
    ]);
    const branchMap = new Map(branchList.map((b) => [b.id, b]));
    const foodMap = new Map(foodList.map((f) => [f.id, f]));
    const toRef = (x) => ({
        id: x.id,
        name: (0, localization_helper_1.getLocalizedName)(x, lang),
        nameAr: x.nameAr,
        nameFr: x.nameFr,
    });
    return items.map((item) => {
        const branchIds = item.source === "keeto" ? [] : (0, localization_helper_1.parseJsonArray)(item.branchIds);
        const foodIds = item.source === "keeto" ? [] : (0, localization_helper_1.parseJsonArray)(item.foodIds);
        return {
            ...formatTaxItem(item, lang),
            nameAr: item.nameAr,
            nameFr: item.nameFr,
            branchIds,
            foodIds,
            branches: branchIds.map((id) => branchMap.get(id)).filter(Boolean).map((b) => toRef(b)),
            foods: foodIds.map((id) => foodMap.get(id)).filter(Boolean).map((f) => toRef(f)),
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
        };
    });
}
const findTax = async (id, restaurantId) => {
    const [item] = await connection_1.db
        .select()
        .from(schema_1.taxes)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.taxes.id, id), (0, tax_helper_1.taxesForRestaurantCondition)(restaurantId)))
        .limit(1);
    if (!item)
        throw new Errors_1.NotFound("Tax not found");
    return item;
};
const findOwnTax = async (id, restaurantId) => {
    const item = await findTax(id, restaurantId);
    if (item.source === "keeto") {
        throw new Errors_1.BadRequest("This tax is applied by Keeto and cannot be modified by the restaurant");
    }
    return item;
};
// ==========================================
// 1. Create Tax (source = restaurant)
// ==========================================
const createTax = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const lang = (0, localization_helper_1.extractLang)(req);
    const { name, nameAr, nameFr, amount, amountType, taxType, modules, moduleType, branchIds, foodIds, status } = req.body;
    const id = (0, uuid_1.v4)();
    await connection_1.db.insert(schema_1.taxes).values({
        id,
        restaurantId,
        source: "restaurant",
        name,
        nameAr: nameAr || null,
        nameFr: nameFr || null,
        amount: String(amount),
        amountType,
        taxType,
        modules,
        moduleType,
        branchIds: (0, localization_helper_1.parseJsonArray)(branchIds),
        foodIds: (0, localization_helper_1.parseJsonArray)(foodIds),
        status,
    });
    const [enriched] = await enrichTaxes([await findTax(id, restaurantId)], restaurantId, lang);
    return (0, response_1.SuccessResponse)(res, { message: "Tax created successfully", data: enriched }, 201);
};
exports.createTax = createTax;
// ==========================================
// 2. Get All Taxes (restaurant + keeto taxes of this restaurant)
//    filters: status, source, taxType, modules, moduleType, search, page, limit, all
// ==========================================
const getAllTaxes = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const lang = (0, localization_helper_1.extractLang)(req);
    const { status, source, taxType, modules, moduleType, search, all } = req.query;
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit)) || 10));
    // own restaurant taxes + Keeto taxes that apply to this restaurant
    const conditions = [(0, tax_helper_1.taxesForRestaurantCondition)(restaurantId)];
    if (status === "active" || status === "inactive")
        conditions.push((0, drizzle_orm_1.eq)(schema_1.taxes.status, status));
    if (source && tax_1.TAX_SOURCES.includes(source))
        conditions.push((0, drizzle_orm_1.eq)(schema_1.taxes.source, source));
    if (taxType && tax_1.TAX_TYPES.includes(taxType))
        conditions.push((0, drizzle_orm_1.eq)(schema_1.taxes.taxType, taxType));
    if (modules && tax_1.TAX_MODULE_TYPES.includes(modules))
        conditions.push((0, drizzle_orm_1.eq)(schema_1.taxes.modules, modules));
    if (moduleType && tax_1.TAX_PLATFORM_TYPES.includes(moduleType))
        conditions.push((0, drizzle_orm_1.eq)(schema_1.taxes.moduleType, moduleType));
    if (search && search.trim()) {
        const term = `%${search.trim()}%`;
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(schema_1.taxes.name, term), (0, drizzle_orm_1.like)(schema_1.taxes.nameAr, term), (0, drizzle_orm_1.like)(schema_1.taxes.nameFr, term)));
    }
    const where = (0, drizzle_orm_1.and)(...conditions);
    const isAll = all === "true";
    const baseQuery = connection_1.db.select().from(schema_1.taxes).where(where).orderBy((0, drizzle_orm_1.desc)(schema_1.taxes.createdAt));
    const [[{ total }], rawItems] = await Promise.all([
        connection_1.db.select({ total: (0, drizzle_orm_1.count)() }).from(schema_1.taxes).where(where),
        isAll ? baseQuery : baseQuery.limit(limit).offset((page - 1) * limit),
    ]);
    const totalItems = Number(total || 0);
    return (0, response_1.SuccessResponse)(res, {
        message: "Taxes fetched successfully",
        data: rawItems.map((item) => formatTaxItem(item, lang)),
        pagination: {
            page: isAll ? 1 : page,
            limit: isAll ? totalItems : limit,
            totalItems,
            totalPages: isAll ? 1 : Math.ceil(totalItems / limit),
        },
    });
};
exports.getAllTaxes = getAllTaxes;
// ==========================================
// 3. Get Tax Options (branches + enums)
// ==========================================
const getTaxListOptions = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const lang = (0, localization_helper_1.extractLang)(req);
    const myBranches = await connection_1.db
        .select({ id: schema_1.branches.id, name: schema_1.branches.name, nameAr: schema_1.branches.nameAr, nameFr: schema_1.branches.nameFr })
        .from(schema_1.branches)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.branches.status, "active")));
    return (0, response_1.SuccessResponse)(res, {
        message: "Tax options fetched successfully",
        data: {
            branches: myBranches.map((b) => ({ id: b.id, name: (0, localization_helper_1.getLocalizedName)(b, lang), nameAr: b.nameAr, nameFr: b.nameFr })),
            taxTypes: tax_1.TAX_TYPES,
            sources: tax_1.TAX_SOURCES,
            modules: tax_1.TAX_MODULE_TYPES,
            moduleTypes: tax_1.TAX_PLATFORM_TYPES,
            amountTypes: tax_1.AMOUNT_TYPES,
        },
    });
};
exports.getTaxListOptions = getTaxListOptions;
// ==========================================
// 4. Get Tax By ID (restaurant or keeto)
// ==========================================
const getTaxById = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const lang = (0, localization_helper_1.extractLang)(req);
    const [enriched] = await enrichTaxes([await findTax(req.params.id, restaurantId)], restaurantId, lang);
    return (0, response_1.SuccessResponse)(res, { message: "Tax fetched successfully", data: enriched });
};
exports.getTaxById = getTaxById;
// ==========================================
// 5. Update Tax (own restaurant taxes only)
// ==========================================
const updateTax = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const lang = (0, localization_helper_1.extractLang)(req);
    const { id } = req.params;
    await findOwnTax(id, restaurantId);
    const { name, nameAr, nameFr, amount, amountType, taxType, modules, moduleType, branchIds, foodIds, status } = req.body;
    const updateData = {};
    if (name !== undefined)
        updateData.name = name;
    if (nameAr !== undefined)
        updateData.nameAr = nameAr;
    if (nameFr !== undefined)
        updateData.nameFr = nameFr;
    if (amount !== undefined)
        updateData.amount = String(amount);
    if (amountType !== undefined)
        updateData.amountType = amountType;
    if (taxType !== undefined)
        updateData.taxType = taxType;
    if (modules !== undefined)
        updateData.modules = modules;
    if (moduleType !== undefined)
        updateData.moduleType = moduleType;
    if (branchIds !== undefined)
        updateData.branchIds = (0, localization_helper_1.parseJsonArray)(branchIds);
    if (foodIds !== undefined)
        updateData.foodIds = (0, localization_helper_1.parseJsonArray)(foodIds);
    if (status !== undefined)
        updateData.status = status;
    if (Object.keys(updateData).length > 0) {
        await connection_1.db.update(schema_1.taxes).set(updateData).where(ownTax(id, restaurantId));
    }
    const [enriched] = await enrichTaxes([await findTax(id, restaurantId)], restaurantId, lang);
    return (0, response_1.SuccessResponse)(res, { message: "Tax updated successfully", data: enriched });
};
exports.updateTax = updateTax;
// ==========================================
// 6. Delete Tax (own restaurant taxes only)
// ==========================================
const deleteTax = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const { id } = req.params;
    await findOwnTax(id, restaurantId);
    await connection_1.db.delete(schema_1.taxes).where(ownTax(id, restaurantId));
    return (0, response_1.SuccessResponse)(res, { message: "Tax deleted successfully" });
};
exports.deleteTax = deleteTax;
// ==========================================
// 7. Toggle Tax Status (own restaurant taxes only)
// ==========================================
const toggleTaxStatus = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const { id } = req.params;
    const existing = await findOwnTax(id, restaurantId);
    const newStatus = existing.status === "active" ? "inactive" : "active";
    await connection_1.db.update(schema_1.taxes).set({ status: newStatus }).where(ownTax(id, restaurantId));
    return (0, response_1.SuccessResponse)(res, { message: `Tax status changed to ${newStatus}`, data: { id, status: newStatus } });
};
exports.toggleTaxStatus = toggleTaxStatus;
// ==========================================
// 8. Get Subcategories (localized)
// ==========================================
const getSubcategories = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const lang = (0, localization_helper_1.extractLang)(req);
    const subList = await connection_1.db
        .select({ id: schema_1.subcategories.id, name: schema_1.subcategories.name, nameAr: schema_1.subcategories.nameAr, nameFr: schema_1.subcategories.nameFr })
        .from(schema_1.subcategories)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.subcategories.isDeleted, false), (0, drizzle_orm_1.eq)(schema_1.subcategories.status, "active")));
    return (0, response_1.SuccessResponse)(res, {
        message: "Subcategories fetched successfully",
        data: subList.map((sub) => ({ id: sub.id, name: (0, localization_helper_1.getLocalizedName)(sub, lang) })),
    });
};
exports.getSubcategories = getSubcategories;
// ==========================================
// 9. Get Foods — query: ?taxId=&subcategoryId=
// ==========================================
const getFoods = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const lang = (0, localization_helper_1.extractLang)(req);
    const taxId = req.query.taxId;
    const subcategoryId = req.query.subcategoryId;
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)];
    if (taxId) {
        const tax = await findTax(taxId, restaurantId);
        const foodIds = (0, localization_helper_1.parseJsonArray)(tax.foodIds);
        if (foodIds.length === 0) {
            return (0, response_1.SuccessResponse)(res, { message: "Foods fetched successfully", data: [] });
        }
        conditions.push((0, drizzle_orm_1.inArray)(schema_1.food.id, foodIds));
    }
    if (subcategoryId && subcategoryId.trim()) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.food.subcategoryid, subcategoryId.trim()));
    }
    const foodList = await connection_1.db
        .select({
        id: schema_1.food.id,
        name: schema_1.food.name,
        nameAr: schema_1.food.nameAr,
        nameFr: schema_1.food.nameFr,
        price: schema_1.food.price,
        image: schema_1.food.image,
        subcategoryId: schema_1.food.subcategoryid,
    })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)(...conditions));
    return (0, response_1.SuccessResponse)(res, {
        message: "Foods fetched successfully",
        data: foodList.map((f) => ({
            id: f.id,
            name: (0, localization_helper_1.getLocalizedName)(f, lang),
            price: f.price,
            image: f.image,
            subcategoryId: f.subcategoryId,
        })),
    });
};
exports.getFoods = getFoods;
// ==========================================
// 10. Get Branches — query: ?taxId=
// ==========================================
const getBranches = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const lang = (0, localization_helper_1.extractLang)(req);
    const taxId = req.query.taxId;
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId)];
    if (taxId) {
        const tax = await findTax(taxId, restaurantId);
        const branchIds = (0, localization_helper_1.parseJsonArray)(tax.branchIds);
        if (branchIds.length === 0) {
            return (0, response_1.SuccessResponse)(res, { message: "Branches fetched successfully", data: [] });
        }
        conditions.push((0, drizzle_orm_1.inArray)(schema_1.branches.id, branchIds));
    }
    else {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.branches.status, "active"));
    }
    const myBranches = await connection_1.db
        .select({ id: schema_1.branches.id, name: schema_1.branches.name, nameAr: schema_1.branches.nameAr, nameFr: schema_1.branches.nameFr })
        .from(schema_1.branches)
        .where((0, drizzle_orm_1.and)(...conditions));
    return (0, response_1.SuccessResponse)(res, {
        message: "Branches fetched successfully",
        data: myBranches.map((b) => ({ id: b.id, name: (0, localization_helper_1.getLocalizedName)(b, lang) })),
    });
};
exports.getBranches = getBranches;
