import { Request, Response } from "express";
import { db } from "../../../models/connection";
import { stores, branches } from "../../../models/schema";
import { eq, and, desc, count, or, like, inArray } from "drizzle-orm";
import { SuccessResponse } from "../../../utils/response";
import { BadRequest, NotFound } from "../../../Errors";
import { v4 as uuidv4 } from "uuid";
import { extractLang, getLocalizedName, parseJsonArray, Language } from "../../../helpers/localization.helper";

const buildGoogleMapsLink = (lat?: string | null, lng?: string | null): string | null => {
    if (!lat || !lng) return null;
    return `https://maps.google.com/?q=${lat},${lng}`;
};

async function resolveBranchesByIds(
    branchIds: string[],
    restaurantId: string,
    lang: Language = "en"
): Promise<Array<{ id: string; name: string }>> {
    if (branchIds.length === 0) return [];
    const branchRows = await db
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

    return branchRows.map((b) => ({
        id: b.id,
        name: getLocalizedName(b, lang),
    }));
}

// ==========================================
// 1. Create Store
// ==========================================
export const createStore = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const {
        name,
        nameAr,
        nameFr,
        lat,
        lng,
        branche_ids,
        brancheIds,
        status,
    } = req.body;

    const rawBranches = branche_ids !== undefined ? branche_ids : brancheIds;
    const finalBranchIds = parseJsonArray(rawBranches);

    const id = uuidv4();
    await db.insert(stores).values({
        id,
        restaurantId,
        name,
        nameAr: nameAr || null,
        nameFr: nameFr || null,
        lat: lat !== undefined && lat !== null ? String(lat) : null,
        lng: lng !== undefined && lng !== null ? String(lng) : null,
        brancheIds: finalBranchIds,
        status: status !== undefined ? Boolean(status) : true,
    });

    const [created] = await db
        .select()
        .from(stores)
        .where(eq(stores.id, id))
        .limit(1);

    const lang = extractLang(req);
    const resolvedBranches = await resolveBranchesByIds(finalBranchIds, restaurantId, lang);

    return SuccessResponse(
        res,
        {
            message: "Store created successfully",
            data: {
                ...created,
                branche_ids: parseJsonArray(created.brancheIds),
                branches: resolvedBranches,
                map: buildGoogleMapsLink(created.lat, created.lng),
            },
        },
        201
    );
};

// ==========================================
// 2. Get All Stores (Returns localized name only for list view)
// ==========================================
export const getAllStores = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const params = { ...req.query, ...req.body };
    const { search, status, all } = params;

    const page = Math.max(1, parseInt(params.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(params.limit as string) || 10));
    const offset = (page - 1) * limit;

    const conditions = [eq(stores.restaurantId, restaurantId)];

    if (status !== undefined && status !== "") {
        const boolStatus = status === true || status === "true" || status === 1 || status === "1";
        conditions.push(eq(stores.status, boolStatus));
    }

    if (search && typeof search === "string" && search.trim() !== "") {
        const term = `%${search.trim()}%`;
        conditions.push(
            or(
                like(stores.name, term),
                like(stores.nameAr, term),
                like(stores.nameFr, term)
            ) as any
        );
    }

    const isAll = all === "true" || all === true;

    const [totalCountResult, rawStores] = await Promise.all([
        db
            .select({ count: count() })
            .from(stores)
            .where(and(...conditions)),
        isAll
            ? db
                  .select()
                  .from(stores)
                  .where(and(...conditions))
                  .orderBy(desc(stores.createdAt))
            : db
                  .select()
                  .from(stores)
                  .where(and(...conditions))
                  .orderBy(desc(stores.createdAt))
                  .limit(limit)
                  .offset(offset),
    ]);

    const totalItems = Number(totalCountResult[0]?.count || 0);
    const totalPages = isAll ? 1 : Math.ceil(totalItems / limit);

    // Collect all branch IDs from all stores fetched on this page
    const allBranchIds = Array.from(
        new Set(rawStores.flatMap((s) => parseJsonArray(s.brancheIds)))
    );

    const branchRows = allBranchIds.length > 0
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

    const branchMap = new Map<string, { id: string; name: string }>();
    for (const b of branchRows) {
        branchMap.set(b.id, {
            id: b.id,
            name: getLocalizedName(b, lang),
        });
    }

    const formattedStores = rawStores.map((s) => {
        const bIds = parseJsonArray(s.brancheIds);
        const storeBranches = bIds
            .map((id) => branchMap.get(id))
            .filter((b): b is { id: string; name: string } => Boolean(b));

        return {
            id: s.id,
            name: getLocalizedName(s, lang),
            status: s.status,
            branche_ids: bIds,
            branches: storeBranches,
            map: buildGoogleMapsLink(s.lat, s.lng),
            createdAt: s.createdAt,
        };
    });

    return SuccessResponse(res, {
        message: "Stores fetched successfully",
        data: formattedStores,
        pagination: {
            page: isAll ? 1 : page,
            limit: isAll ? totalItems : limit,
            totalItems,
            totalPages,
        },
    });
};

// ==========================================
// 3. Get Stores For Selection (Dropdown API: id & name by lang)
// ==========================================
export const getBranchForSelection = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);

    const activeBranch = await db
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
        )
        .orderBy(desc(branches.createdAt));

    const formatted = activeBranch.map((s) => ({
        id: s.id,
        name: getLocalizedName(s, lang),
    }));

    return SuccessResponse(res, {
        message: "Branch for selection fetched successfully",
        data: formatted,
    });
};

// ==========================================
// 4. Get Store By ID (Full details + map link + branches as [{id, name by lang}])
// ==========================================
export const getStoreById = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const { id } = req.params;

    const [store] = await db
        .select()
        .from(stores)
        .where(and(eq(stores.id, id), eq(stores.restaurantId, restaurantId)))
        .limit(1);

    if (!store) {
        throw new NotFound("Store not found");
    }

    const branchIds = parseJsonArray(store.brancheIds);
    let resolvedBranches: Array<{ id: string; name: string }> = [];

    if (branchIds.length > 0) {
        const branchRows = await db
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

        resolvedBranches = branchRows.map((b) => ({
            id: b.id,
            name: getLocalizedName(b, lang),
        }));
    }

    const result = {
        id: store.id,
        restaurantId: store.restaurantId,
        name: store.name,
        nameAr: store.nameAr,
        nameFr: store.nameFr,
        localizedName: getLocalizedName(store, lang),
        lat: store.lat,
        lng: store.lng,
        map: buildGoogleMapsLink(store.lat, store.lng),
        branche_ids: branchIds,
        branches: resolvedBranches,
        status: store.status,
        createdAt: store.createdAt,
        updatedAt: store.updatedAt,
    };

    return SuccessResponse(res, {
        message: "Store fetched successfully",
        data: result,
    });
};

// ==========================================
// 5. Update Store
// ==========================================
export const updateStore = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(stores)
        .where(and(eq(stores.id, id), eq(stores.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) {
        throw new NotFound("Store not found");
    }

    const {
        name,
        nameAr,
        nameFr,
        lat,
        lng,
        branche_ids,
        brancheIds,
        status,
    } = req.body;

    const updateData: Partial<typeof stores.$inferInsert> = {};
    if (name !== undefined) updateData.name = name;
    if (nameAr !== undefined) updateData.nameAr = nameAr;
    if (nameFr !== undefined) updateData.nameFr = nameFr;
    if (lat !== undefined) updateData.lat = lat !== null ? String(lat) : null;
    if (lng !== undefined) updateData.lng = lng !== null ? String(lng) : null;

    const rawBranches = branche_ids !== undefined ? branche_ids : brancheIds;
    if (rawBranches !== undefined) {
        updateData.brancheIds = parseJsonArray(rawBranches);
    }

    if (status !== undefined) updateData.status = Boolean(status);

    if (Object.keys(updateData).length > 0) {
        await db
            .update(stores)
            .set(updateData)
            .where(and(eq(stores.id, id), eq(stores.restaurantId, restaurantId)));
    }

    const [updated] = await db
        .select()
        .from(stores)
        .where(and(eq(stores.id, id), eq(stores.restaurantId, restaurantId)))
        .limit(1);

    return SuccessResponse(res, {
        message: "Store updated successfully",
        data: {
            ...updated,
            branche_ids: parseJsonArray(updated.brancheIds),
            map: buildGoogleMapsLink(updated.lat, updated.lng),
        },
    });
};

// ==========================================
// 6. Delete Store
// ==========================================
export const deleteStore = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(stores)
        .where(and(eq(stores.id, id), eq(stores.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) {
        throw new NotFound("Store not found");
    }

    await db
        .delete(stores)
        .where(and(eq(stores.id, id), eq(stores.restaurantId, restaurantId)));

    return SuccessResponse(res, {
        message: "Store deleted successfully",
    });
};

// ==========================================
// 7. Toggle Store Status
// ==========================================
export const toggleStoreStatus = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(stores)
        .where(and(eq(stores.id, id), eq(stores.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) {
        throw new NotFound("Store not found");
    }

    const newStatus = !existing.status;

    await db
        .update(stores)
        .set({ status: newStatus })
        .where(and(eq(stores.id, id), eq(stores.restaurantId, restaurantId)));

    return SuccessResponse(res, {
        message: `Store status changed to ${newStatus ? "active" : "inactive"}`,
        data: { id, status: newStatus },
    });
};
