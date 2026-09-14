import { Request, Response } from "express";
import { db } from "../../../models/connection";
import { offers, offerFoods, branches, food, foodVariations, variationOptions } from "../../../models/schema";
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
 * Deeply parses any stringified JSON into native JavaScript objects/arrays
 */
export const deepParseJSON = (data: any): any => {
    if (!data) return data;
    if (typeof data === "string") {
        const trimmed = data.trim();
        if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
            try {
                return deepParseJSON(JSON.parse(trimmed));
            } catch {
                return data;
            }
        }
        return data;
    }
    return data;
};

/**
 * Helper to fetch and hierarchically enrich offer foods with variations and options
 */
async function fetchAndEnrichOfferFoods(offerIds: string[], lang: Language = "en") {
    if (offerIds.length === 0) return new Map<string, any[]>();

    const offerFoodRows = await db
        .select()
        .from(offerFoods)
        .where(inArray(offerFoods.offerId, offerIds));

    if (offerFoodRows.length === 0) return new Map<string, any[]>();

    // Parse JSON columns cleanly (prevents string issues from MySQL)
    const rawParsedRows = offerFoodRows.map((r) => {
        const parsedVars = deepParseJSON(r.variations);
        const variations = Array.isArray(parsedVars) ? parsedVars : [];
        const parsedOpts = deepParseJSON(r.optionIds);
        const optionIds = Array.isArray(parsedOpts) ? parsedOpts : [];
        return {
            ...r,
            variations,
            optionIds,
        };
    });

    // Consolidate rows by (offerId, foodId) so multiple variations or duplicate rows merge seamlessly
    const groupedByOfferAndFood = new Map<string, Map<string, any>>();
    for (const r of rawParsedRows) {
        if (!groupedByOfferAndFood.has(r.offerId)) {
            groupedByOfferAndFood.set(r.offerId, new Map());
        }
        const foodMapForOffer = groupedByOfferAndFood.get(r.offerId)!;
        if (!foodMapForOffer.has(r.foodId)) {
            foodMapForOffer.set(r.foodId, {
                id: r.id,
                offerId: r.offerId,
                foodId: r.foodId,
                quantity: r.quantity || 1,
                variations: [...r.variations],
                optionIds: [...r.optionIds],
            });
        } else {
            const ex = foodMapForOffer.get(r.foodId)!;
            ex.quantity = Math.max(ex.quantity, r.quantity || 1);
            ex.variations.push(...r.variations);
            ex.optionIds = Array.from(new Set([...ex.optionIds, ...r.optionIds]));
        }
    }

    const parsedRows: any[] = [];
    for (const foodMapForOffer of groupedByOfferAndFood.values()) {
        for (const unifiedFood of foodMapForOffer.values()) {
            parsedRows.push(unifiedFood);
        }
    }

    const foodIds = Array.from(new Set(parsedRows.map((r) => r.foodId).filter(Boolean)));

    // Collect all option IDs explicitly passed
    const allOptionIds = Array.from(
        new Set(
            parsedRows.flatMap((r) => {
                const flatOpts = Array.isArray(r.optionIds) ? r.optionIds : [];
                const varOpts = Array.isArray(r.variations)
                    ? (r.variations as Array<{ variationId?: string | null; options: string[] }>).flatMap(
                          (v) => (Array.isArray(v.options) ? v.options : [])
                      )
                    : [];
                return [...flatOpts, ...varOpts].map(String).filter(Boolean);
            })
        )
    );

    // Concurrently fetch foods, explicitly passed options, AND default variations for foods with empty variations
    const foodIdsWithEmptyVars = Array.from(
        new Set(parsedRows.filter((r) => r.variations.length === 0).map((r) => r.foodId))
    );

    const [foodList, optionList, defaultVarsList] = await Promise.all([
        foodIds.length > 0
            ? db
                  .select({
                      id: food.id,
                      name: food.name,
                      nameAr: food.nameAr,
                      nameFr: food.nameFr,
                      price: food.price,
                      image: food.image,
                  })
                  .from(food)
                  .where(inArray(food.id, foodIds))
            : Promise.resolve([]),
        allOptionIds.length > 0
            ? db
                  .select()
                  .from(variationOptions)
                  .where(inArray(variationOptions.id, allOptionIds))
            : Promise.resolve([]),
        foodIdsWithEmptyVars.length > 0
            ? db
                  .select()
                  .from(foodVariations)
                  .where(inArray(foodVariations.foodId, foodIdsWithEmptyVars))
            : Promise.resolve([]),
    ]);

    const foodMap = new Map<string, (typeof foodList)[0]>();
    for (const f of foodList) {
        foodMap.set(f.id, f);
    }

    // Also fetch options for default variations
    const defaultVarIds = defaultVarsList.map((v) => v.id);
    const defaultOptsList = defaultVarIds.length > 0
        ? await db
              .select()
              .from(variationOptions)
              .where(inArray(variationOptions.variationId, defaultVarIds))
        : [];

    const defaultOptsByVarId = new Map<string, typeof defaultOptsList>();
    for (const opt of defaultOptsList) {
        if (!defaultOptsByVarId.has(opt.variationId)) {
            defaultOptsByVarId.set(opt.variationId, []);
        }
        defaultOptsByVarId.get(opt.variationId)!.push(opt);
    }

    const defaultVarsByFoodId = new Map<string, any[]>();
    for (const v of defaultVarsList) {
        if (!defaultVarsByFoodId.has(v.foodId)) {
            defaultVarsByFoodId.set(v.foodId, []);
        }
        const opts = (defaultOptsByVarId.get(v.id) || []).map((o) => ({
            optionId: o.id,
            name: getLocalizedName(
                { name: o.optionName, nameAr: o.optionNameAr, nameFr: o.optionNameFr },
                lang
            ),
            nameAr: o.optionNameAr,
            nameFr: o.optionNameFr,
            additionalPrice: o.additionalPrice,
        }));
        defaultVarsByFoodId.get(v.foodId)!.push({
            variationId: v.id,
            name: getLocalizedName(v, lang),
            nameAr: v.nameAr,
            nameFr: v.nameFr,
            selectionType: v.selectionType,
            isRequired: v.isRequired,
            options: opts,
        });
    }

    // Variations for explicitly passed options AND explicitly passed variationIds
    const varIdsFromOpts = optionList.map((o) => o.variationId).filter(Boolean);
    const explicitVarIds = parsedRows.flatMap((r) =>
        (r.variations || []).map((v: any) => v.variationId).filter(Boolean)
    );
    const allVarIdsToQuery = Array.from(new Set([...varIdsFromOpts, ...explicitVarIds]));

    const varList = allVarIdsToQuery.length > 0
        ? await db
              .select()
              .from(foodVariations)
              .where(inArray(foodVariations.id, allVarIdsToQuery))
        : [];

    const varMap = new Map<string, (typeof varList)[0]>();
    for (const v of varList) {
        varMap.set(v.id, v);
    }

    const optionMap = new Map<string, (typeof optionList)[0]>();
    for (const o of optionList) {
        optionMap.set(o.id, o);
    }

    const result = new Map<string, any[]>();
    for (const row of parsedRows) {
        if (!result.has(row.offerId)) {
            result.set(row.offerId, []);
        }

        const foodItem = foodMap.get(row.foodId);
        const variations = Array.isArray(row.variations)
            ? (row.variations as Array<{ variationId?: string | null; options: string[] }>)
            : [];

        // Consolidate variations with the same variationId
        const consolidatedVarMap = new Map<string, { variationId?: string | null; options: string[] }>();
        for (const v of variations) {
            const vOpts = (Array.isArray(v.options) ? v.options : []).map(String).filter(Boolean);
            const vKey = v.variationId ? String(v.variationId) : `auto_${Math.random()}`;
            if (!consolidatedVarMap.has(vKey)) {
                consolidatedVarMap.set(vKey, { variationId: v.variationId || null, options: [...vOpts] });
            } else {
                const ex = consolidatedVarMap.get(vKey)!;
                ex.options = Array.from(new Set([...ex.options, ...vOpts]));
            }
        }

        let enrichedVariations = Array.from(consolidatedVarMap.values()).map((v) => {
            const opts = (Array.isArray(v.options) ? v.options : []).map((optId) => {
                const optInfo = optionMap.get(String(optId));
                return {
                    optionId: String(optId),
                    name: optInfo
                        ? getLocalizedName(
                              {
                                  name: optInfo.optionName,
                                  nameAr: optInfo.optionNameAr,
                                  nameFr: optInfo.optionNameFr,
                              },
                              lang
                          )
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
                name: varInfo ? getLocalizedName(varInfo, lang) : null,
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

        result.get(row.offerId)!.push({
            id: row.id,
            foodId: row.foodId,
            name: foodItem ? getLocalizedName(foodItem, lang) : "",
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
async function enrichOffersWithBranchesAndFoods<
    T extends { id: string; branchIds: any; foodIds?: any; name: string; nameAr?: string | null; nameFr?: string | null }
>(items: T[], restaurantId: string, lang: Language = "en") {
    if (items.length === 0) return [];

    const offerIds = items.map((i) => i.id);
    const allBranchIds = Array.from(
        new Set(items.flatMap((item) => parseJsonArray(item.branchIds)))
    );

    const [branchList, offerFoodsMap] = await Promise.all([
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
        fetchAndEnrichOfferFoods(offerIds, lang),
    ]);

    const branchMap = new Map<
        string,
        { id: string; name: string; nameAr: string | null; nameFr: string | null }
    >();
    for (const b of branchList) {
        branchMap.set(b.id, b);
    }

    // Check if any offers had no offerFoods rows and need legacy food enrichment
    const missingOfferFoodIds = items
        .filter((item) => !offerFoodsMap.has(item.id) || offerFoodsMap.get(item.id)!.length === 0)
        .flatMap((item) => parseJsonArray(item.foodIds));

    const legacyFoodMap = new Map<string, any>();
    if (missingOfferFoodIds.length > 0) {
        const legacyFoods = await db
            .select({
                id: food.id,
                name: food.name,
                nameAr: food.nameAr,
                nameFr: food.nameFr,
                price: food.price,
                image: food.image,
            })
            .from(food)
            .where(
                and(
                    eq(food.restaurantid, restaurantId),
                    inArray(food.id, missingOfferFoodIds)
                )
            );
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
                id: b!.id,
                name: getLocalizedName(b!, lang),
                nameAr: b!.nameAr,
                nameFr: b!.nameFr,
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
                    name: getLocalizedName(f, lang),
                    nameAr: f.nameAr,
                    nameFr: f.nameFr,
                    price: f.price,
                    image: f.image,
                    quantity: 1,
                    variations: [],
                }));
        }

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
            branches: itemBranches,
            foods: itemFoods,
        };
    });
}

/**
 * Helper to consolidate foods and variations by foodId and variationId
 */
function consolidateFoodsAndVariations(
    foodsInput: any,
    foodIdsInput: any
): Array<{
    foodId: string;
    quantity: number;
    variations: Array<{ variationId?: string | null; options: string[] }>;
}> {
    let rawItems: any[] = [];
    if (Array.isArray(foodsInput) && foodsInput.length > 0) {
        rawItems = foodsInput;
    } else {
        const rawIds = parseJsonArray(foodIdsInput);
        rawItems = rawIds.map((fid) => ({ foodId: fid, quantity: 1, variations: [] }));
    }

    const mergedFoodsMap = new Map<string, {
        foodId: string;
        quantity: number;
        variations: Array<{ variationId?: string | null; options: string[] }>;
    }>();

    for (const item of rawItems) {
        if (!item) continue;
        const fid = typeof item === "string" ? item : String(item.foodId || item.food_id || item.id || "");
        if (!fid) continue;

        const qty = item.quantity !== undefined ? Number(item.quantity) || 1 : 1;
        const vars = Array.isArray(item.variations) ? item.variations : [];

        if (!mergedFoodsMap.has(fid)) {
            mergedFoodsMap.set(fid, {
                foodId: fid,
                quantity: qty,
                variations: [...vars],
            });
        } else {
            const ex = mergedFoodsMap.get(fid)!;
            ex.quantity = Math.max(ex.quantity, qty);
            ex.variations.push(...vars);
        }
    }

    return Array.from(mergedFoodsMap.values()).map((f) => {
        const vMap = new Map<string, { variationId?: string | null; options: string[] }>();
        for (const v of f.variations) {
            const vKey = v.variationId ? String(v.variationId) : `auto_${Math.random()}`;
            const vOpts = Array.isArray(v.options) ? v.options.map(String).filter(Boolean) : [];
            if (!vMap.has(vKey)) {
                vMap.set(vKey, { variationId: v.variationId || null, options: [...vOpts] });
            } else {
                const ex = vMap.get(vKey)!;
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
        foods,
        foodIds,
        food_ids,
        branchIds,
        branch_ids,
        status,
    } = req.body;

    const finalBranchIds = parseJsonArray(branchIds !== undefined ? branchIds : branch_ids);

    const consolidatedFoods = consolidateFoodsAndVariations(
        foods,
        foodIds !== undefined ? foodIds : food_ids
    );
    const distinctFoodIds = consolidatedFoods.map((f) => f.foodId);

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
        foodIds: distinctFoodIds,
        branchIds: finalBranchIds,
        status: status || "active",
    });

    if (consolidatedFoods.length > 0) {
        const rows = consolidatedFoods.map((f) => {
            const rawVars = Array.isArray(f.variations) ? f.variations : [];
            const flatOptions = Array.from(
                new Set(
                    rawVars.flatMap((v) =>
                        Array.isArray(v.options) ? v.options : []
                    ).map(String).filter(Boolean)
                )
            );
            return {
                id: uuidv4(),
                offerId: id,
                foodId: f.foodId,
                variations: rawVars,
                optionIds: flatOptions,
                quantity: f.quantity || 1,
            };
        });
        await db.insert(offerFoods).values(rows);
    }

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
            id : item.id, 
            image : item.image,
            startDate : item.startDate,
            endDate : item.endDate,
            price : item.price,
            name: getLocalizedName(
                {
                    name: item.name,
                    nameAr: item.nameAr,
                    nameFr: item.nameFr,
                },
                lang
            ), 
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
        foods,
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

    const rawFoods = foods !== undefined ? foods : (foodIds !== undefined ? foodIds : food_ids);
    if (rawFoods !== undefined) {
        const consolidatedFoods = consolidateFoodsAndVariations(
            Array.isArray(foods) ? foods : (Array.isArray(rawFoods) && typeof rawFoods[0] === "object" ? rawFoods : []),
            rawFoods
        );
        const distinctFoodIds = consolidatedFoods.map((f) => f.foodId);
        updateData.foodIds = distinctFoodIds;

        // Delete existing offer_foods and insert updated rows
        await db.delete(offerFoods).where(eq(offerFoods.offerId, id));

        if (consolidatedFoods.length > 0) {
            const rows = consolidatedFoods.map((f) => {
                const rawVars = Array.isArray(f.variations) ? f.variations : [];
                const flatOptions = Array.from(
                    new Set(
                        rawVars.flatMap((v) =>
                            Array.isArray(v.options) ? v.options : []
                        ).map(String).filter(Boolean)
                    )
                );
                return {
                    id: uuidv4(),
                    offerId: id,
                    foodId: f.foodId,
                    variations: rawVars,
                    optionIds: flatOptions,
                    quantity: f.quantity || 1,
                };
            });
            await db.insert(offerFoods).values(rows);
        }
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
        .select()
        .from(offers)
        .where(and(eq(offers.id, id), eq(offers.restaurantId, restaurantId)))
        .limit(1);

    if (!offer) {
        throw new NotFound("Offer not found");
    }

    const foodsMap = await fetchAndEnrichOfferFoods([id], lang);
    let result = foodsMap.get(id) || [];

    if (result.length === 0 && offer.foodIds) {
        const legacyFoodIds = parseJsonArray(offer.foodIds);
        if (legacyFoodIds.length > 0) {
            const legacyFoods = await db
                .select({
                    id: food.id,
                    name: food.name,
                    nameAr: food.nameAr,
                    nameFr: food.nameFr,
                    price: food.price,
                    image: food.image,
                })
                .from(food)
                .where(
                    and(
                        eq(food.restaurantid, restaurantId),
                        inArray(food.id, legacyFoodIds)
                    )
                );

            result = legacyFoods.map((f) => ({
                id: f.id,
                foodId: f.id,
                name: getLocalizedName(f, lang),
                nameAr: f.nameAr,
                nameFr: f.nameFr,
                price: f.price,
                image: f.image,
                quantity: 1,
                variations: [],
            }));
        }
    }

    return SuccessResponse(res, {
        message: "Offer foods fetched successfully",
        data: result,
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
            price: food.price,
            image: food.image,
        })
        .from(food)
        .where(and(...conditions));

    const foodIds = foodList.map((f) => f.id);
    const variationsList = foodIds.length > 0
        ? await db.select().from(foodVariations).where(inArray(foodVariations.foodId, foodIds))
        : [];

    const varIds = variationsList.map((v) => v.id);
    const optionsList = varIds.length > 0
        ? await db.select().from(variationOptions).where(inArray(variationOptions.variationId, varIds))
        : [];

    const optionsByVarId = new Map<string, typeof optionsList>();
    for (const opt of optionsList) {
        if (!optionsByVarId.has(opt.variationId)) {
            optionsByVarId.set(opt.variationId, []);
        }
        optionsByVarId.get(opt.variationId)!.push(opt);
    }

    const variationsByFoodId = new Map<string, any[]>();
    for (const v of variationsList) {
        if (!variationsByFoodId.has(v.foodId)) {
            variationsByFoodId.set(v.foodId, []);
        }
        const opts = (optionsByVarId.get(v.id) || []).map((o) => ({
            id: o.id,
            optionName: o.optionName,
            name: getLocalizedName(
                { name: o.optionName, nameAr: o.optionNameAr, nameFr: o.optionNameFr },
                lang
            ),
            nameAr: o.optionNameAr,
            nameFr: o.optionNameFr,
            additionalPrice: o.additionalPrice,
            isDefault: o.isDefault,
            status: o.status,
        }));

        variationsByFoodId.get(v.foodId)!.push({
            id: v.id,
            name: getLocalizedName(v, lang),
            nameAr: v.nameAr,
            nameFr: v.nameFr,
            selectionType: v.selectionType,
            isRequired: v.isRequired,
            min: v.min,
            max: v.max,
            options: opts,
        });
    }

    const formatted = foodList.map((f) => ({
        id: f.id,
        name: getLocalizedName(f, lang),
        nameAr: f.nameAr,
        nameFr: f.nameFr,
        price: f.price,
        image: f.image,
        variations: variationsByFoodId.get(f.id) || [],
    }));

    return SuccessResponse(res, {
        message: "Foods fetched successfully",
        data: formatted,
    });
};
