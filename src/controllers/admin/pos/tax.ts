import { Request, Response } from "express";
import { db } from "../../../models/connection";
import { taxes, branches, food, subcategories } from "../../../models/schema";
import { eq, and, desc, inArray, count, or, like } from "drizzle-orm";
import { SuccessResponse } from "../../../utils/response";
import { BadRequest, NotFound } from "../../../Errors";
import { v4 as uuidv4 } from "uuid";
import { TAX_MODULES, TAX_TYPES, TAX_MODULE_TYPES, AMOUNT_TYPES } from "../../../validation/admin/taxes";

import { extractLang, getLocalizedName, parseJsonArray, Language } from "../../../helpers/localization.helper";

/**
 * Helper to format tax items without heavy nested objects
 */
function formatTaxItem(item: any, lang: Language = "en") {
    const localizedName = getLocalizedName(
        {
            name: item.name || "",
            nameAr: item.nameAr,
            nameFr: item.nameFr,
        },
        lang
    );

    return {
        id: item.id,
        restaurantId: item.restaurantId,
        name: localizedName,
        amount: item.amount,
        amountType: item.amountType,
        type: item.type,
        moduleType: item.moduleType,
        modules: parseJsonArray(item.modules),
        status: item.status,
    };
}

/**
 * Helper to enrich tax items with branch and food details
 */
async function enrichTaxesWithBranchesAndFoods(
    items: any[],
    restaurantId: string,
    lang: Language = "en"
) {
    if (items.length === 0) return [];

    const allBranchIds = Array.from(
        new Set(items.flatMap((item) => parseJsonArray(item.branchIds)))
    );
    const allFoodIds = Array.from(
        new Set(items.flatMap((item) => parseJsonArray(item.foodIds)))
    );

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

    const branchMap = new Map<string, { id: string; name: string; nameAr: string | null; nameFr: string | null }>();
    for (const b of branchList) {
        branchMap.set(b.id, b);
    }

    const foodMap = new Map<string, { id: string; name: string; nameAr: string | null; nameFr: string | null }>();
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
                name: item.name || "",
                nameAr: item.nameAr,
                nameFr: item.nameFr,
            },
            lang
        );

        return {
            id: item.id,
            restaurantId: item.restaurantId,
            name: localizedName,
            nameAr: item.nameAr,
            nameFr: item.nameFr,
            amount: item.amount,
            amountType: item.amountType,
            type: item.type,
            moduleType: item.moduleType,
            modules: parseJsonArray(item.modules),
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
export const createTax = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const { name, nameAr, nameFr, amount, amountType, amount_type, type, moduleType, module_type, branchIds, foodIds, modules, status } = req.body;

    const finalAmountType = amountType || amount_type || "percentage";
    const finalModuleType = moduleType || module_type || "all";
    const finalBranchIds = parseJsonArray(branchIds);
    const finalFoodIds = parseJsonArray(foodIds);
    const finalModules = parseJsonArray(modules).length > 0 ? parseJsonArray(modules) : ["all"];

    const id = uuidv4();
    await db.insert(taxes).values({
        id,
        restaurantId,
        name,
        nameAr: nameAr || null,
        nameFr: nameFr || null,
        amount: String(amount),
        amountType: finalAmountType,
        type,
        moduleType: finalModuleType,
        branchIds: finalBranchIds,
        foodIds: finalFoodIds,
        modules: finalModules as any,
        status: status || "active",
    });

    const [createdItem] = await db
        .select()
        .from(taxes)
        .where(eq(taxes.id, id))
        .limit(1);

    const [enriched] = await enrichTaxesWithBranchesAndFoods([createdItem], restaurantId, lang);

    return SuccessResponse(
        res,
        {
            message: "Tax created successfully",
            data: enriched || createdItem,
        },
        201
    );
};

// ==========================================
// 2. Get All Taxes (Paginated & Restaurant Scoped)
// ==========================================
export const getAllTaxes = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const params = { ...req.query, ...req.body };
    const { status, type, moduleType, module_type, search, all } = params;

    const page = Math.max(1, parseInt(params.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(params.limit as string) || 10));
    const offset = (page - 1) * limit;

    const conditions = [eq(taxes.restaurantId, restaurantId)];
    if (status && (status === "active" || status === "inactive")) {
        conditions.push(eq(taxes.status, status));
    }
    if (type && (type === "web" || type === "app" || type === "all")) {
        conditions.push(eq(taxes.type, type));
    }
    const filterModuleType = moduleType || module_type;
    if (
        filterModuleType &&
        (filterModuleType === "pos" || filterModuleType === "online" || filterModuleType === "all")
    ) {
        conditions.push(eq(taxes.moduleType, filterModuleType));
    }

    if (search && typeof search === "string" && search.trim() !== "") {
        const term = `%${search.trim()}%`;
        conditions.push(
            or(
                like(taxes.name, term),
                like(taxes.nameAr, term),
                like(taxes.nameFr, term)
            ) as any
        );
    }

    const isAll = all === "true";

    const [totalCountResult, rawItems] = await Promise.all([
        db
            .select({ count: count() })
            .from(taxes)
            .where(and(...conditions)),
        isAll
            ? db
                  .select()
                  .from(taxes)
                  .where(and(...conditions))
                  .orderBy(desc(taxes.createdAt))
            : db
                  .select()
                  .from(taxes)
                  .where(and(...conditions))
                  .orderBy(desc(taxes.createdAt))
                  .limit(limit)
                  .offset(offset),
    ]);

    const totalItems = Number(totalCountResult[0]?.count || 0);
    const totalPages = isAll ? 1 : Math.ceil(totalItems / limit);

    const formattedList = rawItems.map((item) => formatTaxItem(item, lang));

    return SuccessResponse(res, {
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

// ==========================================
// 3. Get Tax Options / List Data (Branches, Foods, Modules, Types)
// ==========================================
export const getTaxListOptions = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);

    // Concurrent fetch for active branches and restaurant foods
    const [myBranches] = await Promise.all([
        db
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
            ), 
    ]);

    const localizedBranches = myBranches.map((b) => ({
        id: b.id,
        name: getLocalizedName(b, lang),
        nameAr: b.nameAr,
        nameFr: b.nameFr,
    })); 

    return SuccessResponse(res, {
        message: "Tax options fetched successfully",
        data: {
            branches: localizedBranches, 
            modules: TAX_MODULES,
            types: TAX_TYPES,
            amountTypes: AMOUNT_TYPES,
            moduleTypes: TAX_MODULE_TYPES,
        },
    });
};

// ==========================================
// 4. Get Tax By ID
// ==========================================
export const getTaxById = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const { id } = req.params;

    const [item] = await db
        .select()
        .from(taxes)
        .where(and(eq(taxes.id, id), eq(taxes.restaurantId, restaurantId)))
        .limit(1);

    if (!item) {
        throw new NotFound("Tax not found");
    }

    const [enriched] = await enrichTaxesWithBranchesAndFoods([item], restaurantId, lang);

    return SuccessResponse(res, {
        message: "Tax fetched successfully",
        data: enriched || item,
    });
};

// ==========================================
// 5. Update Tax
// ==========================================
export const updateTax = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const { id } = req.params;

    const [existingItem] = await db
        .select()
        .from(taxes)
        .where(and(eq(taxes.id, id), eq(taxes.restaurantId, restaurantId)))
        .limit(1);

    if (!existingItem) {
        throw new NotFound("Tax not found");
    }

    const { name, nameAr, nameFr, amount, amountType, amount_type, type, moduleType, module_type, branchIds, foodIds, modules, status } = req.body;

    const updateData: Partial<typeof taxes.$inferInsert> = {};
    if (name !== undefined) updateData.name = name;
    if (nameAr !== undefined) updateData.nameAr = nameAr;
    if (nameFr !== undefined) updateData.nameFr = nameFr;
    if (amount !== undefined) updateData.amount = String(amount);
    const finalAmountType = amountType || amount_type;
    if (finalAmountType !== undefined) updateData.amountType = finalAmountType;
    if (type !== undefined) updateData.type = type;
    const finalModuleType = moduleType || module_type;
    if (finalModuleType !== undefined) updateData.moduleType = finalModuleType;
    if (branchIds !== undefined) updateData.branchIds = parseJsonArray(branchIds);
    if (foodIds !== undefined) updateData.foodIds = parseJsonArray(foodIds);
    if (modules !== undefined) updateData.modules = parseJsonArray(modules) as any;
    if (status !== undefined) updateData.status = status;

    if (Object.keys(updateData).length > 0) {
        await db
            .update(taxes)
            .set(updateData)
            .where(and(eq(taxes.id, id), eq(taxes.restaurantId, restaurantId)));
    }

    const [updatedItem] = await db
        .select()
        .from(taxes)
        .where(and(eq(taxes.id, id), eq(taxes.restaurantId, restaurantId)))
        .limit(1);

    const [enriched] = await enrichTaxesWithBranchesAndFoods([updatedItem], restaurantId, lang);

    return SuccessResponse(res, {
        message: "Tax updated successfully",
        data: enriched || updatedItem,
    });
};

// ==========================================
// 6. Delete Tax
// ==========================================
export const deleteTax = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existingItem] = await db
        .select()
        .from(taxes)
        .where(and(eq(taxes.id, id), eq(taxes.restaurantId, restaurantId)))
        .limit(1);

    if (!existingItem) {
        throw new NotFound("Tax not found");
    }

    await db
        .delete(taxes)
        .where(and(eq(taxes.id, id), eq(taxes.restaurantId, restaurantId)));

    return SuccessResponse(res, {
        message: "Tax deleted successfully",
    });
};

// ==========================================
// 7. Toggle Tax Status (Active / Inactive)
// ==========================================
export const toggleTaxStatus = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existingItem] = await db
        .select()
        .from(taxes)
        .where(and(eq(taxes.id, id), eq(taxes.restaurantId, restaurantId)))
        .limit(1);

    if (!existingItem) {
        throw new NotFound("Tax not found");
    }

    const newStatus = existingItem.status === "active" ? "inactive" : "active";

    await db
        .update(taxes)
        .set({ status: newStatus })
        .where(and(eq(taxes.id, id), eq(taxes.restaurantId, restaurantId)));

    return SuccessResponse(res, {
        message: `Tax status changed to ${newStatus}`,
        data: { id, status: newStatus },
    });
};

// ==========================================
// 8. Get Subcategories (Localized by lang in body/query/headers)
// ==========================================
export const getSubcategories = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);

    const subList = await db
        .select({
            id: subcategories.id,
            name: subcategories.name,
            nameAr: subcategories.nameAr,
            nameFr: subcategories.nameFr,
        })
        .from(subcategories)
        .where(
            and(
                eq(subcategories.restaurantId, restaurantId),
                eq(subcategories.status, "active")
            )
        );

    const formatted = subList.map((sub) => ({
        id: sub.id,
        name: getLocalizedName(sub, lang),
    }));

    return SuccessResponse(res, {
        message: "Subcategories fetched successfully",
        data: formatted,
    });
};

// ==========================================
// 9. Get Foods (Localized by lang & filtered by tax or subcategory_id)
// ==========================================
export const getFoods = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);

    const taxId =
        (req.params?.id && !req.params?.subcategoryId ? req.params.id : undefined) ||
        req.query?.taxId ||
        req.body?.taxId ||
        req.query?.tax_id ||
        req.body?.tax_id;

    const subcategoryId =
        req.params?.subcategoryId ||
        req.params?.subCategoryId ||
        req.query?.subcategory_id ||
        req.query?.subcategoryId ||
        req.query?.subCategory ||
        req.query?.sub_category ||
        req.body?.subcategory_id ||
        req.body?.subcategoryId ||
        req.body?.subCategory ||
        req.body?.sub_category;

    const conditions: any[] = [eq(food.restaurantid, restaurantId)];

    if (taxId) {
        const [taxItem] = await db
            .select({ foodIds: taxes.foodIds })
            .from(taxes)
            .where(and(eq(taxes.id, String(taxId)), eq(taxes.restaurantId, restaurantId)))
            .limit(1);

        if (!taxItem) {
            throw new NotFound("Tax not found");
        }

        const foodIds = parseJsonArray(taxItem.foodIds);
        if (foodIds.length === 0) {
            return SuccessResponse(res, {
                message: "Foods fetched successfully",
                data: [],
            });
        }
        conditions.push(inArray(food.id, foodIds));
    }

    if (subcategoryId && typeof subcategoryId === "string" && subcategoryId.trim() !== "") {
        conditions.push(eq(food.subcategoryid, subcategoryId.trim()));
    }

    const foodList = await db
        .select({
            id: food.id,
            name: food.name,
            nameAr: food.nameAr,
            nameFr: food.nameFr,
            price: food.price,
            image: food.image,
            subcategoryId: food.subcategoryid,
        })
        .from(food)
        .where(and(...conditions));

    const formatted = foodList.map((f) => ({
        id: f.id,
        name: getLocalizedName(f, lang),
        price: f.price,
        image: f.image,
        subcategoryId: f.subcategoryId,
    }));

    return SuccessResponse(res, {
        message: "Foods fetched successfully",
        data: formatted,
    });
};

// ==========================================
// 10. Get Branches (Localized by lang en, ar, fr with optional taxId filter)
// ==========================================
export const getBranches = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const taxId =
        req.params?.id ||
        req.query?.taxId ||
        req.body?.taxId ||
        req.query?.tax_id ||
        req.body?.tax_id;

    if (taxId) {
        const [taxItem] = await db
            .select({ branchIds: taxes.branchIds })
            .from(taxes)
            .where(and(eq(taxes.id, String(taxId)), eq(taxes.restaurantId, restaurantId)))
            .limit(1);

        if (!taxItem) {
            throw new NotFound("Tax not found");
        }

        const branchIds = parseJsonArray(taxItem.branchIds);
        if (branchIds.length === 0) {
            return SuccessResponse(res, {
                message: "Branches fetched successfully",
                data: [],
            });
        }

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
                    inArray(branches.id, branchIds)
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
    }

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
// 11. Get Branches of a Specific Tax
// ==========================================
export const getTaxBranches = async (req: Request, res: Response) => {
    return getBranches(req, res);
};

// ==========================================
// 12. Get Foods of a Specific Tax
// ==========================================
export const getTaxFoods = async (req: Request, res: Response) => {
    return getFoods(req, res);
};
