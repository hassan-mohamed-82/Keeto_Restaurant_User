"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFoods = exports.getBranches = exports.getOfferFoods = exports.getOfferBranches = exports.toggleOfferStatus = exports.deleteOffer = exports.updateOffer = exports.getOfferById = exports.getAllOffers = exports.createOffer = exports.deepParseJSON = void 0;
exports.parseJsonArray = parseJsonArray;
const connection_1 = require("../../../models/connection");
const schema_1 = require("../../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../../utils/response");
const Errors_1 = require("../../../Errors");
const uuid_1 = require("uuid");
const handleImages_1 = require("../../../utils/handleImages");
const localization_helper_1 = require("../../../helpers/localization.helper");
/**
 * Robustly parses any JSON / array / string representation into a string array.
 * Handles MySQL JSON string column returns, double-stringified JSON, and comma-separated lists.
 */
function parseJsonArray(val) {
    if (!val)
        return [];
    if (Array.isArray(val))
        return val.map(String).filter(Boolean);
    if (typeof val === "string") {
        const trimmed = val.trim();
        if (!trimmed)
            return [];
        try {
            let parsed = JSON.parse(trimmed);
            if (typeof parsed === "string") {
                try {
                    parsed = JSON.parse(parsed);
                }
                catch {
                    // keep parsed as string
                }
            }
            if (Array.isArray(parsed))
                return parsed.map(String).filter(Boolean);
        }
        catch {
            if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
                const inner = trimmed.slice(1, -1).trim();
                if (!inner)
                    return [];
                return inner
                    .split(",")
                    .map((s) => s.replace(/["']/g, "").trim())
                    .filter(Boolean);
            }
            return [trimmed];
        }
    }
    return [];
}
/**
 * Deeply parses any stringified JSON into native JavaScript objects/arrays
 */
const deepParseJSON = (data) => {
    if (!data)
        return data;
    if (typeof data === "string") {
        const trimmed = data.trim();
        if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
            try {
                return (0, exports.deepParseJSON)(JSON.parse(trimmed));
            }
            catch {
                return data;
            }
        }
        return data;
    }
    return data;
};
exports.deepParseJSON = deepParseJSON;
/**
 * Helper to fetch and hierarchically enrich offer foods with variations and options
 */
async function fetchAndEnrichOfferFoods(offerIds, lang = "en") {
    if (offerIds.length === 0)
        return new Map();
    const offerFoodRows = await connection_1.db
        .select()
        .from(schema_1.offerFoods)
        .where((0, drizzle_orm_1.inArray)(schema_1.offerFoods.offerId, offerIds));
    if (offerFoodRows.length === 0)
        return new Map();
    // Parse JSON columns cleanly (prevents string issues from MySQL)
    const rawParsedRows = offerFoodRows.map((r) => {
        const parsedVars = (0, exports.deepParseJSON)(r.variations);
        const variations = Array.isArray(parsedVars) ? parsedVars : [];
        const parsedOpts = (0, exports.deepParseJSON)(r.optionIds);
        const optionIds = Array.isArray(parsedOpts) ? parsedOpts : [];
        return {
            ...r,
            variations,
            optionIds,
        };
    });
    // Consolidate rows by (offerId, foodId) so multiple variations or duplicate rows merge seamlessly
    const groupedByOfferAndFood = new Map();
    for (const r of rawParsedRows) {
        if (!groupedByOfferAndFood.has(r.offerId)) {
            groupedByOfferAndFood.set(r.offerId, new Map());
        }
        const foodMapForOffer = groupedByOfferAndFood.get(r.offerId);
        if (!foodMapForOffer.has(r.foodId)) {
            foodMapForOffer.set(r.foodId, {
                id: r.id,
                offerId: r.offerId,
                foodId: r.foodId,
                quantity: r.quantity || 1,
                variations: [...r.variations],
                optionIds: [...r.optionIds],
            });
        }
        else {
            const ex = foodMapForOffer.get(r.foodId);
            ex.quantity = Math.max(ex.quantity, r.quantity || 1);
            ex.variations.push(...r.variations);
            ex.optionIds = Array.from(new Set([...ex.optionIds, ...r.optionIds]));
        }
    }
    const parsedRows = [];
    for (const foodMapForOffer of groupedByOfferAndFood.values()) {
        for (const unifiedFood of foodMapForOffer.values()) {
            parsedRows.push(unifiedFood);
        }
    }
    const foodIds = Array.from(new Set(parsedRows.map((r) => r.foodId).filter(Boolean)));
    // Collect all option IDs explicitly passed
    const allOptionIds = Array.from(new Set(parsedRows.flatMap((r) => {
        const flatOpts = Array.isArray(r.optionIds) ? r.optionIds : [];
        const varOpts = Array.isArray(r.variations)
            ? r.variations.flatMap((v) => (Array.isArray(v.options) ? v.options : []))
            : [];
        return [...flatOpts, ...varOpts].map(String).filter(Boolean);
    })));
    // Concurrently fetch foods, explicitly passed options, AND default variations for foods with empty variations
    const foodIdsWithEmptyVars = Array.from(new Set(parsedRows.filter((r) => r.variations.length === 0).map((r) => r.foodId)));
    const [foodList, optionList, defaultVarsList] = await Promise.all([
        foodIds.length > 0
            ? connection_1.db
                .select({
                id: schema_1.food.id,
                name: schema_1.food.name,
                nameAr: schema_1.food.nameAr,
                nameFr: schema_1.food.nameFr,
                price: schema_1.food.price,
                image: schema_1.food.image,
            })
                .from(schema_1.food)
                .where((0, drizzle_orm_1.inArray)(schema_1.food.id, foodIds))
            : Promise.resolve([]),
        allOptionIds.length > 0
            ? connection_1.db
                .select()
                .from(schema_1.variationOptions)
                .where((0, drizzle_orm_1.inArray)(schema_1.variationOptions.id, allOptionIds))
            : Promise.resolve([]),
        foodIdsWithEmptyVars.length > 0
            ? connection_1.db
                .select()
                .from(schema_1.foodVariations)
                .where((0, drizzle_orm_1.inArray)(schema_1.foodVariations.foodId, foodIdsWithEmptyVars))
            : Promise.resolve([]),
    ]);
    const foodMap = new Map();
    for (const f of foodList) {
        foodMap.set(f.id, f);
    }
    // Also fetch options for default variations
    const defaultVarIds = defaultVarsList.map((v) => v.id);
    const defaultOptsList = defaultVarIds.length > 0
        ? await connection_1.db
            .select()
            .from(schema_1.variationOptions)
            .where((0, drizzle_orm_1.inArray)(schema_1.variationOptions.variationId, defaultVarIds))
        : [];
    const defaultOptsByVarId = new Map();
    for (const opt of defaultOptsList) {
        if (!defaultOptsByVarId.has(opt.variationId)) {
            defaultOptsByVarId.set(opt.variationId, []);
        }
        defaultOptsByVarId.get(opt.variationId).push(opt);
    }
    const defaultVarsByFoodId = new Map();
    for (const v of defaultVarsList) {
        if (!defaultVarsByFoodId.has(v.foodId)) {
            defaultVarsByFoodId.set(v.foodId, []);
        }
        const opts = (defaultOptsByVarId.get(v.id) || []).map((o) => ({
            optionId: o.id,
            name: (0, localization_helper_1.getLocalizedName)({ name: o.optionName, nameAr: o.optionNameAr, nameFr: o.optionNameFr }, lang),
            nameAr: o.optionNameAr,
            nameFr: o.optionNameFr,
            additionalPrice: o.additionalPrice,
        }));
        defaultVarsByFoodId.get(v.foodId).push({
            variationId: v.id,
            name: (0, localization_helper_1.getLocalizedName)(v, lang),
            nameAr: v.nameAr,
            nameFr: v.nameFr,
            selectionType: v.selectionType,
            isRequired: v.isRequired,
            options: opts,
        });
    }
    // Variations for explicitly passed options AND explicitly passed variationIds
    const varIdsFromOpts = optionList.map((o) => o.variationId).filter(Boolean);
    const explicitVarIds = parsedRows.flatMap((r) => (r.variations || []).map((v) => v.variationId).filter(Boolean));
    const allVarIdsToQuery = Array.from(new Set([...varIdsFromOpts, ...explicitVarIds]));
    const varList = allVarIdsToQuery.length > 0
        ? await connection_1.db
            .select()
            .from(schema_1.foodVariations)
            .where((0, drizzle_orm_1.inArray)(schema_1.foodVariations.id, allVarIdsToQuery))
        : [];
    const varMap = new Map();
    for (const v of varList) {
        varMap.set(v.id, v);
    }
    const optionMap = new Map();
    for (const o of optionList) {
        optionMap.set(o.id, o);
    }
    const result = new Map();
    for (const row of parsedRows) {
        if (!result.has(row.offerId)) {
            result.set(row.offerId, []);
        }
        const foodItem = foodMap.get(row.foodId);
        const variations = Array.isArray(row.variations)
            ? row.variations
            : [];
        // Consolidate variations with the same variationId
        const consolidatedVarMap = new Map();
        for (const v of variations) {
            const vOpts = (Array.isArray(v.options) ? v.options : []).map(String).filter(Boolean);
            const vKey = v.variationId ? String(v.variationId) : `auto_${Math.random()}`;
            if (!consolidatedVarMap.has(vKey)) {
                consolidatedVarMap.set(vKey, { variationId: v.variationId || null, options: [...vOpts] });
            }
            else {
                const ex = consolidatedVarMap.get(vKey);
                ex.options = Array.from(new Set([...ex.options, ...vOpts]));
            }
        }
        let enrichedVariations = Array.from(consolidatedVarMap.values()).map((v) => {
            const opts = (Array.isArray(v.options) ? v.options : []).map((optId) => {
                const optInfo = optionMap.get(String(optId));
                return {
                    optionId: String(optId),
                    name: optInfo
                        ? (0, localization_helper_1.getLocalizedName)({
                            name: optInfo.optionName,
                            nameAr: optInfo.optionNameAr,
                            nameFr: optInfo.optionNameFr,
                        }, lang)
                        : null,
                    nameAr: optInfo?.optionNameAr || null,
                    nameFr: optInfo?.optionNameFr || null,
                    additionalPrice: optInfo?.additionalPrice || "0",
                    variationId: optInfo?.variationId || null,
                };
            });
            // Automatically detect variationId from options if not provided
            const detectedVarId = v.variationId || opts.find((o) => o.variationId)?.variationId || null;
            const varInfo = detectedVarId ? varMap.get(detectedVarId) : null;
            return {
                variationId: detectedVarId,
                name: varInfo ? (0, localization_helper_1.getLocalizedName)(varInfo, lang) : null,
                nameAr: varInfo?.nameAr || null,
                nameFr: varInfo?.nameFr || null,
                selectionType: varInfo?.selectionType || null,
                isRequired: varInfo?.isRequired ?? false,
                options: opts,
            };
        });
        // Smart fallback: if no specific variations were selected for this food, return all available variations of this food
        if (enrichedVariations.length === 0) {
            enrichedVariations = defaultVarsByFoodId.get(row.foodId) || [];
        }
        result.get(row.offerId).push({
            id: row.id,
            foodId: row.foodId,
            name: foodItem ? (0, localization_helper_1.getLocalizedName)(foodItem, lang) : "",
            nameAr: foodItem?.nameAr || null,
            nameFr: foodItem?.nameFr || null,
            price: foodItem?.price || "0",
            image: foodItem?.image || null,
            quantity: row.quantity || 1,
            variations: enrichedVariations,
        });
    }
    return result;
}
/**
 * Helper to enrich offers with branch and food details
 */
async function enrichOffersWithBranchesAndFoods(items, restaurantId, lang = "en") {
    if (items.length === 0)
        return [];
    const offerIds = items.map((i) => i.id);
    const allBranchIds = Array.from(new Set(items.flatMap((item) => parseJsonArray(item.branchIds))));
    const [branchList, offerFoodsMap] = await Promise.all([
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
        fetchAndEnrichOfferFoods(offerIds, lang),
    ]);
    const branchMap = new Map();
    for (const b of branchList) {
        branchMap.set(b.id, b);
    }
    // Check if any offers had no offerFoods rows and need legacy food enrichment
    const missingOfferFoodIds = items
        .filter((item) => !offerFoodsMap.has(item.id) || offerFoodsMap.get(item.id).length === 0)
        .flatMap((item) => parseJsonArray(item.foodIds));
    const legacyFoodMap = new Map();
    if (missingOfferFoodIds.length > 0) {
        const legacyFoods = await connection_1.db
            .select({
            id: schema_1.food.id,
            name: schema_1.food.name,
            nameAr: schema_1.food.nameAr,
            nameFr: schema_1.food.nameFr,
            price: schema_1.food.price,
            image: schema_1.food.image,
        })
            .from(schema_1.food)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.food.id, missingOfferFoodIds)));
        for (const f of legacyFoods) {
            legacyFoodMap.set(f.id, f);
        }
    }
    return items.map((item) => {
        const itemBranchIds = parseJsonArray(item.branchIds);
        const itemBranches = itemBranchIds
            .map((id) => branchMap.get(id))
            .filter(Boolean)
            .map((b) => ({
            id: b.id,
            name: (0, localization_helper_1.getLocalizedName)(b, lang),
            nameAr: b.nameAr,
            nameFr: b.nameFr,
        }));
        let itemFoods = offerFoodsMap.get(item.id) || [];
        if (itemFoods.length === 0 && item.foodIds) {
            const legacyIds = parseJsonArray(item.foodIds);
            itemFoods = legacyIds
                .map((id) => legacyFoodMap.get(id))
                .filter(Boolean)
                .map((f) => ({
                id: f.id,
                foodId: f.id,
                name: (0, localization_helper_1.getLocalizedName)(f, lang),
                nameAr: f.nameAr,
                nameFr: f.nameFr,
                price: f.price,
                image: f.image,
                quantity: 1,
                variations: [],
            }));
        }
        const localizedName = (0, localization_helper_1.getLocalizedName)({
            name: item.name,
            nameAr: item.nameAr,
            nameFr: item.nameFr,
        }, lang);
        return {
            ...item,
            module: parseJsonArray(item.module),
            name: localizedName,
            branchIds: itemBranchIds,
            branches: itemBranches,
            foods: itemFoods,
        };
    });
}
/**
 * Helper to consolidate foods and variations by foodId and variationId
 */
function consolidateFoodsAndVariations(foodsInput, foodIdsInput) {
    let rawItems = [];
    if (Array.isArray(foodsInput) && foodsInput.length > 0) {
        rawItems = foodsInput;
    }
    else {
        const rawIds = parseJsonArray(foodIdsInput);
        rawItems = rawIds.map((fid) => ({ foodId: fid, quantity: 1, variations: [] }));
    }
    const mergedFoodsMap = new Map();
    for (const item of rawItems) {
        if (!item)
            continue;
        const fid = typeof item === "string" ? item : String(item.foodId || item.food_id || item.id || "");
        if (!fid)
            continue;
        const qty = item.quantity !== undefined ? Number(item.quantity) || 1 : 1;
        const vars = Array.isArray(item.variations) ? item.variations : [];
        if (!mergedFoodsMap.has(fid)) {
            mergedFoodsMap.set(fid, {
                foodId: fid,
                quantity: qty,
                variations: [...vars],
            });
        }
        else {
            const ex = mergedFoodsMap.get(fid);
            ex.quantity = Math.max(ex.quantity, qty);
            ex.variations.push(...vars);
        }
    }
    return Array.from(mergedFoodsMap.values()).map((f) => {
        const vMap = new Map();
        for (const v of f.variations) {
            const vKey = v.variationId ? String(v.variationId) : `auto_${Math.random()}`;
            const vOpts = Array.isArray(v.options) ? v.options.map(String).filter(Boolean) : [];
            if (!vMap.has(vKey)) {
                vMap.set(vKey, { variationId: v.variationId || null, options: [...vOpts] });
            }
            else {
                const ex = vMap.get(vKey);
                ex.options = Array.from(new Set([...ex.options, ...vOpts]));
            }
        }
        return {
            foodId: f.foodId,
            quantity: f.quantity,
            variations: Array.from(vMap.values()),
        };
    });
}
// ==========================================
// 1. Create Offer
// ==========================================
const createOffer = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const { name, nameAr, nameFr, image, startDate, endDate, price, foods, foodIds, food_ids, branchIds, branch_ids, module, modules, status, } = req.body;
    const finalBranchIds = parseJsonArray(branchIds !== undefined ? branchIds : branch_ids);
    const rawModule = module !== undefined ? module : modules;
    const parsedModule = parseJsonArray(rawModule);
    const validModules = ["pos", "web", "app"];
    const filteredModule = parsedModule.filter((m) => validModules.includes(m));
    const finalModule = filteredModule.length > 0 ? filteredModule : ["pos"];
    const consolidatedFoods = consolidateFoodsAndVariations(foods, foodIds !== undefined ? foodIds : food_ids);
    const distinctFoodIds = consolidatedFoods.map((f) => f.foodId);
    let savedImageUrl = null;
    if (image) {
        if (typeof image === "string" && image.startsWith("http")) {
            savedImageUrl = image;
        }
        else {
            savedImageUrl = await (0, handleImages_1.saveBase64Image)(image, req, "offers");
        }
    }
    const id = (0, uuid_1.v4)();
    await connection_1.db.insert(schema_1.offers).values({
        id,
        restaurantId,
        name,
        nameAr: nameAr || null,
        nameFr: nameFr || null,
        image: savedImageUrl,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        price: String(price),
        foodIds: distinctFoodIds,
        branchIds: finalBranchIds,
        module: finalModule,
        status: status || "active",
    });
    if (consolidatedFoods.length > 0) {
        const rows = consolidatedFoods.map((f) => {
            const rawVars = Array.isArray(f.variations) ? f.variations : [];
            const flatOptions = Array.from(new Set(rawVars.flatMap((v) => Array.isArray(v.options) ? v.options : []).map(String).filter(Boolean)));
            return {
                id: (0, uuid_1.v4)(),
                offerId: id,
                foodId: f.foodId,
                variations: rawVars,
                optionIds: flatOptions,
                quantity: f.quantity || 1,
            };
        });
        await connection_1.db.insert(schema_1.offerFoods).values(rows);
    }
    const [createdOffer] = await connection_1.db
        .select()
        .from(schema_1.offers)
        .where((0, drizzle_orm_1.eq)(schema_1.offers.id, id))
        .limit(1);
    const [enriched] = await enrichOffersWithBranchesAndFoods([createdOffer], restaurantId, lang);
    return (0, response_1.SuccessResponse)(res, {
        message: "Bundle created successfully",
        data: enriched || createdOffer,
    }, 201);
};
exports.createOffer = createOffer;
// ==========================================
// 2. Get All Offers (Paginated & Restaurant Scoped)
// ==========================================
const getAllOffers = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const params = { ...req.query, ...req.body };
    const { status, search, all, module, modules } = params;
    const page = Math.max(1, parseInt(params.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(params.limit) || 10));
    const offset = (page - 1) * limit;
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.offers.restaurantId, restaurantId)];
    if (status && (status === "active" || status === "inactive")) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.offers.status, status));
    }
    const rawFilterModule = module !== undefined ? module : modules;
    if (rawFilterModule && typeof rawFilterModule === "string" && ["pos", "web", "app"].includes(rawFilterModule.trim().toLowerCase())) {
        const target = rawFilterModule.trim().toLowerCase();
        conditions.push((0, drizzle_orm_1.sql) `JSON_CONTAINS(${schema_1.offers.module}, ${JSON.stringify(target)})`);
    }
    else if (Array.isArray(rawFilterModule) && rawFilterModule.length > 0) {
        const validTargets = rawFilterModule
            .map((m) => String(m).trim().toLowerCase())
            .filter((m) => ["pos", "web", "app"].includes(m));
        if (validTargets.length > 0) {
            const orConditions = validTargets.map((target) => (0, drizzle_orm_1.sql) `JSON_CONTAINS(${schema_1.offers.module}, ${JSON.stringify(target)})`);
            conditions.push((0, drizzle_orm_1.or)(...orConditions));
        }
    }
    if (search && typeof search === "string" && search.trim() !== "") {
        const term = `%${search.trim()}%`;
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(schema_1.offers.name, term), (0, drizzle_orm_1.like)(schema_1.offers.nameAr, term), (0, drizzle_orm_1.like)(schema_1.offers.nameFr, term)));
    }
    const isAll = all === "true";
    const [totalCountResult, rawOffers] = await Promise.all([
        connection_1.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema_1.offers)
            .where((0, drizzle_orm_1.and)(...conditions)),
        isAll
            ? connection_1.db
                .select()
                .from(schema_1.offers)
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.offers.createdAt))
            : connection_1.db
                .select()
                .from(schema_1.offers)
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.offers.createdAt))
                .limit(limit)
                .offset(offset),
    ]);
    const totalItems = Number(totalCountResult[0]?.count || 0);
    const totalPages = isAll ? 1 : Math.ceil(totalItems / limit);
    const formattedOffers = rawOffers.map((item) => ({
        id: item.id,
        image: item.image,
        startDate: item.startDate,
        endDate: item.endDate,
        price: item.price,
        module: parseJsonArray(item.module),
        status: item.status,
        name: (0, localization_helper_1.getLocalizedName)({
            name: item.name,
            nameAr: item.nameAr,
            nameFr: item.nameFr,
        }, lang),
    }));
    return (0, response_1.SuccessResponse)(res, {
        message: "Bundles fetched successfully",
        data: formattedOffers,
        pagination: {
            page: isAll ? 1 : page,
            limit: isAll ? totalItems : limit,
            totalItems,
            totalPages,
        },
    });
};
exports.getAllOffers = getAllOffers;
// ==========================================
// 3. Get Offer By ID
// ==========================================
const getOfferById = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const { id } = req.params;
    const [offer] = await connection_1.db
        .select()
        .from(schema_1.offers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.offers.id, id), (0, drizzle_orm_1.eq)(schema_1.offers.restaurantId, restaurantId)))
        .limit(1);
    if (!offer) {
        throw new Errors_1.NotFound("Bundle not found");
    }
    const [enriched] = await enrichOffersWithBranchesAndFoods([offer], restaurantId, lang);
    return (0, response_1.SuccessResponse)(res, {
        message: "Bundle fetched successfully",
        data: enriched || offer,
    });
};
exports.getOfferById = getOfferById;
// ==========================================
// 4. Update Offer
// ==========================================
const updateOffer = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const { id } = req.params;
    const [existingOffer] = await connection_1.db
        .select()
        .from(schema_1.offers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.offers.id, id), (0, drizzle_orm_1.eq)(schema_1.offers.restaurantId, restaurantId)))
        .limit(1);
    if (!existingOffer) {
        throw new Errors_1.NotFound("Bundle not found");
    }
    const { name, nameAr, nameFr, image, startDate, endDate, price, foods, foodIds, food_ids, branchIds, branch_ids, module, modules, status, } = req.body;
    const updateData = {};
    if (name !== undefined)
        updateData.name = name;
    if (nameAr !== undefined)
        updateData.nameAr = nameAr;
    if (nameFr !== undefined)
        updateData.nameFr = nameFr;
    if (startDate !== undefined)
        updateData.startDate = new Date(startDate);
    if (endDate !== undefined)
        updateData.endDate = new Date(endDate);
    if (price !== undefined)
        updateData.price = String(price);
    const rawModule = module !== undefined ? module : modules;
    if (rawModule !== undefined) {
        const parsedModule = parseJsonArray(rawModule);
        const validModules = ["pos", "web", "app"];
        const filteredModule = parsedModule.filter((m) => validModules.includes(m));
        if (filteredModule.length > 0) {
            updateData.module = filteredModule;
        }
    }
    const rawFoods = foods !== undefined ? foods : (foodIds !== undefined ? foodIds : food_ids);
    if (rawFoods !== undefined) {
        const consolidatedFoods = consolidateFoodsAndVariations(Array.isArray(foods) ? foods : (Array.isArray(rawFoods) && typeof rawFoods[0] === "object" ? rawFoods : []), rawFoods);
        const distinctFoodIds = consolidatedFoods.map((f) => f.foodId);
        updateData.foodIds = distinctFoodIds;
        // Delete existing offer_foods and insert updated rows
        await connection_1.db.delete(schema_1.offerFoods).where((0, drizzle_orm_1.eq)(schema_1.offerFoods.offerId, id));
        if (consolidatedFoods.length > 0) {
            const rows = consolidatedFoods.map((f) => {
                const rawVars = Array.isArray(f.variations) ? f.variations : [];
                const flatOptions = Array.from(new Set(rawVars.flatMap((v) => Array.isArray(v.options) ? v.options : []).map(String).filter(Boolean)));
                return {
                    id: (0, uuid_1.v4)(),
                    offerId: id,
                    foodId: f.foodId,
                    variations: rawVars,
                    optionIds: flatOptions,
                    quantity: f.quantity || 1,
                };
            });
            await connection_1.db.insert(schema_1.offerFoods).values(rows);
        }
    }
    const rawBranchIds = branchIds !== undefined ? branchIds : branch_ids;
    if (rawBranchIds !== undefined) {
        updateData.branchIds = parseJsonArray(rawBranchIds);
    }
    if (status !== undefined)
        updateData.status = status;
    if (image !== undefined) {
        const updatedImage = await (0, handleImages_1.handleImageUpdate)(req, existingOffer.image, image, "offers");
        updateData.image = updatedImage;
    }
    if (Object.keys(updateData).length > 0) {
        await connection_1.db
            .update(schema_1.offers)
            .set(updateData)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.offers.id, id), (0, drizzle_orm_1.eq)(schema_1.offers.restaurantId, restaurantId)));
    }
    const [updatedOffer] = await connection_1.db
        .select()
        .from(schema_1.offers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.offers.id, id), (0, drizzle_orm_1.eq)(schema_1.offers.restaurantId, restaurantId)))
        .limit(1);
    const [enriched] = await enrichOffersWithBranchesAndFoods([updatedOffer], restaurantId, lang);
    return (0, response_1.SuccessResponse)(res, {
        message: "Bundle updated successfully",
        data: enriched || updatedOffer,
    });
};
exports.updateOffer = updateOffer;
// ==========================================
// 5. Delete Offer (Deletes image file first)
// ==========================================
const deleteOffer = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existingOffer] = await connection_1.db
        .select()
        .from(schema_1.offers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.offers.id, id), (0, drizzle_orm_1.eq)(schema_1.offers.restaurantId, restaurantId)))
        .limit(1);
    if (!existingOffer) {
        throw new Errors_1.NotFound("Bundle not found");
    }
    // Delete image file first before removing database record
    if (existingOffer.image) {
        await (0, handleImages_1.deleteImage)(existingOffer.image);
    }
    await connection_1.db
        .delete(schema_1.offers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.offers.id, id), (0, drizzle_orm_1.eq)(schema_1.offers.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: "Bundle deleted successfully",
    });
};
exports.deleteOffer = deleteOffer;
// ==========================================
// 6. Toggle Offer Status (Active / Inactive)
// ==========================================
const toggleOfferStatus = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existingOffer] = await connection_1.db
        .select()
        .from(schema_1.offers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.offers.id, id), (0, drizzle_orm_1.eq)(schema_1.offers.restaurantId, restaurantId)))
        .limit(1);
    if (!existingOffer) {
        throw new Errors_1.NotFound("Bundle not found");
    }
    const newStatus = existingOffer.status === "active" ? "inactive" : "active";
    await connection_1.db
        .update(schema_1.offers)
        .set({ status: newStatus })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.offers.id, id), (0, drizzle_orm_1.eq)(schema_1.offers.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: `Bundle status changed to ${newStatus}`,
        data: { id, status: newStatus },
    });
};
exports.toggleOfferStatus = toggleOfferStatus;
// ==========================================
// 7. Get Branches of a Specific Offer
// ==========================================
const getOfferBranches = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const { id } = req.params;
    const [offer] = await connection_1.db
        .select({ branchIds: schema_1.offers.branchIds })
        .from(schema_1.offers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.offers.id, id), (0, drizzle_orm_1.eq)(schema_1.offers.restaurantId, restaurantId)))
        .limit(1);
    if (!offer) {
        throw new Errors_1.NotFound("Bundle not found");
    }
    const branchIds = parseJsonArray(offer.branchIds);
    if (branchIds.length === 0) {
        return (0, response_1.SuccessResponse)(res, {
            message: "Bundle branches fetched successfully",
            data: [],
        });
    }
    const offerBranches = await connection_1.db
        .select({
        id: schema_1.branches.id,
        name: schema_1.branches.name,
        nameAr: schema_1.branches.nameAr,
        nameFr: schema_1.branches.nameFr,
    })
        .from(schema_1.branches)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.branches.id, branchIds)));
    const formatted = offerBranches.map((b) => ({
        id: b.id,
        name: (0, localization_helper_1.getLocalizedName)(b, lang),
    }));
    return (0, response_1.SuccessResponse)(res, {
        message: "Bundle branches fetched successfully",
        data: formatted,
    });
};
exports.getOfferBranches = getOfferBranches;
// ==========================================
// 8. Get Foods of a Specific Offer
// ==========================================
const getOfferFoods = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const { id } = req.params;
    const [offer] = await connection_1.db
        .select()
        .from(schema_1.offers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.offers.id, id), (0, drizzle_orm_1.eq)(schema_1.offers.restaurantId, restaurantId)))
        .limit(1);
    if (!offer) {
        throw new Errors_1.NotFound("Bundle not found");
    }
    const foodsMap = await fetchAndEnrichOfferFoods([id], lang);
    let result = foodsMap.get(id) || [];
    if (result.length === 0 && offer.foodIds) {
        const legacyFoodIds = parseJsonArray(offer.foodIds);
        if (legacyFoodIds.length > 0) {
            const legacyFoods = await connection_1.db
                .select({
                id: schema_1.food.id,
                name: schema_1.food.name,
                nameAr: schema_1.food.nameAr,
                nameFr: schema_1.food.nameFr,
                price: schema_1.food.price,
                image: schema_1.food.image,
            })
                .from(schema_1.food)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.food.id, legacyFoodIds)));
            result = legacyFoods.map((f) => ({
                id: f.id,
                foodId: f.id,
                name: (0, localization_helper_1.getLocalizedName)(f, lang),
                nameAr: f.nameAr,
                nameFr: f.nameFr,
                price: f.price,
                image: f.image,
                quantity: 1,
                variations: [],
            }));
        }
    }
    return (0, response_1.SuccessResponse)(res, {
        message: "Bundle foods fetched successfully",
        data: result,
    });
};
exports.getOfferFoods = getOfferFoods;
// ==========================================
// 9. Get All Active Branches for Selection
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
// ==========================================
// 10. Get All Foods for Selection
// ==========================================
const getFoods = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const params = { ...req.query, ...req.body };
    const { subcategory_id, search, name, nameAr, nameFr, status, all } = params;
    const page = Math.max(1, parseInt(params.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(params.limit) || 10));
    const offset = (page - 1) * limit;
    const conditions = [
        (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId),
        (0, drizzle_orm_1.isNull)(schema_1.food.deletedAt),
    ];
    if (subcategory_id && typeof subcategory_id === "string") {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.food.subcategoryid, subcategory_id));
    }
    if (status && (status === "active" || status === "inactive")) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.food.status, status));
    }
    // General search across name, nameAr, nameFr
    if (search && typeof search === "string" && search.trim() !== "") {
        const term = `%${search.trim()}%`;
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(schema_1.food.name, term), (0, drizzle_orm_1.like)(schema_1.food.nameAr, term), (0, drizzle_orm_1.like)(schema_1.food.nameFr, term)));
    }
    // Specific field searches
    if (name && typeof name === "string" && name.trim() !== "") {
        conditions.push((0, drizzle_orm_1.like)(schema_1.food.name, `%${name.trim()}%`));
    }
    if (nameAr && typeof nameAr === "string" && nameAr.trim() !== "") {
        conditions.push((0, drizzle_orm_1.like)(schema_1.food.nameAr, `%${nameAr.trim()}%`));
    }
    if (nameFr && typeof nameFr === "string" && nameFr.trim() !== "") {
        conditions.push((0, drizzle_orm_1.like)(schema_1.food.nameFr, `%${nameFr.trim()}%`));
    }
    const isAll = all === "true" || all === true;
    const [totalCountResult, foodList] = await Promise.all([
        connection_1.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema_1.food)
            .where((0, drizzle_orm_1.and)(...conditions)),
        isAll
            ? connection_1.db
                .select({
                id: schema_1.food.id,
                name: schema_1.food.name,
                nameAr: schema_1.food.nameAr,
                nameFr: schema_1.food.nameFr,
                price: schema_1.food.price,
                image: schema_1.food.image,
            })
                .from(schema_1.food)
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.food.createdAt))
            : connection_1.db
                .select({
                id: schema_1.food.id,
                name: schema_1.food.name,
                nameAr: schema_1.food.nameAr,
                nameFr: schema_1.food.nameFr,
                price: schema_1.food.price,
                image: schema_1.food.image,
            })
                .from(schema_1.food)
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.food.createdAt))
                .limit(limit)
                .offset(offset),
    ]);
    const totalItems = Number(totalCountResult[0]?.count || 0);
    const totalPages = isAll ? 1 : Math.ceil(totalItems / limit);
    const foodIds = foodList.map((f) => f.id);
    const variationsList = foodIds.length > 0
        ? await connection_1.db.select().from(schema_1.foodVariations).where((0, drizzle_orm_1.inArray)(schema_1.foodVariations.foodId, foodIds))
        : [];
    const varIds = variationsList.map((v) => v.id);
    const optionsList = varIds.length > 0
        ? await connection_1.db.select().from(schema_1.variationOptions).where((0, drizzle_orm_1.inArray)(schema_1.variationOptions.variationId, varIds))
        : [];
    const optionsByVarId = new Map();
    for (const opt of optionsList) {
        if (!optionsByVarId.has(opt.variationId)) {
            optionsByVarId.set(opt.variationId, []);
        }
        optionsByVarId.get(opt.variationId).push(opt);
    }
    const variationsByFoodId = new Map();
    for (const v of variationsList) {
        if (!variationsByFoodId.has(v.foodId)) {
            variationsByFoodId.set(v.foodId, []);
        }
        const opts = (optionsByVarId.get(v.id) || []).map((o) => ({
            id: o.id,
            optionName: o.optionName,
            name: (0, localization_helper_1.getLocalizedName)({ name: o.optionName, nameAr: o.optionNameAr, nameFr: o.optionNameFr }, lang),
            additionalPrice: o.additionalPrice,
            isDefault: o.isDefault,
            status: o.status,
        }));
        variationsByFoodId.get(v.foodId).push({
            id: v.id,
            name: (0, localization_helper_1.getLocalizedName)(v, lang),
            selectionType: v.selectionType,
            isRequired: v.isRequired,
            min: v.min,
            max: v.max,
            options: opts,
        });
    }
    const formatted = foodList.map((f) => ({
        id: f.id,
        name: (0, localization_helper_1.getLocalizedName)(f, lang),
        price: f.price,
        image: f.image,
        variations: variationsByFoodId.get(f.id) || [],
    }));
    return (0, response_1.SuccessResponse)(res, {
        message: "Foods fetched successfully",
        data: formatted,
        pagination: {
            page: isAll ? 1 : page,
            limit: isAll ? totalItems : limit,
            totalItems,
            totalPages,
        },
    });
};
exports.getFoods = getFoods;
