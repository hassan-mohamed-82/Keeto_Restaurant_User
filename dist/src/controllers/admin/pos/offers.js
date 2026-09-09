"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBranches = exports.toggleOfferStatus = exports.deleteOffer = exports.updateOffer = exports.getOfferById = exports.getAllOffers = exports.createOffer = void 0;
const connection_1 = require("../../../models/connection");
const schema_1 = require("../../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../../utils/response");
const Errors_1 = require("../../../Errors");
const uuid_1 = require("uuid");
const handleImages_1 = require("../../../utils/handleImages");
const localization_helper_1 = require("../../../helpers/localization.helper");
/**
 * Helper to enrich offers with branch and food details
 */
async function enrichOffersWithBranchesAndFoods(items, restaurantId, lang = "en") {
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
// 1. Create Offer
// ==========================================
const createOffer = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const { name, nameAr, nameFr, image, startDate, endDate, price, foodIds, food_ids, branchIds, branch_ids, status, } = req.body;
    const finalBranchIds = branchIds || branch_ids || [];
    const finalFoodIds = foodIds || food_ids || [];
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
        foodIds: Array.isArray(finalFoodIds) ? finalFoodIds : [],
        branchIds: Array.isArray(finalBranchIds) ? finalBranchIds : [],
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
// 2. Get All Offers (Restaurant Scoped)
// ==========================================
const getAllOffers = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const { status } = req.query;
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.offers.restaurantId, restaurantId)];
    if (status && (status === "active" || status === "inactive")) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.offers.status, status));
    }
    const allOffers = await connection_1.db
        .select()
        .from(schema_1.offers)
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.offers.createdAt));
    const enrichedList = await enrichOffersWithBranchesAndFoods(allOffers, restaurantId, lang);
    return (0, response_1.SuccessResponse)(res, {
        message: "Offers fetched successfully",
        data: enrichedList,
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
    const finalFoodIds = foodIds !== undefined ? foodIds : food_ids;
    if (finalFoodIds !== undefined)
        updateData.foodIds = finalFoodIds;
    const finalBranchIds = branchIds !== undefined ? branchIds : branch_ids;
    if (finalBranchIds !== undefined)
        updateData.branchIds = finalBranchIds;
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
// 7. Get Branches (Localized by lang en, ar, fr with universal fallback)
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
