import { Request, Response } from "express";
import { db } from "../../../models/connection";
import { offers, branches, food } from "../../../models/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { SuccessResponse } from "../../../utils/response";
import { BadRequest, NotFound } from "../../../Errors";
import { v4 as uuidv4 } from "uuid";
import { saveBase64Image, handleImageUpdate, deleteImage } from "../../../utils/handleImages";
import { extractLang, getLocalizedName, Language } from "../../../helpers/localization.helper";

/**
 * Helper to enrich offers with branch and food details
 */
async function enrichOffersWithBranchesAndFoods<
    T extends { branchIds: string[]; foodIds: string[]; name: string; nameAr?: string | null; nameFr?: string | null }
>(items: T[], restaurantId: string, lang: Language = "en") {
    if (items.length === 0) return items;

    // Collect all unique branchIds and foodIds
    const allBranchIds = Array.from(
        new Set(items.flatMap((item) => (Array.isArray(item.branchIds) ? item.branchIds : [])))
    );
    const allFoodIds = Array.from(
        new Set(items.flatMap((item) => (Array.isArray(item.foodIds) ? item.foodIds : [])))
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
        const itemBranches = (Array.isArray(item.branchIds) ? item.branchIds : [])
            .map((id) => branchMap.get(id))
            .filter(Boolean)
            .map((b) => ({
                id: b!.id,
                name: getLocalizedName(b!, lang),
                nameAr: b!.nameAr,
                nameFr: b!.nameFr,
            }));

        const itemFoods = (Array.isArray(item.foodIds) ? item.foodIds : [])
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

    const finalBranchIds = branchIds || branch_ids || [];
    const finalFoodIds = foodIds || food_ids || [];

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
        foodIds: Array.isArray(finalFoodIds) ? finalFoodIds : [],
        branchIds: Array.isArray(finalBranchIds) ? finalBranchIds : [],
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
// 2. Get All Offers (Restaurant Scoped)
// ==========================================
export const getAllOffers = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const { status } = req.query;

    const conditions = [eq(offers.restaurantId, restaurantId)];
    if (status && (status === "active" || status === "inactive")) {
        conditions.push(eq(offers.status, status));
    }

    const allOffers = await db
        .select()
        .from(offers)
        .where(and(...conditions))
        .orderBy(desc(offers.createdAt));

    const enrichedList = await enrichOffersWithBranchesAndFoods(allOffers, restaurantId, lang);

    return SuccessResponse(res, {
        message: "Offers fetched successfully",
        data: enrichedList,
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

    const finalFoodIds = foodIds !== undefined ? foodIds : food_ids;
    if (finalFoodIds !== undefined) updateData.foodIds = finalFoodIds;

    const finalBranchIds = branchIds !== undefined ? branchIds : branch_ids;
    if (finalBranchIds !== undefined) updateData.branchIds = finalBranchIds;

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
// 7. Get Branches (Localized by lang en, ar, fr with universal fallback)
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
