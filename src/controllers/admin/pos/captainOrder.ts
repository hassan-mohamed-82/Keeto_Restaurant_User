import { Request, Response } from "express";
import { db } from "../../../models/connection";
import { captainOrders, branches } from "../../../models/schema";
import { eq, and, desc, count, or, like, ne } from "drizzle-orm";
import { SuccessResponse } from "../../../utils/response";
import { BadRequest, NotFound } from "../../../Errors";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";
import { saveBase64Image, handleImageUpdate, deleteImage } from "../../../utils/handleImages";
import { extractLang, getLocalizedName } from "../../../helpers/localization.helper";

// ==========================================
// 1. Create CaptainOrder
// ==========================================
export const createCaptainOrder = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const {
        name,
        user_name,
        phone,
        password,
        branch_id,
        branchId,
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

    // 2. Check user_name uniqueness
    const [existingUserName] = await db
        .select({ id: captainOrders.id })
        .from(captainOrders)
        .where(eq(captainOrders.userName, user_name.trim()))
        .limit(1);

    if (existingUserName) {
        throw new BadRequest("User name is already in use by another captain");
    }

    // 3. Check phone uniqueness
    const [existingPhone] = await db
        .select({ id: captainOrders.id })
        .from(captainOrders)
        .where(eq(captainOrders.phone, phone.trim()))
        .limit(1);

    if (existingPhone) {
        throw new BadRequest("Phone number is already in use by another captain");
    }

    // 4. Hash password with bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);

    // 5. Handle image if provided (not required)
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
            status: captainOrders.status,
            createdAt: captainOrders.createdAt,
            updatedAt: captainOrders.updatedAt,
        })
        .from(captainOrders)
        .where(eq(captainOrders.id, id))
        .limit(1);

    return SuccessResponse(
        res,
        {
            message: "Captain order created successfully",
            data: created,
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

    const result = {
        id: row.id,
        name: row.name,
        user_name: row.userName,
        phone: row.phone,
        image: row.image,
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
            .where(and(eq(captainOrders.userName, user_name.trim()), ne(captainOrders.id, id)))
            .limit(1);

        if (existingUserName) {
            throw new BadRequest("User name is already in use by another captain");
        }
    }

    // Check phone uniqueness if changed
    if (phone && phone.trim() !== existing.phone) {
        const [existingPhone] = await db
            .select({ id: captainOrders.id })
            .from(captainOrders)
            .where(and(eq(captainOrders.phone, phone.trim()), ne(captainOrders.id, id)))
            .limit(1);

        if (existingPhone) {
            throw new BadRequest("Phone number is already in use by another captain");
        }
    }

    const updateData: Partial<typeof captainOrders.$inferInsert> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (user_name !== undefined) updateData.userName = user_name.trim();
    if (phone !== undefined) updateData.phone = phone.trim();
    if (targetBranchId !== undefined) updateData.branchId = targetBranchId;
    if (status !== undefined) updateData.status = Boolean(status);

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
            status: captainOrders.status,
            createdAt: captainOrders.createdAt,
            updatedAt: captainOrders.updatedAt,
        })
        .from(captainOrders)
        .where(and(eq(captainOrders.id, id), eq(captainOrders.restaurantId, restaurantId)))
        .limit(1);

    return SuccessResponse(res, {
        message: "Captain order updated successfully",
        data: updated,
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
