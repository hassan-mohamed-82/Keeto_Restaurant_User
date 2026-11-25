import { Request, Response } from "express";
import { db } from "../../models/connection";
import { taxes, branches, food, subcategories } from "../../models/schema";
import { eq, and, desc, inArray, count, or, like } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest, NotFound } from "../../Errors";
import { v4 as uuidv4 } from "uuid";
import { TAX_TYPES, TAX_SOURCES, TAX_MODULE_TYPES, TAX_PLATFORM_TYPES, AMOUNT_TYPES } from "../../validation/admin/tax";
import { extractLang, getLocalizedName, parseJsonArray, Language } from "../../helpers/localization.helper";
import { taxesForRestaurantCondition } from "../../helpers/tax.helper";

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

const getRestaurantId = (req: Request): string => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant context is missing or unauthorized");
    return restaurantId;
};

const ownTax = (id: string, restaurantId: string) =>
    and(eq(taxes.id, id), eq(taxes.restaurantId, restaurantId), eq(taxes.source, "restaurant"));

type TaxRow = typeof taxes.$inferSelect;

function formatTaxItem(item: TaxRow, lang: Language = "en") {
    return {
        id: item.id,
        restaurantId: item.source === "keeto" ? null : item.restaurantId,
        name: getLocalizedName({ name: item.name || "", nameAr: item.nameAr, nameFr: item.nameFr }, lang),
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
async function enrichTaxes(items: TaxRow[], restaurantId: string, lang: Language = "en") {
    if (items.length === 0) return [];

    const allBranchIds = Array.from(new Set(items.flatMap((i) => parseJsonArray(i.branchIds))));
    const allFoodIds = Array.from(new Set(items.flatMap((i) => parseJsonArray(i.foodIds))));

    const [branchList, foodList] = await Promise.all([
        allBranchIds.length
            ? db
                .select({ id: branches.id, name: branches.name, nameAr: branches.nameAr, nameFr: branches.nameFr })
                .from(branches)
                .where(and(eq(branches.restaurantId, restaurantId), inArray(branches.id, allBranchIds)))
            : Promise.resolve([]),
        allFoodIds.length
            ? db
                .select({ id: food.id, name: food.name, nameAr: food.nameAr, nameFr: food.nameFr })
                .from(food)
                .where(and(eq(food.restaurantid, restaurantId), inArray(food.id, allFoodIds)))
            : Promise.resolve([]),
    ]);

    const branchMap = new Map(branchList.map((b) => [b.id, b]));
    const foodMap = new Map(foodList.map((f) => [f.id, f]));
    const toRef = (x: { id: string; name: string; nameAr: string | null; nameFr: string | null }) => ({
        id: x.id,
        name: getLocalizedName(x, lang),
        nameAr: x.nameAr,
        nameFr: x.nameFr,
    });

    return items.map((item) => {
        const branchIds = item.source === "keeto" ? [] : parseJsonArray(item.branchIds);
        const foodIds = item.source === "keeto" ? [] : parseJsonArray(item.foodIds);
        return {
            ...formatTaxItem(item, lang),
            nameAr: item.nameAr,
            nameFr: item.nameFr,
            branchIds,
            foodIds,
            branches: branchIds.map((id) => branchMap.get(id)).filter(Boolean).map((b) => toRef(b!)),
            foods: foodIds.map((id) => foodMap.get(id)).filter(Boolean).map((f) => toRef(f!)),
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
        };
    });
}

const findTax = async (id: string, restaurantId: string) => {
    const [item] = await db
        .select()
        .from(taxes)
        .where(and(eq(taxes.id, id), taxesForRestaurantCondition(restaurantId)))
        .limit(1);
    if (!item) throw new NotFound("Tax not found");
    return item;
};

const findOwnTax = async (id: string, restaurantId: string) => {
    const item = await findTax(id, restaurantId);
    if (item.source === "keeto") {
        throw new BadRequest("This tax is applied by Keeto and cannot be modified by the restaurant");
    }
    return item;
};

// ==========================================
// 1. Create Tax (source = restaurant)
// ==========================================
export const createTax = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);
    const lang = extractLang(req);
    const { name, nameAr, nameFr, amount, amountType, taxType, modules, moduleType, branchIds, foodIds, status } = req.body;

    const id = uuidv4();
    await db.insert(taxes).values({
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
        branchIds: parseJsonArray(branchIds),
        foodIds: parseJsonArray(foodIds),
        status,
    });

    const [enriched] = await enrichTaxes([await findTax(id, restaurantId)], restaurantId, lang);
    return SuccessResponse(res, { message: "Tax created successfully", data: enriched }, 201);
};

// ==========================================
// 2. Get All Taxes (restaurant + keeto taxes of this restaurant)
//    filters: status, source, taxType, modules, moduleType, search, page, limit, all
// ==========================================
export const getAllTaxes = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);
    const lang = extractLang(req);
    const { status, source, taxType, modules, moduleType, search, all } = req.query as Record<string, string | undefined>;

    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit)) || 10));

    // own restaurant taxes + Keeto taxes that apply to this restaurant
    const conditions: any[] = [taxesForRestaurantCondition(restaurantId)];
    if (status === "active" || status === "inactive") conditions.push(eq(taxes.status, status));
    if (source && (TAX_SOURCES as readonly string[]).includes(source)) conditions.push(eq(taxes.source, source as any));
    if (taxType && (TAX_TYPES as readonly string[]).includes(taxType)) conditions.push(eq(taxes.taxType, taxType as any));
    if (modules && (TAX_MODULE_TYPES as readonly string[]).includes(modules)) conditions.push(eq(taxes.modules, modules as any));
    if (moduleType && (TAX_PLATFORM_TYPES as readonly string[]).includes(moduleType)) conditions.push(eq(taxes.moduleType, moduleType as any));
    if (search && search.trim()) {
        const term = `%${search.trim()}%`;
        conditions.push(or(like(taxes.name, term), like(taxes.nameAr, term), like(taxes.nameFr, term)));
    }
    const where = and(...conditions);
    const isAll = all === "true";

    const baseQuery = db.select().from(taxes).where(where).orderBy(desc(taxes.createdAt));
    const [[{ total }], rawItems] = await Promise.all([
        db.select({ total: count() }).from(taxes).where(where),
        isAll ? baseQuery : baseQuery.limit(limit).offset((page - 1) * limit),
    ]);

    const totalItems = Number(total || 0);
    return SuccessResponse(res, {
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

// ==========================================
// 3. Get Tax Options (branches + enums)
// ==========================================
export const getTaxListOptions = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);
    const lang = extractLang(req);

    const myBranches = await db
        .select({ id: branches.id, name: branches.name, nameAr: branches.nameAr, nameFr: branches.nameFr })
        .from(branches)
        .where(and(eq(branches.restaurantId, restaurantId), eq(branches.status, "active")));

    return SuccessResponse(res, {
        message: "Tax options fetched successfully",
        data: {
            branches: myBranches.map((b) => ({ id: b.id, name: getLocalizedName(b, lang), nameAr: b.nameAr, nameFr: b.nameFr })),
            taxTypes: TAX_TYPES,
            sources: TAX_SOURCES,
            modules: TAX_MODULE_TYPES,
            moduleTypes: TAX_PLATFORM_TYPES,
            amountTypes: AMOUNT_TYPES,
        },
    });
};

// ==========================================
// 4. Get Tax By ID (restaurant or keeto)
// ==========================================
export const getTaxById = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);
    const lang = extractLang(req);
    const [enriched] = await enrichTaxes([await findTax(req.params.id, restaurantId)], restaurantId, lang);
    return SuccessResponse(res, { message: "Tax fetched successfully", data: enriched });
};

// ==========================================
// 5. Update Tax (own restaurant taxes only)
// ==========================================
export const updateTax = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);
    const lang = extractLang(req);
    const { id } = req.params;
    await findOwnTax(id, restaurantId);

    const { name, nameAr, nameFr, amount, amountType, taxType, modules, moduleType, branchIds, foodIds, status } = req.body;
    const updateData: Partial<typeof taxes.$inferInsert> = {};
    if (name !== undefined) updateData.name = name;
    if (nameAr !== undefined) updateData.nameAr = nameAr;
    if (nameFr !== undefined) updateData.nameFr = nameFr;
    if (amount !== undefined) updateData.amount = String(amount);
    if (amountType !== undefined) updateData.amountType = amountType;
    if (taxType !== undefined) updateData.taxType = taxType;
    if (modules !== undefined) updateData.modules = modules;
    if (moduleType !== undefined) updateData.moduleType = moduleType;
    if (branchIds !== undefined) updateData.branchIds = parseJsonArray(branchIds);
    if (foodIds !== undefined) updateData.foodIds = parseJsonArray(foodIds);
    if (status !== undefined) updateData.status = status;

    if (Object.keys(updateData).length > 0) {
        await db.update(taxes).set(updateData).where(ownTax(id, restaurantId));
    }

    const [enriched] = await enrichTaxes([await findTax(id, restaurantId)], restaurantId, lang);
    return SuccessResponse(res, { message: "Tax updated successfully", data: enriched });
};

// ==========================================
// 6. Delete Tax (own restaurant taxes only)
// ==========================================
export const deleteTax = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);
    const { id } = req.params;
    await findOwnTax(id, restaurantId);
    await db.delete(taxes).where(ownTax(id, restaurantId));
    return SuccessResponse(res, { message: "Tax deleted successfully" });
};

// ==========================================
// 7. Toggle Tax Status (own restaurant taxes only)
// ==========================================
export const toggleTaxStatus = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);
    const { id } = req.params;
    const existing = await findOwnTax(id, restaurantId);
    const newStatus = existing.status === "active" ? "inactive" : "active";
    await db.update(taxes).set({ status: newStatus }).where(ownTax(id, restaurantId));
    return SuccessResponse(res, { message: `Tax status changed to ${newStatus}`, data: { id, status: newStatus } });
};

// ==========================================
// 8. Get Subcategories (localized)
// ==========================================
export const getSubcategories = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);
    const lang = extractLang(req);

    const subList = await db
        .select({ id: subcategories.id, name: subcategories.name, nameAr: subcategories.nameAr, nameFr: subcategories.nameFr })
        .from(subcategories)
        .where(
            and(
                eq(subcategories.restaurantId, restaurantId),
                eq(subcategories.isDeleted, false),
                eq(subcategories.status, "active")
            )
        );

    return SuccessResponse(res, {
        message: "Subcategories fetched successfully",
        data: subList.map((sub) => ({ id: sub.id, name: getLocalizedName(sub, lang) })),
    });
};

// ==========================================
// 9. Get Foods — query: ?taxId=&subcategoryId=
// ==========================================
export const getFoods = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);
    const lang = extractLang(req);
    const taxId = req.query.taxId as string | undefined;
    const subcategoryId = req.query.subcategoryId as string | undefined;

    const conditions: any[] = [eq(food.restaurantid, restaurantId)];

    if (taxId) {
        const tax = await findTax(taxId, restaurantId);
        const foodIds = parseJsonArray(tax.foodIds);
        if (foodIds.length === 0) {
            return SuccessResponse(res, { message: "Foods fetched successfully", data: [] });
        }
        conditions.push(inArray(food.id, foodIds));
    }
    if (subcategoryId && subcategoryId.trim()) {
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

    return SuccessResponse(res, {
        message: "Foods fetched successfully",
        data: foodList.map((f) => ({
            id: f.id,
            name: getLocalizedName(f, lang),
            price: f.price,
            image: f.image,
            subcategoryId: f.subcategoryId,
        })),
    });
};

// ==========================================
// 10. Get Branches — query: ?taxId=
// ==========================================
export const getBranches = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);
    const lang = extractLang(req);
    const taxId = req.query.taxId as string | undefined;

    const conditions: any[] = [eq(branches.restaurantId, restaurantId)];
    if (taxId) {
        const tax = await findTax(taxId, restaurantId);
        const branchIds = parseJsonArray(tax.branchIds);
        if (branchIds.length === 0) {
            return SuccessResponse(res, { message: "Branches fetched successfully", data: [] });
        }
        conditions.push(inArray(branches.id, branchIds));
    } else {
        conditions.push(eq(branches.status, "active"));
    }

    const myBranches = await db
        .select({ id: branches.id, name: branches.name, nameAr: branches.nameAr, nameFr: branches.nameFr })
        .from(branches)
        .where(and(...conditions));

    return SuccessResponse(res, {
        message: "Branches fetched successfully",
        data: myBranches.map((b) => ({ id: b.id, name: getLocalizedName(b, lang) })),
    });
};
