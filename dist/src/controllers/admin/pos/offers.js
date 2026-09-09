"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFoods = exports.getBranches = exports.getOfferFoods = exports.getOfferBranches = exports.toggleOfferStatus = exports.deleteOffer = exports.updateOffer = exports.getOfferById = exports.getAllOffers = exports.createOffer = void 0;
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
 * Helper to enrich offers with branch and food details and parse IDs into native arrays
 */
async function enrichOffersWithBranchesAndFoods(items, restaurantId, lang = "en") {
    if (items.length === 0)
        return [];
    // Collect all unique branchIds and foodIds using parseJsonArray
    const allBranchIds = Array.from(new Set(items.flatMap((item) => parseJsonArray(item.branchIds))));
    const allFoodIds = Array.from(new Set(items.flatMap((item) => parseJsonArray(item.foodIds))));
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
        const itemBranchIds = parseJsonArray(item.branchIds);
        const itemFoodIds = parseJsonArray(item.foodIds);
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
            name: item.name,
            nameAr: item.nameAr,
            nameFr: item.nameFr,
        }, lang);
        return {
            ...item,
            name: localizedName,
            branchIds: itemBranchIds,
            foodIds: itemFoodIds,
            branches: itemBranches,
            foods: itemFoods,
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
    const { name, nameAr, nameFr, image, startDate, endDate, price, foodIds, food_ids, branchIds, branch_ids, status, } = req.body;
    const finalBranchIds = parseJsonArray(branchIds !== undefined ? branchIds : branch_ids);
    const finalFoodIds = parseJsonArray(foodIds !== undefined ? foodIds : food_ids);
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
        foodIds: finalFoodIds,
        branchIds: finalBranchIds,
        status: status || "active",
    });
    const [createdOffer] = await connection_1.db
        .select()
        .from(schema_1.offers)
        .where((0, drizzle_orm_1.eq)(schema_1.offers.id, id))
        .limit(1);
    const [enriched] = await enrichOffersWithBranchesAndFoods([createdOffer], restaurantId, lang);
    return (0, response_1.SuccessResponse)(res, {
        message: "Offer created successfully",
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
    const { status, search, all } = params;
    const page = Math.max(1, parseInt(params.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(params.limit) || 10));
    const offset = (page - 1) * limit;
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.offers.restaurantId, restaurantId)];
    if (status && (status === "active" || status === "inactive")) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.offers.status, status));
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
    const enrichedList = await enrichOffersWithBranchesAndFoods(rawOffers, restaurantId, lang);
    return (0, response_1.SuccessResponse)(res, {
        message: "Offers fetched successfully",
        data: enrichedList,
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
        throw new Errors_1.NotFound("Offer not found");
    }
    const [enriched] = await enrichOffersWithBranchesAndFoods([offer], restaurantId, lang);
    return (0, response_1.SuccessResponse)(res, {
        message: "Offer fetched successfully",
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
        throw new Errors_1.NotFound("Offer not found");
    }
    const { name, nameAr, nameFr, image, startDate, endDate, price, foodIds, food_ids, branchIds, branch_ids, status, } = req.body;
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
    const rawFoodIds = foodIds !== undefined ? foodIds : food_ids;
    if (rawFoodIds !== undefined) {
        updateData.foodIds = parseJsonArray(rawFoodIds);
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
        message: "Offer updated successfully",
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
        throw new Errors_1.NotFound("Offer not found");
    }
    // Delete image file first before removing database record
    if (existingOffer.image) {
        await (0, handleImages_1.deleteImage)(existingOffer.image);
    }
    await connection_1.db
        .delete(schema_1.offers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.offers.id, id), (0, drizzle_orm_1.eq)(schema_1.offers.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: "Offer deleted successfully",
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
        throw new Errors_1.NotFound("Offer not found");
    }
    const newStatus = existingOffer.status === "active" ? "inactive" : "active";
    await connection_1.db
        .update(schema_1.offers)
        .set({ status: newStatus })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.offers.id, id), (0, drizzle_orm_1.eq)(schema_1.offers.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: `Offer status changed to ${newStatus}`,
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
        throw new Errors_1.NotFound("Offer not found");
    }
    const branchIds = parseJsonArray(offer.branchIds);
    if (branchIds.length === 0) {
        return (0, response_1.SuccessResponse)(res, {
            message: "Offer branches fetched successfully",
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
        message: "Offer branches fetched successfully",
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
        .select({ foodIds: schema_1.offers.foodIds })
        .from(schema_1.offers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.offers.id, id), (0, drizzle_orm_1.eq)(schema_1.offers.restaurantId, restaurantId)))
        .limit(1);
    if (!offer) {
        throw new Errors_1.NotFound("Offer not found");
    }
    const foodIds = parseJsonArray(offer.foodIds);
    if (foodIds.length === 0) {
        return (0, response_1.SuccessResponse)(res, {
            message: "Offer foods fetched successfully",
            data: [],
        });
    }
    const offerFoods = await connection_1.db
        .select({
        id: schema_1.food.id,
        name: schema_1.food.name,
        nameAr: schema_1.food.nameAr,
        nameFr: schema_1.food.nameFr,
    })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.food.id, foodIds)));
    const formatted = offerFoods.map((f) => ({
        id: f.id,
        name: (0, localization_helper_1.getLocalizedName)(f, lang),
    }));
    return (0, response_1.SuccessResponse)(res, {
        message: "Offer foods fetched successfully",
        data: formatted,
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
    const { subcategory_id } = { ...req.query, ...req.body };
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)];
    if (subcategory_id && typeof subcategory_id === "string") {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.food.subcategoryid, subcategory_id));
    }
    const foodList = await connection_1.db
        .select({
        id: schema_1.food.id,
        name: schema_1.food.name,
        nameAr: schema_1.food.nameAr,
        nameFr: schema_1.food.nameFr,
    })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)(...conditions));
    const formatted = foodList.map((f) => ({
        id: f.id,
        name: (0, localization_helper_1.getLocalizedName)(f, lang),
    }));
    return (0, response_1.SuccessResponse)(res, {
        message: "Foods fetched successfully",
        data: formatted,
    });
};
exports.getFoods = getFoods;
