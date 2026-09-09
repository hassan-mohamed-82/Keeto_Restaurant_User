import { Request, Response } from "express";
import { db } from "../../../models/connection";
import { taxes, branches, food, subcategories } from "../../../models/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { SuccessResponse } from "../../../utils/response";
import { BadRequest, NotFound } from "../../../Errors";
import { v4 as uuidv4 } from "uuid";
import { TAX_MODULES, TAX_TYPES, TAX_MODULE_TYPES } from "../../../validation/admin/taxes";

export type Language = "en" | "ar" | "fr";

export const extractLang = (req: Request): Language => {
    const raw = (req.body?.lang || req.query?.lang || req.headers["accept-language"] || "en") as string;
    const lower = String(raw).toLowerCase().trim().slice(0, 2);
    if (lower === "ar") return "ar";
    if (lower === "fr") return "fr";
    return "en";
};

export const getLocalizedName = (
    item: { name: string; nameAr?: string | null; nameFr?: string | null },
    lang: Language = "en"
): string => {
    if (lang === "ar" && item.nameAr && item.nameAr.trim() !== "") {
        return item.nameAr;
    }
    if (lang === "fr" && item.nameFr && item.nameFr.trim() !== "") {
        return item.nameFr;
    }
    return item.name;
};

/**
 * Helper to enrich tax items with branch and food details
 */
async function enrichTaxesWithBranchesAndFoods<
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
// 1. Create Tax
// ==========================================
export const createTax = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const { name, nameAr, nameFr, amount, type, moduleType, module_type, branchIds, foodIds, modules, status } = req.body;

    const finalModuleType = moduleType || module_type || "all";
    const id = uuidv4();
    await db.insert(taxes).values({
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
// 2. Get All Taxes (Restaurant Scoped)
// ==========================================
export const getAllTaxes = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const { status, type, moduleType, module_type } = req.query;

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

    const allItems = await db
        .select()
        .from(taxes)
        .where(and(...conditions))
        .orderBy(desc(taxes.createdAt));

    const enrichedList = await enrichTaxesWithBranchesAndFoods(allItems, restaurantId, lang);

    return SuccessResponse(res, {
        message: "Taxes fetched successfully",
        data: enrichedList,
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
    const [myBranches, myFoods] = await Promise.all([
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
        db
            .select({
                id: food.id,
                name: food.name,
                nameAr: food.nameAr,
                nameFr: food.nameFr,
            })
            .from(food)
            .where(eq(food.restaurantid, restaurantId)),
    ]);

    const localizedBranches = myBranches.map((b) => ({
        id: b.id,
        name: getLocalizedName(b, lang),
        nameAr: b.nameAr,
        nameFr: b.nameFr,
    }));

    const localizedFoods = myFoods.map((f) => ({
        id: f.id,
        name: getLocalizedName(f, lang),
        nameAr: f.nameAr,
        nameFr: f.nameFr,
    }));

    return SuccessResponse(res, {
        message: "Tax options fetched successfully",
        data: {
            branches: localizedBranches,
            foods: localizedFoods,
            modules: TAX_MODULES,
            types: TAX_TYPES,
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

    const { name, nameAr, nameFr, amount, type, moduleType, module_type, branchIds, foodIds, modules, status } = req.body;

    const updateData: Partial<typeof taxes.$inferInsert> = {};
    if (name !== undefined) updateData.name = name;
    if (nameAr !== undefined) updateData.nameAr = nameAr;
    if (nameFr !== undefined) updateData.nameFr = nameFr;
    if (amount !== undefined) updateData.amount = String(amount);
    if (type !== undefined) updateData.type = type;
    const finalModuleType = moduleType || module_type;
    if (finalModuleType !== undefined) updateData.moduleType = finalModuleType;
    if (branchIds !== undefined) updateData.branchIds = branchIds;
    if (foodIds !== undefined) updateData.foodIds = foodIds;
    if (modules !== undefined) updateData.modules = modules;
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
// 9. Get Foods (Localized by lang & filtered by subcategory_id)
// ==========================================
export const getFoods = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const subcategoryId =
        req.query?.subcategory_id ||
        req.query?.subcategoryId ||
        req.body?.subcategory_id ||
        req.body?.subcategoryId;

    const conditions = [eq(food.restaurantid, restaurantId)];
    if (subcategoryId && typeof subcategoryId === "string") {
        conditions.push(eq(food.subcategoryid, subcategoryId));
    }

    const foodList = await db
        .select({
            id: food.id,
            name: food.name,
            nameAr: food.nameAr,
            nameFr: food.nameFr,
            subcategoryId: food.subcategoryid,
        })
        .from(food)
        .where(and(...conditions));

    const formatted = foodList.map((f) => ({
        id: f.id,
        name: getLocalizedName(f, lang),
        subcategoryId: f.subcategoryId,
    }));

    return SuccessResponse(res, {
        message: "Foods fetched successfully",
        data: formatted,
    });
};
