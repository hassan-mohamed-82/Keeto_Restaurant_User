import { Request, Response } from "express";
import { db } from "../../../models/connection";
import { cashierMen, branches, cashiers } from "../../../models/schema";
import { eq, and, desc, count, or, like, ne } from "drizzle-orm";
import { SuccessResponse } from "../../../utils/response";
import { BadRequest, NotFound } from "../../../Errors";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";
import { saveBase64Image, handleImageUpdate, deleteImage } from "../../../utils/handleImages";
import { extractLang, getLocalizedName, parseJsonArray } from "../../../helpers/localization.helper";
import { ALLOWED_REPORT_PERMISSIONS } from "../../../validation/admin/pos/cashierMan";

// ==========================================
// 1. Create CashierMan
// ==========================================
export const createCashierMan = async (req: Request, res: Response) => {
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
        roles,
        report_perimission,
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

    // 2. Check user_name uniqueness within restaurant
    const [existingUserName] = await db
        .select({ id: cashierMen.id })
        .from(cashierMen)
        .where(
            and(
                eq(cashierMen.restaurantId, restaurantId),
                eq(cashierMen.userName, user_name.trim())
            )
        )
        .limit(1);

    if (existingUserName) {
        throw new BadRequest("User name is already in use in your restaurant");
    }

    // 3. Check phone uniqueness within restaurant
    const [existingPhone] = await db
        .select({ id: cashierMen.id })
        .from(cashierMen)
        .where(
            and(
                eq(cashierMen.restaurantId, restaurantId),
                eq(cashierMen.phone, phone.trim())
            )
        )
        .limit(1);

    if (existingPhone) {
        throw new BadRequest("Phone number is already in use in your restaurant");
    }

    // 4. Hash password with bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);

    // 5. Handle image if provided
    let savedImageUrl: string | null = null;
    if (image) {
        if (typeof image === "string" && image.startsWith("http")) {
            savedImageUrl = image;
        } else {
            savedImageUrl = await saveBase64Image(image, req, "cashiers");
        }
    }

    const parsedRoles = parseJsonArray(roles);
    const parsedPermissions = parseJsonArray(report_perimission);

    const id = uuidv4();
    await db.insert(cashierMen).values({
        id,
        restaurantId,
        branchId: targetBranchId,
        name: name ? name.trim() : user_name.trim(),
        userName: user_name.trim(),
        phone: phone.trim(),
        password: hashedPassword,
        image: savedImageUrl,
        roles: parsedRoles,
        report_perimission: parsedPermissions,
        status: status !== undefined ? Boolean(status) : true,
    });

    const [created] = await db
        .select({
            id: cashierMen.id,
            restaurantId: cashierMen.restaurantId,
            branchId: cashierMen.branchId,
            name: cashierMen.name,
            userName: cashierMen.userName,
            phone: cashierMen.phone,
            image: cashierMen.image,
            roles: cashierMen.roles,
            report_perimission: cashierMen.report_perimission,
            status: cashierMen.status,
            createdAt: cashierMen.createdAt,
            updatedAt: cashierMen.updatedAt,
        })
        .from(cashierMen)
        .where(eq(cashierMen.id, id))
        .limit(1);

    return SuccessResponse(
        res,
        {
            message: "Cashier created successfully",
            data: created,
        },
        201
    );
};

// ==========================================
// 2. Get All CashierMen (Paginated & Filtered)
// ==========================================
export const getAllCashierMen = async (req: Request, res: Response) => {
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

    const conditions = [eq(cashierMen.restaurantId, restaurantId)];

    const targetBranchId = branch_id || branchId;
    if (targetBranchId) {
        conditions.push(eq(cashierMen.branchId, targetBranchId));
    }

    if (status !== undefined && status !== "") {
        const boolStatus = status === true || status === "true" || status === 1 || status === "1";
        conditions.push(eq(cashierMen.status, boolStatus));
    }

    if (search && typeof search === "string" && search.trim() !== "") {
        const term = `%${search.trim()}%`;
        conditions.push(
            or(
                like(cashierMen.name, term),
                like(cashierMen.userName, term),
                like(cashierMen.phone, term)
            ) as any
        );
    }

    const isAll = all === "true" || all === true;

    const [totalCountResult, rawCashiers] = await Promise.all([
        db
            .select({ count: count() })
            .from(cashierMen)
            .where(and(...conditions)),
        isAll
            ? db
                  .select({
                      id: cashierMen.id,
                      restaurantId: cashierMen.restaurantId,
                      branchId: cashierMen.branchId,
                      cashierId: cashierMen.cashierId,
                      cashierName: cashiers.name,
                      cashierArName: cashiers.ar_name,
                      name: cashierMen.name,
                      userName: cashierMen.userName,
                      phone: cashierMen.phone,
                      image: cashierMen.image,
                      roles: cashierMen.roles,
                      report_perimission: cashierMen.report_perimission,
                      status: cashierMen.status,
                      createdAt: cashierMen.createdAt,
                      updatedAt: cashierMen.updatedAt,
                      branchName: branches.name,
                      branchNameAr: branches.nameAr,
                      branchNameFr: branches.nameFr,
                      branchLat: branches.lat,
                      branchLng: branches.lng,
                  })
                  .from(cashierMen)
                  .leftJoin(branches, eq(cashierMen.branchId, branches.id))
                  .leftJoin(cashiers, eq(cashierMen.cashierId, cashiers.id))
                  .where(and(...conditions))
                  .orderBy(desc(cashierMen.createdAt))
            : db
                  .select({
                      id: cashierMen.id,
                      restaurantId: cashierMen.restaurantId,
                      branchId: cashierMen.branchId,
                      cashierId: cashierMen.cashierId,
                      cashierName: cashiers.name,
                      cashierArName: cashiers.ar_name,
                      name: cashierMen.name,
                      userName: cashierMen.userName,
                      phone: cashierMen.phone,
                      image: cashierMen.image,
                      roles: cashierMen.roles,
                      report_perimission: cashierMen.report_perimission,
                      status: cashierMen.status,
                      createdAt: cashierMen.createdAt,
                      updatedAt: cashierMen.updatedAt,
                      branchName: branches.name,
                      branchNameAr: branches.nameAr,
                      branchNameFr: branches.nameFr,
                      branchLat: branches.lat,
                      branchLng: branches.lng,
                  })
                  .from(cashierMen)
                  .leftJoin(branches, eq(cashierMen.branchId, branches.id))
                  .leftJoin(cashiers, eq(cashierMen.cashierId, cashiers.id))
                  .where(and(...conditions))
                  .orderBy(desc(cashierMen.createdAt))
                  .limit(limit)
                  .offset(offset),
    ]);

    const totalItems = Number(totalCountResult[0]?.count || 0);
    const totalPages = isAll ? 1 : Math.ceil(totalItems / limit);

    const formattedList = rawCashiers.map((item) => ({
        id: item.id,
        name: item.name,
        user_name: item.userName,
        phone: item.phone,
        image: item.image,
        roles: parseJsonArray(item.roles),
        report_perimission: parseJsonArray(item.report_perimission),
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
        cashier: item.cashierId
            ? {
                  id: item.cashierId,
                  name: lang === "ar" && item.cashierArName ? item.cashierArName : (item.cashierName || ""),
              }
            : null,
        map: item.branchLat && item.branchLng ? `https://maps.google.com/?q=${item.branchLat},${item.branchLng}` : null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
    }));

    return SuccessResponse(res, {
        message: "Cashiers fetched successfully",
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
// 3. Get Branches & Report Permissions for Cashier
// ==========================================
export const getBranchesAndPermissionsForCashier = async (req: Request, res: Response) => {
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

    const formattedBranches = activeBranches.map((b) => ({
        id: b.id,
        name: getLocalizedName(b, lang),
    }));

    return SuccessResponse(res, {
        message: "Branches and report permissions fetched successfully",
        data: {
            branches: formattedBranches,
            report_perimission: [...ALLOWED_REPORT_PERMISSIONS],
        },
    });
};

// ==========================================
// 4. Get CashierMan By ID
// ==========================================
export const getCashierManById = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const { id } = req.params;

    const [row] = await db
        .select({
            id: cashierMen.id,
            restaurantId: cashierMen.restaurantId,
            branchId: cashierMen.branchId,
            name: cashierMen.name,
            userName: cashierMen.userName,
            phone: cashierMen.phone,
            image: cashierMen.image,
            roles: cashierMen.roles,
            report_perimission: cashierMen.report_perimission,
            status: cashierMen.status,
            createdAt: cashierMen.createdAt,
            updatedAt: cashierMen.updatedAt,
            branchName: branches.name,
            branchNameAr: branches.nameAr,
            branchNameFr: branches.nameFr,
            branchLat: branches.lat,
            branchLng: branches.lng,
        })
        .from(cashierMen)
        .leftJoin(branches, eq(cashierMen.branchId, branches.id))
        .where(and(eq(cashierMen.id, id), eq(cashierMen.restaurantId, restaurantId)))
        .limit(1);

    if (!row) {
        throw new NotFound("Cashier not found");
    }

    const result = {
        id: row.id,
        name: row.name,
        user_name: row.userName,
        phone: row.phone,
        image: row.image,
        roles: parseJsonArray(row.roles),
        report_perimission: parseJsonArray(row.report_perimission),
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
        message: "Cashier fetched successfully",
        data: result,
    });
};

// ==========================================
// 5. Update CashierMan
// ==========================================
export const updateCashierMan = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(cashierMen)
        .where(and(eq(cashierMen.id, id), eq(cashierMen.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) {
        throw new NotFound("Cashier not found");
    }

    const {
        name,
        user_name,
        phone,
        password,
        branch_id,
        branchId,
        image,
        roles,
        report_perimission,
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
            .select({ id: cashierMen.id })
            .from(cashierMen)
            .where(
                and(
                    eq(cashierMen.restaurantId, restaurantId),
                    eq(cashierMen.userName, user_name.trim()),
                    ne(cashierMen.id, id)
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
            .select({ id: cashierMen.id })
            .from(cashierMen)
            .where(
                and(
                    eq(cashierMen.restaurantId, restaurantId),
                    eq(cashierMen.phone, phone.trim()),
                    ne(cashierMen.id, id)
                )
            )
            .limit(1);

        if (existingPhone) {
            throw new BadRequest("Phone number is already in use in your restaurant");
        }
    }

    const updateData: Partial<typeof cashierMen.$inferInsert> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (user_name !== undefined) updateData.userName = user_name.trim();
    if (phone !== undefined) updateData.phone = phone.trim();
    if (targetBranchId !== undefined) updateData.branchId = targetBranchId;
    if (roles !== undefined) updateData.roles = parseJsonArray(roles);
    if (report_perimission !== undefined) updateData.report_perimission = parseJsonArray(report_perimission);
    if (status !== undefined) updateData.status = Boolean(status);

    // Hash password if provided
    if (password && typeof password === "string" && password.trim() !== "") {
        updateData.password = await bcrypt.hash(password, 10);
    }

    // Handle image update (deletes old image if new one provided)
    if (image !== undefined) {
        const updatedImage = await handleImageUpdate(req, existing.image, image, "cashiers");
        updateData.image = updatedImage;
    }

    if (Object.keys(updateData).length > 0) {
        await db
            .update(cashierMen)
            .set(updateData)
            .where(and(eq(cashierMen.id, id), eq(cashierMen.restaurantId, restaurantId)));
    }

    const [updated] = await db
        .select({
            id: cashierMen.id,
            restaurantId: cashierMen.restaurantId,
            branchId: cashierMen.branchId,
            name: cashierMen.name,
            userName: cashierMen.userName,
            phone: cashierMen.phone,
            image: cashierMen.image,
            roles: cashierMen.roles,
            report_perimission: cashierMen.report_perimission,
            status: cashierMen.status,
            createdAt: cashierMen.createdAt,
            updatedAt: cashierMen.updatedAt,
        })
        .from(cashierMen)
        .where(and(eq(cashierMen.id, id), eq(cashierMen.restaurantId, restaurantId)))
        .limit(1);

    return SuccessResponse(res, {
        message: "Cashier updated successfully",
        data: updated,
    });
};

// ==========================================
// 6. Delete CashierMan (Deletes image file first)
// ==========================================
export const deleteCashierMan = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(cashierMen)
        .where(and(eq(cashierMen.id, id), eq(cashierMen.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) {
        throw new NotFound("Cashier not found");
    }

    // Delete image file first before removing database record
    if (existing.image) {
        await deleteImage(existing.image);
    }

    await db
        .delete(cashierMen)
        .where(and(eq(cashierMen.id, id), eq(cashierMen.restaurantId, restaurantId)));

    return SuccessResponse(res, {
        message: "Cashier deleted successfully",
    });
};

// ==========================================
// 7. Toggle CashierMan Status
// ==========================================
export const toggleCashierManStatus = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(cashierMen)
        .where(and(eq(cashierMen.id, id), eq(cashierMen.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) {
        throw new NotFound("Cashier not found");
    }

    const newStatus = !existing.status;

    await db
        .update(cashierMen)
        .set({ status: newStatus })
        .where(and(eq(cashierMen.id, id), eq(cashierMen.restaurantId, restaurantId)));

    return SuccessResponse(res, {
        message: `Cashier status changed to ${newStatus ? "active" : "inactive"}`,
        data: { id, status: newStatus },
    });
};
