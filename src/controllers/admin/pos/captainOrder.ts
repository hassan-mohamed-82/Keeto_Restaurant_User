import { Request, Response } from "express";
import { db } from "../../../models/connection";
import { captainOrders, branches, halls } from "../../../models/schema";
import { eq, and, desc, count, or, like, ne, inArray } from "drizzle-orm";
import { SuccessResponse } from "../../../utils/response";
import { BadRequest, NotFound } from "../../../Errors";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";
import { saveBase64Image, handleImageUpdate, deleteImage } from "../../../utils/handleImages";
import { extractLang, getLocalizedName, parseJsonArray } from "../../../helpers/localization.helper";

// ==========================================
// 1. Create CaptainOrder
// ==========================================
export const createCaptainOrder = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);

    const {
        name,
        user_name,
        phone,
        password,
        branch_id,
        branchId,
        hall_ids,
        hallIds,
        image,
        status,
    } = req.body;

    const targetBranchId = branch_id || branchId;

    // 1. Validate Branch belongs to restaurant
    const [targetBranch] = await db
        .select()
        .from(branches)
        .where(and(eq(branches.id, targetBranchId), eq(branches.restaurantId, restaurantId)))
        .limit(1);

    if (!targetBranch) {
        throw new BadRequest("Invalid branch selected: branch not found or does not belong to your restaurant");
    }

    // 2. Validate hall_ids
    const finalHallIds = parseJsonArray(hall_ids || hallIds);
    if (!finalHallIds || finalHallIds.length === 0) {
        throw new BadRequest("hall_ids is required and must contain at least one hall");
    }

    const validHalls = await db
        .select({
            id: halls.id,
            name: halls.name,
            nameAr: halls.nameAr,
            nameFr: halls.nameFr,
        })
        .from(halls)
        .where(
            and(
                eq(halls.restaurantId, restaurantId),
                eq(halls.branchId, targetBranchId),
                inArray(halls.id, finalHallIds)
            )
        );

    if (validHalls.length !== finalHallIds.length) {
        throw new BadRequest("One or more selected halls are invalid or do not belong to the selected branch");
    }

    // 3. Check user_name uniqueness within restaurant
    const [existingUserName] = await db
        .select({ id: captainOrders.id })
        .from(captainOrders)
        .where(
            and(
                eq(captainOrders.restaurantId, restaurantId),
                eq(captainOrders.userName, user_name.trim())
            )
        )
        .limit(1);

    if (existingUserName) {
        throw new BadRequest("User name is already in use in your restaurant");
    }

    // 4. Check phone uniqueness within restaurant
    const [existingPhone] = await db
        .select({ id: captainOrders.id })
        .from(captainOrders)
        .where(
            and(
                eq(captainOrders.restaurantId, restaurantId),
                eq(captainOrders.phone, phone.trim())
            )
        )
        .limit(1);

    if (existingPhone) {
        throw new BadRequest("Phone number is already in use in your restaurant");
    }

    // 5. Hash password with bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);

    // 6. Handle image if provided (not required)
    let savedImageUrl: string | null = null;
    if (image) {
        if (typeof image === "string" && image.startsWith("http")) {
            savedImageUrl = image;
        } else {
            savedImageUrl = await saveBase64Image(image, req, "captains");
        }
    }

    const id = uuidv4();
    await db.insert(captainOrders).values({
        id,
        restaurantId,
        branchId: targetBranchId,
        name: name.trim(),
        userName: user_name.trim(),
        phone: phone.trim(),
        password: hashedPassword,
        image: savedImageUrl,
        hallIds: finalHallIds,
        status: status !== undefined ? Boolean(status) : true,
    });

    const [created] = await db
        .select({
            id: captainOrders.id,
            restaurantId: captainOrders.restaurantId,
            branchId: captainOrders.branchId,
            name: captainOrders.name,
            userName: captainOrders.userName,
            phone: captainOrders.phone,
            image: captainOrders.image,
            hallIds: captainOrders.hallIds,
            status: captainOrders.status,
            createdAt: captainOrders.createdAt,
            updatedAt: captainOrders.updatedAt,
        })
        .from(captainOrders)
        .where(eq(captainOrders.id, id))
        .limit(1);

    const formattedCreated = {
        ...created,
        hall_ids: parseJsonArray(created.hallIds),
        halls: validHalls.map((h) => ({
            id: h.id,
            name: getLocalizedName(h, lang),
            nameAr: h.nameAr,
            nameFr: h.nameFr,
        })),
    };

    return SuccessResponse(
        res,
        {
            message: "Captain order created successfully",
            data: formattedCreated,
        },
        201
    );
};

// ==========================================
// 2. Get All CaptainOrders (Paginated & Filtered)
// ==========================================
export const getAllCaptainOrders = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const params = { ...req.query, ...req.body };
    const { search, status, branch_id, branchId, all } = params;

    const page = Math.max(1, parseInt(params.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(params.limit as string) || 10));
    const offset = (page - 1) * limit;

    const conditions = [eq(captainOrders.restaurantId, restaurantId)];

    const targetBranchId = branch_id || branchId;
    if (targetBranchId) {
        conditions.push(eq(captainOrders.branchId, targetBranchId));
    }

    if (status !== undefined && status !== "") {
        const boolStatus = status === true || status === "true" || status === 1 || status === "1";
        conditions.push(eq(captainOrders.status, boolStatus));
    }

    if (search && typeof search === "string" && search.trim() !== "") {
        const term = `%${search.trim()}%`;
        conditions.push(
            or(
                like(captainOrders.name, term),
                like(captainOrders.userName, term),
                like(captainOrders.phone, term)
            ) as any
        );
    }

    const isAll = all === "true" || all === true;

    const [totalCountResult, rawCaptains] = await Promise.all([
        db
            .select({ count: count() })
            .from(captainOrders)
            .where(and(...conditions)),
        isAll
            ? db
                  .select({
                      id: captainOrders.id,
                      restaurantId: captainOrders.restaurantId,
                      branchId: captainOrders.branchId,
                      name: captainOrders.name,
                      userName: captainOrders.userName,
                      phone: captainOrders.phone,
                      image: captainOrders.image,
                      hallIds: captainOrders.hallIds,
                      status: captainOrders.status,
                      createdAt: captainOrders.createdAt,
                      updatedAt: captainOrders.updatedAt,
                      branchName: branches.name,
                      branchNameAr: branches.nameAr,
                      branchNameFr: branches.nameFr,
                      branchLat: branches.lat,
                      branchLng: branches.lng,
                  })
                  .from(captainOrders)
                  .leftJoin(branches, eq(captainOrders.branchId, branches.id))
                  .where(and(...conditions))
                  .orderBy(desc(captainOrders.createdAt))
            : db
                  .select({
                      id: captainOrders.id,
                      restaurantId: captainOrders.restaurantId,
                      branchId: captainOrders.branchId,
                      name: captainOrders.name,
                      userName: captainOrders.userName,
                      phone: captainOrders.phone,
                      image: captainOrders.image,
                      hallIds: captainOrders.hallIds,
                      status: captainOrders.status,
                      createdAt: captainOrders.createdAt,
                      updatedAt: captainOrders.updatedAt,
                      branchName: branches.name,
                      branchNameAr: branches.nameAr,
                      branchNameFr: branches.nameFr,
                      branchLat: branches.lat,
                      branchLng: branches.lng,
                  })
                  .from(captainOrders)
                  .leftJoin(branches, eq(captainOrders.branchId, branches.id))
                  .where(and(...conditions))
                  .orderBy(desc(captainOrders.createdAt))
                  .limit(limit)
                  .offset(offset),
    ]);

    const totalItems = Number(totalCountResult[0]?.count || 0);
    const totalPages = isAll ? 1 : Math.ceil(totalItems / limit);

    const formattedList = rawCaptains.map((item) => ({
        id: item.id,
        name: item.name,
        user_name: item.userName,
        phone: item.phone,
        image: item.image,
        hall_ids: parseJsonArray(item.hallIds),
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
        map: item.branchLat && item.branchLng ? `https://maps.google.com/?q=${item.branchLat},${item.branchLng}` : null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
    }));

    return SuccessResponse(res, {
        message: "Captain orders fetched successfully",
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
export const getBranchesForCaptain = async (req: Request, res: Response) => {
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
// 4. Get CaptainOrder By ID
// ==========================================
export const getCaptainOrderById = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const { id } = req.params;

    const [row] = await db
        .select({
            id: captainOrders.id,
            restaurantId: captainOrders.restaurantId,
            branchId: captainOrders.branchId,
            name: captainOrders.name,
            userName: captainOrders.userName,
            phone: captainOrders.phone,
            image: captainOrders.image,
            hallIds: captainOrders.hallIds,
            status: captainOrders.status,
            createdAt: captainOrders.createdAt,
            updatedAt: captainOrders.updatedAt,
            branchName: branches.name,
            branchNameAr: branches.nameAr,
            branchNameFr: branches.nameFr,
            branchLat: branches.lat,
            branchLng: branches.lng,
        })
        .from(captainOrders)
        .leftJoin(branches, eq(captainOrders.branchId, branches.id))
        .where(and(eq(captainOrders.id, id), eq(captainOrders.restaurantId, restaurantId)))
        .limit(1);

    if (!row) {
        throw new NotFound("Captain order not found");
    }

    const hallIdList = parseJsonArray(row.hallIds);
    let assignedHalls: any[] = [];
    if (hallIdList.length > 0) {
        const rawHalls = await db
            .select({
                id: halls.id,
                name: halls.name,
                nameAr: halls.nameAr,
                nameFr: halls.nameFr,
                status: halls.status,
            })
            .from(halls)
            .where(
                and(
                    eq(halls.restaurantId, restaurantId),
                    inArray(halls.id, hallIdList)
                )
            );

        assignedHalls = rawHalls.map((h) => ({
            id: h.id,
            name: getLocalizedName(h, lang),
            nameAr: h.nameAr,
            nameFr: h.nameFr,
            status: h.status,
        }));
    }

    const result = {
        id: row.id,
        name: row.name,
        user_name: row.userName,
        phone: row.phone,
        image: row.image,
        hallIds: hallIdList,
        hall_ids: hallIdList,
        halls: assignedHalls,
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
        map: row.branchLat && row.branchLng ? `https://maps.google.com/?q=${row.branchLat},${row.branchLng}` : null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };

    return SuccessResponse(res, {
        message: "Captain order fetched successfully",
        data: result,
    });
};

// ==========================================
// 5. Update CaptainOrder
// ==========================================
export const updateCaptainOrder = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(captainOrders)
        .where(and(eq(captainOrders.id, id), eq(captainOrders.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) {
        throw new NotFound("Captain order not found");
    }

    const {
        name,
        user_name,
        phone,
        password,
        branch_id,
        branchId,
        hall_ids,
        hallIds,
        image,
        status,
    } = req.body;

    const targetBranchId = branch_id || branchId;
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

    // Check user_name uniqueness if changed
    if (user_name && user_name.trim() !== existing.userName) {
        const [existingUserName] = await db
            .select({ id: captainOrders.id })
            .from(captainOrders)
            .where(
                and(
                    eq(captainOrders.restaurantId, restaurantId),
                    eq(captainOrders.userName, user_name.trim()),
                    ne(captainOrders.id, id)
                )
            )
            .limit(1);

        if (existingUserName) {
            throw new BadRequest("User name is already in use in your restaurant");
        }
    }

    // Check phone uniqueness if changed
    if (phone && phone.trim() !== existing.phone) {
        const [existingPhone] = await db
            .select({ id: captainOrders.id })
            .from(captainOrders)
            .where(
                and(
                    eq(captainOrders.restaurantId, restaurantId),
                    eq(captainOrders.phone, phone.trim()),
                    ne(captainOrders.id, id)
                )
            )
            .limit(1);

        if (existingPhone) {
            throw new BadRequest("Phone number is already in use in your restaurant");
        }
    }

    const updateData: Partial<typeof captainOrders.$inferInsert> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (user_name !== undefined) updateData.userName = user_name.trim();
    if (phone !== undefined) updateData.phone = phone.trim();
    if (targetBranchId !== undefined) updateData.branchId = targetBranchId;
    if (status !== undefined) updateData.status = Boolean(status);

    // Validate and update hall_ids if provided
    if (hall_ids !== undefined || hallIds !== undefined) {
        const rawHallsInput = hall_ids !== undefined ? hall_ids : hallIds;
        const finalHallIds = parseJsonArray(rawHallsInput);
        if (finalHallIds.length === 0) {
            throw new BadRequest("At least one hall must be selected");
        }

        const branchToCheck = targetBranchId || existing.branchId;
        const validHalls = await db
            .select({ id: halls.id })
            .from(halls)
            .where(
                and(
                    eq(halls.restaurantId, restaurantId),
                    eq(halls.branchId, branchToCheck),
                    inArray(halls.id, finalHallIds)
                )
            );

        if (validHalls.length !== finalHallIds.length) {
            throw new BadRequest("One or more selected halls are invalid or do not belong to the selected branch");
        }

        updateData.hallIds = finalHallIds;
    } else if (targetBranchId && targetBranchId !== existing.branchId) {
        // If branch changed but halls were not re-sent, check if existing halls belong to new branch
        const existingHalls = parseJsonArray(existing.hallIds);
        if (existingHalls.length > 0) {
            const validInNewBranch = await db
                .select({ id: halls.id })
                .from(halls)
                .where(
                    and(
                        eq(halls.restaurantId, restaurantId),
                        eq(halls.branchId, targetBranchId),
                        inArray(halls.id, existingHalls)
                    )
                );
            if (validInNewBranch.length !== existingHalls.length) {
                throw new BadRequest("Branch changed: please provide new hall_ids belonging to the new branch");
            }
        }
    }

    // Hash password if provided
    if (password && typeof password === "string" && password.trim() !== "") {
        updateData.password = await bcrypt.hash(password, 10);
    }

    // Handle image update (deletes old image if new one provided)
    if (image !== undefined) {
        const updatedImage = await handleImageUpdate(req, existing.image, image, "captains");
        updateData.image = updatedImage;
    }

    if (Object.keys(updateData).length > 0) {
        await db
            .update(captainOrders)
            .set(updateData)
            .where(and(eq(captainOrders.id, id), eq(captainOrders.restaurantId, restaurantId)));
    }

    const [updated] = await db
        .select({
            id: captainOrders.id,
            restaurantId: captainOrders.restaurantId,
            branchId: captainOrders.branchId,
            name: captainOrders.name,
            userName: captainOrders.userName,
            phone: captainOrders.phone,
            image: captainOrders.image,
            hallIds: captainOrders.hallIds,
            status: captainOrders.status,
            createdAt: captainOrders.createdAt,
            updatedAt: captainOrders.updatedAt,
        })
        .from(captainOrders)
        .where(and(eq(captainOrders.id, id), eq(captainOrders.restaurantId, restaurantId)))
        .limit(1);

    const hallIdList = parseJsonArray(updated.hallIds);
    let assignedHalls: any[] = [];
    if (hallIdList.length > 0) {
        const rawHalls = await db
            .select({
                id: halls.id,
                name: halls.name,
                nameAr: halls.nameAr,
                nameFr: halls.nameFr,
                status: halls.status,
            })
            .from(halls)
            .where(
                and(
                    eq(halls.restaurantId, restaurantId),
                    inArray(halls.id, hallIdList)
                )
            );

        assignedHalls = rawHalls.map((h) => ({
            id: h.id,
            name: getLocalizedName(h, lang),
            nameAr: h.nameAr,
            nameFr: h.nameFr,
            status: h.status,
        }));
    }

    return SuccessResponse(res, {
        message: "Captain order updated successfully",
        data: {
            ...updated,
            hall_ids: hallIdList,
            hallIds: hallIdList,
            halls: assignedHalls,
        },
    });
};

// ==========================================
// 6. Delete CaptainOrder (Deletes image file first)
// ==========================================
export const deleteCaptainOrder = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(captainOrders)
        .where(and(eq(captainOrders.id, id), eq(captainOrders.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) {
        throw new NotFound("Captain order not found");
    }

    // Delete image file first before removing database record
    if (existing.image) {
        await deleteImage(existing.image);
    }

    await db
        .delete(captainOrders)
        .where(and(eq(captainOrders.id, id), eq(captainOrders.restaurantId, restaurantId)));

    return SuccessResponse(res, {
        message: "Captain order deleted successfully",
    });
};

// ==========================================
// 7. Toggle CaptainOrder Status
// ==========================================
export const toggleCaptainOrderStatus = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(captainOrders)
        .where(and(eq(captainOrders.id, id), eq(captainOrders.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) {
        throw new NotFound("Captain order not found");
    }

    const newStatus = !existing.status;

    await db
        .update(captainOrders)
        .set({ status: newStatus })
        .where(and(eq(captainOrders.id, id), eq(captainOrders.restaurantId, restaurantId)));

    return SuccessResponse(res, {
        message: `Captain order status changed to ${newStatus ? "active" : "inactive"}`,
        data: { id, status: newStatus },
    });
};

// ==========================================
// 8. Get Halls of a Specific CaptainOrder
// ==========================================
export const getCaptainOrderHalls = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const { id } = req.params;

    const [captain] = await db
        .select({
            id: captainOrders.id,
            name: captainOrders.name,
            branchId: captainOrders.branchId,
            hallIds: captainOrders.hallIds,
        })
        .from(captainOrders)
        .where(and(eq(captainOrders.id, id), eq(captainOrders.restaurantId, restaurantId)))
        .limit(1);

    if (!captain) {
        throw new NotFound("Captain order not found");
    }

    const hallIdList = parseJsonArray(captain.hallIds);
    if (hallIdList.length === 0) {
        return SuccessResponse(res, {
            message: "Captain order halls fetched successfully",
            data: [],
        });
    }

    const rawHalls = await db
        .select({
            id: halls.id,
            name: halls.name,
            nameAr: halls.nameAr,
            nameFr: halls.nameFr,
            status: halls.status,
        })
        .from(halls)
        .where(
            and(
                eq(halls.restaurantId, restaurantId),
                inArray(halls.id, hallIdList)
            )
        );

    const formatted = rawHalls.map((h) => ({
        id: h.id,
        name: getLocalizedName(h, lang),
        nameAr: h.nameAr,
        nameFr: h.nameFr,
        status: h.status,
    }));

    return SuccessResponse(res, {
        message: "Captain order halls fetched successfully",
        data: formatted,
    });
};

// ==========================================
// 9. Get Available Halls for Selection (by branch)
// ==========================================
export const getHallsForCaptain = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const branchId =
        req.query?.branch_id ||
        req.query?.branchId ||
        req.body?.branch_id ||
        req.body?.branchId;

    const conditions = [
        eq(halls.restaurantId, restaurantId),
        eq(halls.status, true),
    ];

    if (branchId && typeof branchId === "string") {
        conditions.push(eq(halls.branchId, branchId));
    }

    const rawHalls = await db
        .select({
            id: halls.id,
            branchId: halls.branchId,
            name: halls.name,
            nameAr: halls.nameAr,
            nameFr: halls.nameFr,
        })
        .from(halls)
        .where(and(...conditions))
        .orderBy(desc(halls.createdAt));

    const formatted = rawHalls.map((h) => ({
        id: h.id,
        branchId: h.branchId,
        name: getLocalizedName(h, lang),
        nameAr: h.nameAr,
        nameFr: h.nameFr,
    }));

    return SuccessResponse(res, {
        message: "Halls for captain fetched successfully",
        data: formatted,
    });
};
