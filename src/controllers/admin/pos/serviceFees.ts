import { Request, Response } from "express";
import { db } from "../../../models/connection";
import { serviceFees, branches, subcategories, food } from "../../../models/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { SuccessResponse } from "../../../utils/response";
import { BadRequest, NotFound } from "../../../Errors";
import { v4 as uuidv4 } from "uuid";
import {
    SERVICE_FEE_MODULES,
    SERVICE_FEE_TYPES,
    SERVICE_FEE_MODULE_TYPES,
} from "../../../validation/admin/serviceFees";

import { extractLang, getLocalizedName, Language } from "../../../helpers/localization.helper";


/**
 * Helper to enrich service fee items with branch details (id, name, nameAr, nameFr)
 */
async function enrichServiceFeesWithBranches<
    T extends { branchIds: string[]; name?: string | null; nameAr?: string | null; nameFr?: string | null }
>(items: T[], restaurantId: string, lang: Language = "en") {
    if (items.length === 0) return items;

    // Collect all unique branchIds across items
    const allBranchIds = Array.from(
        new Set(items.flatMap((item) => (Array.isArray(item.branchIds) ? item.branchIds : [])))
    );

    // Fetch matching branches for this restaurant
    const branchList =
        allBranchIds.length > 0
            ? await db
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
            : [];

    const branchMap = new Map<
        string,
        { id: string; name: string; nameAr: string | null; nameFr: string | null }
    >();
    for (const b of branchList) {
        branchMap.set(b.id, b);
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

        const localizedName = getLocalizedName(
            {
                name: item.name || "",
                nameAr: item.nameAr,
                nameFr: item.nameFr,
            },
            lang
        );

        return {
            ...item,
            name: localizedName,
            branches: itemBranches,
        };
    });
}

// ==========================================
// 1. Create Service Fee
// ==========================================
export const createServiceFee = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const { name, nameAr, nameFr, amount, type, moduleType, module_type, branchIds, modules, status } = req.body;

    const finalModuleType = moduleType || module_type || "all";
    const id = uuidv4();
    await db.insert(serviceFees).values({
        id,
        restaurantId,
        name: name || null,
        nameAr: nameAr || null,
        nameFr: nameFr || null,
        amount: String(amount),
        type,
        moduleType: finalModuleType,
        branchIds: Array.isArray(branchIds) ? branchIds : [],
        modules: Array.isArray(modules) ? modules : ["all"],
        status: status || "active",
    });

    const [createdItem] = await db
        .select()
        .from(serviceFees)
        .where(eq(serviceFees.id, id))
        .limit(1);

    const [enriched] = await enrichServiceFeesWithBranches([createdItem], restaurantId, lang);

    return SuccessResponse(
        res,
        {
            message: "Service fee created successfully",
            data: enriched || createdItem,
        },
        201
    );
};

// ==========================================
// 2. Get All Service Fees (Restaurant Scoped)
// ==========================================
export const getAllServiceFees = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const { status, type, moduleType, module_type } = req.query;

    const conditions = [eq(serviceFees.restaurantId, restaurantId)];
    if (status && (status === "active" || status === "inactive")) {
        conditions.push(eq(serviceFees.status, status));
    }
    if (type && (type === "web" || type === "app" || type === "all")) {
        conditions.push(eq(serviceFees.type, type));
    }
    const filterModuleType = moduleType || module_type;
    if (
        filterModuleType &&
        (filterModuleType === "pos" || filterModuleType === "online" || filterModuleType === "all")
    ) {
        conditions.push(eq(serviceFees.moduleType, filterModuleType));
    }

    const allItems = await db
        .select()
        .from(serviceFees)
        .where(and(...conditions))
        .orderBy(desc(serviceFees.createdAt));

    const enrichedList = await enrichServiceFeesWithBranches(allItems, restaurantId, lang);

    return SuccessResponse(res, {
        message: "Service fees fetched successfully",
        data: enrichedList,
    });
};

// ==========================================
// 3. Get Service Fee Options / List Data (Branches, Modules, Types)
// ==========================================
export const getServiceFeeListOptions = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);

    // Get active branches for this restaurant
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

    const localizedBranches = myBranches.map((b) => ({
        id: b.id,
        name: getLocalizedName(b, lang),
        nameAr: b.nameAr,
        nameFr: b.nameFr,
    }));

    return SuccessResponse(res, {
        message: "Service fee options fetched successfully",
        data: {
            branches: localizedBranches,
            modules: SERVICE_FEE_MODULES,
            types: SERVICE_FEE_TYPES,
            moduleTypes: SERVICE_FEE_MODULE_TYPES,
        },
    });
};

// ==========================================
// 4. Get Service Fee By ID
// ==========================================
export const getServiceFeeById = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const { id } = req.params;

    const [item] = await db
        .select()
        .from(serviceFees)
        .where(and(eq(serviceFees.id, id), eq(serviceFees.restaurantId, restaurantId)))
        .limit(1);

    if (!item) {
        throw new NotFound("Service fee not found");
    }

    const [enriched] = await enrichServiceFeesWithBranches([item], restaurantId, lang);

    return SuccessResponse(res, {
        message: "Service fee fetched successfully",
        data: enriched || item,
    });
};

// ==========================================
// 5. Update Service Fee
// ==========================================
export const updateServiceFee = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const { id } = req.params;

    const [existingItem] = await db
        .select()
        .from(serviceFees)
        .where(and(eq(serviceFees.id, id), eq(serviceFees.restaurantId, restaurantId)))
        .limit(1);

    if (!existingItem) {
        throw new NotFound("Service fee not found");
    }

    const { name, nameAr, nameFr, amount, type, moduleType, module_type, branchIds, modules, status } = req.body;

    const updateData: Partial<typeof serviceFees.$inferInsert> = {};
    if (name !== undefined) updateData.name = name;
    if (nameAr !== undefined) updateData.nameAr = nameAr;
    if (nameFr !== undefined) updateData.nameFr = nameFr;
    if (amount !== undefined) updateData.amount = String(amount);
    if (type !== undefined) updateData.type = type;
    const finalModuleType = moduleType || module_type;
    if (finalModuleType !== undefined) updateData.moduleType = finalModuleType;
    if (branchIds !== undefined) updateData.branchIds = branchIds;
    if (modules !== undefined) updateData.modules = modules;
    if (status !== undefined) updateData.status = status;

    if (Object.keys(updateData).length > 0) {
        await db
            .update(serviceFees)
            .set(updateData)
            .where(and(eq(serviceFees.id, id), eq(serviceFees.restaurantId, restaurantId)));
    }

    const [updatedItem] = await db
        .select()
        .from(serviceFees)
        .where(and(eq(serviceFees.id, id), eq(serviceFees.restaurantId, restaurantId)))
        .limit(1);

    const [enriched] = await enrichServiceFeesWithBranches([updatedItem], restaurantId, lang);

    return SuccessResponse(res, {
        message: "Service fee updated successfully",
        data: enriched || updatedItem,
    });
};

// ==========================================
// 6. Delete Service Fee
// ==========================================
export const deleteServiceFee = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existingItem] = await db
        .select()
        .from(serviceFees)
        .where(and(eq(serviceFees.id, id), eq(serviceFees.restaurantId, restaurantId)))
        .limit(1);

    if (!existingItem) {
        throw new NotFound("Service fee not found");
    }

    await db
        .delete(serviceFees)
        .where(and(eq(serviceFees.id, id), eq(serviceFees.restaurantId, restaurantId)));

    return SuccessResponse(res, {
        message: "Service fee deleted successfully",
    });
};

// ==========================================
// 7. Toggle Service Fee Status (Active / Inactive)
// ==========================================
export const toggleServiceFeeStatus = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existingItem] = await db
        .select()
        .from(serviceFees)
        .where(and(eq(serviceFees.id, id), eq(serviceFees.restaurantId, restaurantId)))
        .limit(1);

    if (!existingItem) {
        throw new NotFound("Service fee not found");
    }

    const newStatus = existingItem.status === "active" ? "inactive" : "active";

    await db
        .update(serviceFees)
        .set({ status: newStatus })
        .where(and(eq(serviceFees.id, id), eq(serviceFees.restaurantId, restaurantId)));

    return SuccessResponse(res, {
        message: `Service fee status changed to ${newStatus}`,
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

// ==========================================
// 10. Get Branches (Localized by lang en, ar, fr with fallback to en)
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
