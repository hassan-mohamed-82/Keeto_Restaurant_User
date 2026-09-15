import { Request, Response } from "express";
import { db } from "../../../models/connection";
import { halls, branches } from "../../../models/schema";
import { eq, and, desc, count, or, like } from "drizzle-orm";
import { SuccessResponse } from "../../../utils/response";
import { BadRequest, NotFound } from "../../../Errors";
import { v4 as uuidv4 } from "uuid";
import { extractLang, getLocalizedName } from "../../../helpers/localization.helper";

// ==========================================
// 1. Create Hall
// ==========================================
export const createHall = async (req: Request, res: Response) => {
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
        branch_id,
        branchId,
        branche_id,
        status,
    } = req.body;

    const targetBranchId = branch_id || branchId || branche_id;

    // 1. Validate Branch belongs to restaurant
    const [targetBranch] = await db
        .select()
        .from(branches)
        .where(and(eq(branches.id, targetBranchId), eq(branches.restaurantId, restaurantId)))
        .limit(1);

    if (!targetBranch) {
        throw new BadRequest("Invalid branch selected: branch not found or does not belong to your restaurant");
    }

    const id = uuidv4();
    await db.insert(halls).values({
        id,
        restaurantId,
        branchId: targetBranchId,
        name: name.trim(),
        nameAr: nameAr ? nameAr.trim() : null,
        nameFr: nameFr ? nameFr.trim() : null,
        lat: lat ? String(lat).trim() : null,
        lng: lng ? String(lng).trim() : null,
        status: status !== undefined ? Boolean(status) : true,
    });

    const [created] = await db
        .select()
        .from(halls)
        .where(eq(halls.id, id))
        .limit(1);

    return SuccessResponse(
        res,
        {
            message: "Hall created successfully",
            data: {
                ...created,
                map: created.lat && created.lng ? `https://maps.google.com/?q=${created.lat},${created.lng}` : null,
            },
        },
        201
    );
};

// ==========================================
// 2. Get All Halls (Paginated & Filtered)
// ==========================================
export const getAllHalls = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const params = { ...req.query, ...req.body };
    const { search, status, branch_id, branchId, branche_id, all } = params;

    const page = Math.max(1, parseInt(params.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(params.limit as string) || 10));
    const offset = (page - 1) * limit;

    const conditions = [eq(halls.restaurantId, restaurantId)];

    const targetBranchId = branch_id || branchId || branche_id;
    if (targetBranchId) {
        conditions.push(eq(halls.branchId, targetBranchId));
    }

    if (status !== undefined && status !== "") {
        const boolStatus = status === true || status === "true" || status === 1 || status === "1";
        conditions.push(eq(halls.status, boolStatus));
    }

    if (search && typeof search === "string" && search.trim() !== "") {
        const term = `%${search.trim()}%`;
        conditions.push(
            or(
                like(halls.name, term),
                like(halls.nameAr, term),
                like(halls.nameFr, term)
            ) as any
        );
    }

    const isAll = all === "true" || all === true;

    const [totalCountResult, rawHalls] = await Promise.all([
        db
            .select({ count: count() })
            .from(halls)
            .where(and(...conditions)),
        isAll
            ? db
                  .select({
                      id: halls.id,
                      restaurantId: halls.restaurantId,
                      branchId: halls.branchId,
                      name: halls.name,
                      nameAr: halls.nameAr,
                      nameFr: halls.nameFr,
                      lat: halls.lat,
                      lng: halls.lng,
                      status: halls.status,
                      createdAt: halls.createdAt,
                      updatedAt: halls.updatedAt,
                      branchName: branches.name,
                      branchNameAr: branches.nameAr,
                      branchNameFr: branches.nameFr,
                  })
                  .from(halls)
                  .leftJoin(branches, eq(halls.branchId, branches.id))
                  .where(and(...conditions))
                  .orderBy(desc(halls.createdAt))
            : db
                  .select({
                      id: halls.id,
                      restaurantId: halls.restaurantId,
                      branchId: halls.branchId,
                      name: halls.name,
                      nameAr: halls.nameAr,
                      nameFr: halls.nameFr,
                      lat: halls.lat,
                      lng: halls.lng,
                      status: halls.status,
                      createdAt: halls.createdAt,
                      updatedAt: halls.updatedAt,
                      branchName: branches.name,
                      branchNameAr: branches.nameAr,
                      branchNameFr: branches.nameFr,
                  })
                  .from(halls)
                  .leftJoin(branches, eq(halls.branchId, branches.id))
                  .where(and(...conditions))
                  .orderBy(desc(halls.createdAt))
                  .limit(limit)
                  .offset(offset),
    ]);

    const totalItems = Number(totalCountResult[0]?.count || 0);
    const totalPages = isAll ? 1 : Math.ceil(totalItems / limit);

    const formattedList = rawHalls.map((item) => ({
        id: item.id,
        name: item.name,
        nameAr: item.nameAr,
        nameFr: item.nameFr,
        displayName: getLocalizedName(
            {
                name: item.name,
                nameAr: item.nameAr,
                nameFr: item.nameFr,
            },
            lang
        ),
        lat: item.lat,
        lng: item.lng,
        map: item.lat && item.lng ? `https://maps.google.com/?q=${item.lat},${item.lng}` : null,
        status: item.status,
        branch: item.branchId
            ? {
                  id: item.branchId,
                  name: getLocalizedName(
                      {
                          name: item.branchName || "",
                          nameAr: item.branchNameAr,
                          nameFr: item.branchNameFr,
                      },
                      lang
                  ),
              }
            : null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
    }));

    return SuccessResponse(res, {
        message: "Halls fetched successfully",
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
// 3. Get Branches for Selection (id & name by lang)
// ==========================================
export const getBranchesForHall = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);

    const activeBranches = await db
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

    const formatted = activeBranches.map((b) => ({
        id: b.id,
        name: getLocalizedName(b, lang),
    }));

    return SuccessResponse(res, {
        message: "Branches for dropdown fetched successfully",
        data: formatted,
    });
};

// ==========================================
// 4. Get Hall By ID
// ==========================================
export const getHallById = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const { id } = req.params;

    const [row] = await db
        .select({
            id: halls.id,
            restaurantId: halls.restaurantId,
            branchId: halls.branchId,
            name: halls.name,
            nameAr: halls.nameAr,
            nameFr: halls.nameFr,
            lat: halls.lat,
            lng: halls.lng,
            status: halls.status,
            createdAt: halls.createdAt,
            updatedAt: halls.updatedAt,
            branchName: branches.name,
            branchNameAr: branches.nameAr,
            branchNameFr: branches.nameFr,
        })
        .from(halls)
        .leftJoin(branches, eq(halls.branchId, branches.id))
        .where(and(eq(halls.id, id), eq(halls.restaurantId, restaurantId)))
        .limit(1);

    if (!row) {
        throw new NotFound("Hall not found");
    }

    const result = {
        id: row.id,
        name: row.name,
        nameAr: row.nameAr,
        nameFr: row.nameFr,
        displayName: getLocalizedName(
            {
                name: row.name,
                nameAr: row.nameAr,
                nameFr: row.nameFr,
            },
            lang
        ),
        lat: row.lat,
        lng: row.lng,
        map: row.lat && row.lng ? `https://maps.google.com/?q=${row.lat},${row.lng}` : null,
        status: row.status,
        branch: row.branchId
            ? {
                  id: row.branchId,
                  name: getLocalizedName(
                      {
                          name: row.branchName || "",
                          nameAr: row.branchNameAr,
                          nameFr: row.branchNameFr,
                      },
                      lang
                  ),
              }
            : null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };

    return SuccessResponse(res, {
        message: "Hall fetched successfully",
        data: result,
    });
};

// ==========================================
// 5. Update Hall
// ==========================================
export const updateHall = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(halls)
        .where(and(eq(halls.id, id), eq(halls.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) {
        throw new NotFound("Hall not found");
    }

    const {
        name,
        nameAr,
        nameFr,
        lat,
        lng,
        branch_id,
        branchId,
        branche_id,
        status,
    } = req.body;

    const targetBranchId = branch_id || branchId || branche_id;
    if (targetBranchId && targetBranchId !== existing.branchId) {
        const [targetBranch] = await db
            .select()
            .from(branches)
            .where(and(eq(branches.id, targetBranchId), eq(branches.restaurantId, restaurantId)))
            .limit(1);

        if (!targetBranch) {
            throw new BadRequest("Invalid branch selected: branch not found or does not belong to your restaurant");
        }
    }

    const updateData: Partial<typeof halls.$inferInsert> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (nameAr !== undefined) updateData.nameAr = nameAr ? nameAr.trim() : null;
    if (nameFr !== undefined) updateData.nameFr = nameFr ? nameFr.trim() : null;
    if (lat !== undefined) updateData.lat = lat ? String(lat).trim() : null;
    if (lng !== undefined) updateData.lng = lng ? String(lng).trim() : null;
    if (targetBranchId !== undefined) updateData.branchId = targetBranchId;
    if (status !== undefined) updateData.status = Boolean(status);

    if (Object.keys(updateData).length > 0) {
        await db
            .update(halls)
            .set(updateData)
            .where(and(eq(halls.id, id), eq(halls.restaurantId, restaurantId)));
    }

    const [updated] = await db
        .select()
        .from(halls)
        .where(and(eq(halls.id, id), eq(halls.restaurantId, restaurantId)))
        .limit(1);

    return SuccessResponse(res, {
        message: "Hall updated successfully",
        data: {
            ...updated,
            map: updated.lat && updated.lng ? `https://maps.google.com/?q=${updated.lat},${updated.lng}` : null,
        },
    });
};

// ==========================================
// 6. Delete Hall
// ==========================================
export const deleteHall = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(halls)
        .where(and(eq(halls.id, id), eq(halls.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) {
        throw new NotFound("Hall not found");
    }

    await db
        .delete(halls)
        .where(and(eq(halls.id, id), eq(halls.restaurantId, restaurantId)));

    return SuccessResponse(res, {
        message: "Hall deleted successfully",
    });
};

// ==========================================
// 7. Toggle Hall Status
// ==========================================
export const toggleHallStatus = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(halls)
        .where(and(eq(halls.id, id), eq(halls.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) {
        throw new NotFound("Hall not found");
    }

    const newStatus = !existing.status;

    await db
        .update(halls)
        .set({ status: newStatus })
        .where(and(eq(halls.id, id), eq(halls.restaurantId, restaurantId)));

    return SuccessResponse(res, {
        message: `Hall status changed to ${newStatus ? "active" : "inactive"}`,
        data: { id, status: newStatus },
    });
};
