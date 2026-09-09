import { Request, Response } from "express";
import { db } from "../../../models/connection";
import { offers, branches, food } from "../../../models/schema";
import { eq, and, desc, inArray, count, or, like } from "drizzle-orm";
import { SuccessResponse } from "../../../utils/response";
import { BadRequest, NotFound } from "../../../Errors";
import { v4 as uuidv4 } from "uuid";
import { saveBase64Image, handleImageUpdate, deleteImage } from "../../../utils/handleImages";
import { extractLang, getLocalizedName, Language } from "../../../helpers/localization.helper";

/**
 * Robustly parses any JSON / array / string representation into a string array.
 * Handles MySQL JSON string column returns, double-stringified JSON, and comma-separated lists.
 */
export function parseJsonArray(val: any): string[] {
    if (!val) return [];
    if (Array.isArray(val)) return val.map(String).filter(Boolean);
    if (typeof val === "string") {
        const trimmed = val.trim();
        if (!trimmed) return [];
        try {
            let parsed = JSON.parse(trimmed);
            if (typeof parsed === "string") {
                try {
                    parsed = JSON.parse(parsed);
                } catch {
                    // keep parsed as string
                }
            }
            if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
        } catch {
            if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
                const inner = trimmed.slice(1, -1).trim();
                if (!inner) return [];
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
async function enrichOffersWithBranchesAndFoods<
    T extends { branchIds: any; foodIds: any; name: string; nameAr?: string | null; nameFr?: string | null }
>(items: T[], restaurantId: string, lang: Language = "en") {
    if (items.length === 0) return [];

    // Collect all unique branchIds and foodIds using parseJsonArray
    const allBranchIds = Array.from(
        new Set(items.flatMap((item) => parseJsonArray(item.branchIds)))
    );
    const allFoodIds = Array.from(
        new Set(items.flatMap((item) => parseJsonArray(item.foodIds)))
    );

    // Fetch matching branches and foods concurrently
    const [branchList, foodList] = await Promise.all([
        allBranchIds.length > 0
            ? db
                  .select({
                      id: branches.id,
                      name: branches.name,
                      nameAr: branches.nameAr,
                      nameFr: branches.nameFr,
                  })
                  .from(branches)
                  .where(
                      and(
                          eq(branches.restaurantId, restaurantId),
                          inArray(branches.id, allBranchIds)
                      )
                  )
            : Promise.resolve([]),
        allFoodIds.length > 0
            ? db
                  .select({
                      id: food.id,
                      name: food.name,
                      nameAr: food.nameAr,
                      nameFr: food.nameFr,
                  })
                  .from(food)
                  .where(
                      and(
                          eq(food.restaurantid, restaurantId),
                          inArray(food.id, allFoodIds)
                      )
                  )
            : Promise.resolve([]),
    ]);

    const branchMap = new Map<
        string,
        { id: string; name: string; nameAr: string | null; nameFr: string | null }
    >();
    for (const b of branchList) {
        branchMap.set(b.id, b);
    }

    const foodMap = new Map<
        string,
        { id: string; name: string; nameAr: string | null; nameFr: string | null }
    >();
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
                id: b!.id,
                name: getLocalizedName(b!, lang),
                nameAr: b!.nameAr,
                nameFr: b!.nameFr,
            }));

        const itemFoods = itemFoodIds
            .map((id) => foodMap.get(id))
            .filter(Boolean)
            .map((f) => ({
                id: f!.id,
                name: getLocalizedName(f!, lang),
                nameAr: f!.nameAr,
                nameFr: f!.nameFr,
            }));

        const localizedName = getLocalizedName(
            {
                name: item.name,
                nameAr: item.nameAr,
                nameFr: item.nameFr,
            },
            lang
        );

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
export const createOffer = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const {
        name,
        nameAr,
        nameFr,
        image,
        startDate,
        endDate,
        price,
        foodIds,
        food_ids,
        branchIds,
        branch_ids,
        status,
    } = req.body;

    const finalBranchIds = parseJsonArray(branchIds !== undefined ? branchIds : branch_ids);
    const finalFoodIds = parseJsonArray(foodIds !== undefined ? foodIds : food_ids);

    let savedImageUrl: string | null = null;
    if (image) {
        if (typeof image === "string" && image.startsWith("http")) {
            savedImageUrl = image;
        } else {
            savedImageUrl = await saveBase64Image(image, req, "offers");
        }
    }

    const id = uuidv4();
    await db.insert(offers).values({
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

    const [createdOffer] = await db
        .select()
        .from(offers)
        .where(eq(offers.id, id))
        .limit(1);

    const [enriched] = await enrichOffersWithBranchesAndFoods([createdOffer], restaurantId, lang);

    return SuccessResponse(
        res,
        {
            message: "Offer created successfully",
            data: enriched || createdOffer,
        },
        201
    );
};

// ==========================================
// 2. Get All Offers (Paginated & Restaurant Scoped)
// ==========================================
export const getAllOffers = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const params = { ...req.query, ...req.body };
    const { status, search, all } = params;

    const page = Math.max(1, parseInt(params.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(params.limit as string) || 10));
    const offset = (page - 1) * limit;

    const conditions = [eq(offers.restaurantId, restaurantId)];
    if (status && (status === "active" || status === "inactive")) {
        conditions.push(eq(offers.status, status));
    }

    if (search && typeof search === "string" && search.trim() !== "") {
        const term = `%${search.trim()}%`;
        conditions.push(
            or(
                like(offers.name, term),
                like(offers.nameAr, term),
                like(offers.nameFr, term)
            ) as any
        );
    }

    const isAll = all === "true";

    const [totalCountResult, rawOffers] = await Promise.all([
        db
            .select({ count: count() })
            .from(offers)
            .where(and(...conditions)),
        isAll
            ? db
                  .select()
                  .from(offers)
                  .where(and(...conditions))
                  .orderBy(desc(offers.createdAt))
            : db
                  .select()
                  .from(offers)
                  .where(and(...conditions))
                  .orderBy(desc(offers.createdAt))
                  .limit(limit)
                  .offset(offset),
    ]);

    const totalItems = Number(totalCountResult[0]?.count || 0);
    const totalPages = isAll ? 1 : Math.ceil(totalItems / limit);

    const formattedOffers = rawOffers.map((item) => ({
        ...item,
        name: getLocalizedName(
            {
                name: item.name,
                nameAr: item.nameAr,
                nameFr: item.nameFr,
            },
            lang
        ),
        branchIds: parseJsonArray(item.branchIds),
        foodIds: parseJsonArray(item.foodIds),
    }));

    return SuccessResponse(res, {
        message: "Offers fetched successfully",
        data: formattedOffers,
        pagination: {
            page: isAll ? 1 : page,
            limit: isAll ? totalItems : limit,
            totalItems,
            totalPages,
        },
    });
};

// ==========================================
// 3. Get Offer By ID
// ==========================================
export const getOfferById = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const { id } = req.params;

    const [offer] = await db
        .select()
        .from(offers)
        .where(and(eq(offers.id, id), eq(offers.restaurantId, restaurantId)))
        .limit(1);

    if (!offer) {
        throw new NotFound("Offer not found");
    }

    const [enriched] = await enrichOffersWithBranchesAndFoods([offer], restaurantId, lang);

    return SuccessResponse(res, {
        message: "Offer fetched successfully",
        data: enriched || offer,
    });
};

// ==========================================
// 4. Update Offer
// ==========================================
export const updateOffer = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const { id } = req.params;

    const [existingOffer] = await db
        .select()
        .from(offers)
        .where(and(eq(offers.id, id), eq(offers.restaurantId, restaurantId)))
        .limit(1);

    if (!existingOffer) {
        throw new NotFound("Offer not found");
    }

    const {
        name,
        nameAr,
        nameFr,
        image,
        startDate,
        endDate,
        price,
        foodIds,
        food_ids,
        branchIds,
        branch_ids,
        status,
    } = req.body;

    const updateData: Partial<typeof offers.$inferInsert> = {};
    if (name !== undefined) updateData.name = name;
    if (nameAr !== undefined) updateData.nameAr = nameAr;
    if (nameFr !== undefined) updateData.nameFr = nameFr;
    if (startDate !== undefined) updateData.startDate = new Date(startDate);
    if (endDate !== undefined) updateData.endDate = new Date(endDate);
    if (price !== undefined) updateData.price = String(price);

    const rawFoodIds = foodIds !== undefined ? foodIds : food_ids;
    if (rawFoodIds !== undefined) {
        updateData.foodIds = parseJsonArray(rawFoodIds);
    }

    const rawBranchIds = branchIds !== undefined ? branchIds : branch_ids;
    if (rawBranchIds !== undefined) {
        updateData.branchIds = parseJsonArray(rawBranchIds);
    }

    if (status !== undefined) updateData.status = status;

    if (image !== undefined) {
        const updatedImage = await handleImageUpdate(req, existingOffer.image, image, "offers");
        updateData.image = updatedImage;
    }

    if (Object.keys(updateData).length > 0) {
        await db
            .update(offers)
            .set(updateData)
            .where(and(eq(offers.id, id), eq(offers.restaurantId, restaurantId)));
    }

    const [updatedOffer] = await db
        .select()
        .from(offers)
        .where(and(eq(offers.id, id), eq(offers.restaurantId, restaurantId)))
        .limit(1);

    const [enriched] = await enrichOffersWithBranchesAndFoods([updatedOffer], restaurantId, lang);

    return SuccessResponse(res, {
        message: "Offer updated successfully",
        data: enriched || updatedOffer,
    });
};

// ==========================================
// 5. Delete Offer (Deletes image file first)
// ==========================================
export const deleteOffer = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existingOffer] = await db
        .select()
        .from(offers)
        .where(and(eq(offers.id, id), eq(offers.restaurantId, restaurantId)))
        .limit(1);

    if (!existingOffer) {
        throw new NotFound("Offer not found");
    }

    // Delete image file first before removing database record
    if (existingOffer.image) {
        await deleteImage(existingOffer.image);
    }

    await db
        .delete(offers)
        .where(and(eq(offers.id, id), eq(offers.restaurantId, restaurantId)));

    return SuccessResponse(res, {
        message: "Offer deleted successfully",
    });
};

// ==========================================
// 6. Toggle Offer Status (Active / Inactive)
// ==========================================
export const toggleOfferStatus = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existingOffer] = await db
        .select()
        .from(offers)
        .where(and(eq(offers.id, id), eq(offers.restaurantId, restaurantId)))
        .limit(1);

    if (!existingOffer) {
        throw new NotFound("Offer not found");
    }

    const newStatus = existingOffer.status === "active" ? "inactive" : "active";

    await db
        .update(offers)
        .set({ status: newStatus })
        .where(and(eq(offers.id, id), eq(offers.restaurantId, restaurantId)));

    return SuccessResponse(res, {
        message: `Offer status changed to ${newStatus}`,
        data: { id, status: newStatus },
    });
};

// ==========================================
// 7. Get Branches of a Specific Offer
// ==========================================
export const getOfferBranches = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const { id } = req.params;

    const [offer] = await db
        .select({ branchIds: offers.branchIds })
        .from(offers)
        .where(and(eq(offers.id, id), eq(offers.restaurantId, restaurantId)))
        .limit(1);

    if (!offer) {
        throw new NotFound("Offer not found");
    }

    const branchIds = parseJsonArray(offer.branchIds);
    if (branchIds.length === 0) {
        return SuccessResponse(res, {
            message: "Offer branches fetched successfully",
            data: [],
        });
    }

    const offerBranches = await db
        .select({
            id: branches.id,
            name: branches.name,
            nameAr: branches.nameAr,
            nameFr: branches.nameFr,
        })
        .from(branches)
        .where(
            and(
                eq(branches.restaurantId, restaurantId),
                inArray(branches.id, branchIds)
            )
        );

    const formatted = offerBranches.map((b) => ({
        id: b.id,
        name: getLocalizedName(b, lang),
    }));

    return SuccessResponse(res, {
        message: "Offer branches fetched successfully",
        data: formatted,
    });
};

// ==========================================
// 8. Get Foods of a Specific Offer
// ==========================================
export const getOfferFoods = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const { id } = req.params;

    const [offer] = await db
        .select({ foodIds: offers.foodIds })
        .from(offers)
        .where(and(eq(offers.id, id), eq(offers.restaurantId, restaurantId)))
        .limit(1);

    if (!offer) {
        throw new NotFound("Offer not found");
    }

    const foodIds = parseJsonArray(offer.foodIds);
    if (foodIds.length === 0) {
        return SuccessResponse(res, {
            message: "Offer foods fetched successfully",
            data: [],
        });
    }

    const offerFoods = await db
        .select({
            id: food.id,
            name: food.name,
            nameAr: food.nameAr,
            nameFr: food.nameFr,
        })
        .from(food)
        .where(
            and(
                eq(food.restaurantid, restaurantId),
                inArray(food.id, foodIds)
            )
        );

    const formatted = offerFoods.map((f) => ({
        id: f.id,
        name: getLocalizedName(f, lang),
    }));

    return SuccessResponse(res, {
        message: "Offer foods fetched successfully",
        data: formatted,
    });
};

// ==========================================
// 9. Get All Active Branches for Selection
// ==========================================
export const getBranches = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);

    const myBranches = await db
        .select({
            id: branches.id,
            name: branches.name,
            nameAr: branches.nameAr,
            nameFr: branches.nameFr,
        })
        .from(branches)
        .where(
            and(
                eq(branches.restaurantId, restaurantId),
                eq(branches.status, "active")
            )
        );

    const formatted = myBranches.map((b) => ({
        id: b.id,
        name: getLocalizedName(b, lang),
    }));

    return SuccessResponse(res, {
        message: "Branches fetched successfully",
        data: formatted,
    });
};

// ==========================================
// 10. Get All Foods for Selection
// ==========================================
export const getFoods = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const { subcategory_id } = { ...req.query, ...req.body };

    const conditions = [eq(food.restaurantid, restaurantId)];
    if (subcategory_id && typeof subcategory_id === "string") {
        conditions.push(eq(food.subcategoryid, subcategory_id));
    }

    const foodList = await db
        .select({
            id: food.id,
            name: food.name,
            nameAr: food.nameAr,
            nameFr: food.nameFr,
        })
        .from(food)
        .where(and(...conditions));

    const formatted = foodList.map((f) => ({
        id: f.id,
        name: getLocalizedName(f, lang),
    }));

    return SuccessResponse(res, {
        message: "Foods fetched successfully",
        data: formatted,
    });
};
