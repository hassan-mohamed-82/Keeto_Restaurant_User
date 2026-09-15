import { Request, Response } from "express";
import { db } from "../../../models/connection";
import { hallTables, halls, branches } from "../../../models/schema";
import { eq, and, desc, count, or, like } from "drizzle-orm";
import { SuccessResponse } from "../../../utils/response";
import { BadRequest, NotFound } from "../../../Errors";
import { v4 as uuidv4 } from "uuid";
import QRCode from "qrcode";
import { saveBase64Image, deleteImage } from "../../../utils/handleImages";
import { extractLang, getLocalizedName } from "../../../helpers/localization.helper";

// ==========================================
// 1. Create HallTable (Auto-generates QR code)
// ==========================================
export const createHallTable = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const {
        tbl_number,
        tblNumber,
        capacity,
        hall_id,
        hallId,
        status,
    } = req.body;

    const targetHallId = hall_id || hallId;
    const targetTblNumber = String(tbl_number || tblNumber).trim();

    // 1. Validate Hall belongs to restaurant
    const [targetHall] = await db
        .select()
        .from(halls)
        .where(and(eq(halls.id, targetHallId), eq(halls.restaurantId, restaurantId)))
        .limit(1);

    if (!targetHall) {
        throw new BadRequest("Invalid hall selected: hall not found or does not belong to your restaurant");
    }

    // 2. Generate UUID for Table
    const id = uuidv4();

    // 3. Generate QR code automatic: value = "hallTable/" + id
    const qrValue = `hallTable/${id}`;
    let savedQrUrl: string;
    try {
        const qrBase64 = await QRCode.toDataURL(qrValue);
        savedQrUrl = await saveBase64Image(qrBase64, req, "hall_tables");
    } catch (err: any) {
        console.error("❌ Failed to generate QR Code for table:", err);
        throw new BadRequest(`Failed to generate QR Code: ${err.message}`);
    }

    // 4. Insert table with occupied = false automatically
    await db.insert(hallTables).values({
        id,
        restaurantId,
        hallId: targetHallId,
        tblNumber: targetTblNumber,
        capacity: capacity !== undefined ? Number(capacity) : 1,
        qr: savedQrUrl,
        occupied: false,
        status: status !== undefined ? Boolean(status) : true,
    });

    const [created] = await db
        .select()
        .from(hallTables)
        .where(eq(hallTables.id, id))
        .limit(1);

    return SuccessResponse(
        res,
        {
            message: "Hall table created successfully",
            data: created,
        },
        201
    );
};

// ==========================================
// 2. Get All HallTables (Paginated & Filtered)
// ==========================================
export const getAllHallTables = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const params = { ...req.query, ...req.body };
    const { search, status, occupied, hall_id, hallId, all } = params;

    const page = Math.max(1, parseInt(params.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(params.limit as string) || 10));
    const offset = (page - 1) * limit;

    const conditions = [eq(hallTables.restaurantId, restaurantId)];

    const targetHallId = hall_id || hallId;
    if (targetHallId) {
        conditions.push(eq(hallTables.hallId, targetHallId));
    }

    if (status !== undefined && status !== "") {
        const boolStatus = status === true || status === "true" || status === 1 || status === "1";
        conditions.push(eq(hallTables.status, boolStatus));
    }

    if (occupied !== undefined && occupied !== "") {
        const boolOccupied = occupied === true || occupied === "true" || occupied === 1 || occupied === "1";
        conditions.push(eq(hallTables.occupied, boolOccupied));
    }

    if (search && typeof search === "string" && search.trim() !== "") {
        const term = `%${search.trim()}%`;
        conditions.push(like(hallTables.tblNumber, term));
    }

    const isAll = all === "true" || all === true;

    const [totalCountResult, rawTables] = await Promise.all([
        db
            .select({ count: count() })
            .from(hallTables)
            .where(and(...conditions)),
        isAll
            ? db
                  .select({
                      id: hallTables.id,
                      restaurantId: hallTables.restaurantId,
                      hallId: hallTables.hallId,
                      tblNumber: hallTables.tblNumber,
                      capacity: hallTables.capacity,
                      qr: hallTables.qr,
                      occupied: hallTables.occupied,
                      status: hallTables.status,
                      createdAt: hallTables.createdAt,
                      updatedAt: hallTables.updatedAt,
                      hallName: halls.name,
                      hallNameAr: halls.nameAr,
                      hallNameFr: halls.nameFr,
                      hallLat: halls.lat,
                      hallLng: halls.lng,
                      branchId: halls.branchId,
                  })
                  .from(hallTables)
                  .leftJoin(halls, eq(hallTables.hallId, halls.id))
                  .where(and(...conditions))
                  .orderBy(desc(hallTables.createdAt))
            : db
                  .select({
                      id: hallTables.id,
                      restaurantId: hallTables.restaurantId,
                      hallId: hallTables.hallId,
                      tblNumber: hallTables.tblNumber,
                      capacity: hallTables.capacity,
                      qr: hallTables.qr,
                      occupied: hallTables.occupied,
                      status: hallTables.status,
                      createdAt: hallTables.createdAt,
                      updatedAt: hallTables.updatedAt,
                      hallName: halls.name,
                      hallNameAr: halls.nameAr,
                      hallNameFr: halls.nameFr,
                      hallLat: halls.lat,
                      hallLng: halls.lng,
                      branchId: halls.branchId,
                  })
                  .from(hallTables)
                  .leftJoin(halls, eq(hallTables.hallId, halls.id))
                  .where(and(...conditions))
                  .orderBy(desc(hallTables.createdAt))
                  .limit(limit)
                  .offset(offset),
    ]);

    const totalItems = Number(totalCountResult[0]?.count || 0);
    const totalPages = isAll ? 1 : Math.ceil(totalItems / limit);

    const formattedList = rawTables.map((item) => ({
        id: item.id,
        tbl_number: item.tblNumber,
        capacity: item.capacity,
        qr: item.qr,
        occupied: item.occupied,
        status: item.status,
        hall: item.hallId
            ? {
                  id: item.hallId,
                  name: getLocalizedName(
                      {
                          name: item.hallName || "",
                          nameAr: item.hallNameAr,
                          nameFr: item.hallNameFr,
                      },
                      lang
                  ),
                  branch_id: item.branchId,
              }
            : null,
        map: item.hallLat && item.hallLng ? `https://maps.google.com/?q=${item.hallLat},${item.hallLng}` : null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
    }));

    return SuccessResponse(res, {
        message: "Hall tables fetched successfully",
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
// 3. Get Halls for Selection (id & name by lang)
// ==========================================
export const getHallsForTable = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);

    const activeHalls = await db
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
                eq(halls.status, true)
            )
        )
        .orderBy(desc(halls.createdAt));

    const formatted = activeHalls.map((h) => ({
        id: h.id,
        name: getLocalizedName(h, lang),
    }));

    return SuccessResponse(res, {
        message: "Halls for dropdown fetched successfully",
        data: formatted,
    });
};

// ==========================================
// 4. Get HallTable By ID
// ==========================================
export const getHallTableById = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const { id } = req.params;

    const [row] = await db
        .select({
            id: hallTables.id,
            restaurantId: hallTables.restaurantId,
            hallId: hallTables.hallId,
            tblNumber: hallTables.tblNumber,
            capacity: hallTables.capacity,
            qr: hallTables.qr,
            occupied: hallTables.occupied,
            status: hallTables.status,
            createdAt: hallTables.createdAt,
            updatedAt: hallTables.updatedAt,
            hallName: halls.name,
            hallNameAr: halls.nameAr,
            hallNameFr: halls.nameFr,
            hallLat: halls.lat,
            hallLng: halls.lng,
            branchId: halls.branchId,
        })
        .from(hallTables)
        .leftJoin(halls, eq(hallTables.hallId, halls.id))
        .where(and(eq(hallTables.id, id), eq(hallTables.restaurantId, restaurantId)))
        .limit(1);

    if (!row) {
        throw new NotFound("Hall table not found");
    }

    const result = {
        id: row.id,
        tbl_number: row.tblNumber,
        capacity: row.capacity,
        qr: row.qr,
        occupied: row.occupied,
        status: row.status,
        hall: row.hallId
            ? {
                  id: row.hallId,
                  name: getLocalizedName(
                      {
                          name: row.hallName || "",
                          nameAr: row.hallNameAr,
                          nameFr: row.hallNameFr,
                      },
                      lang
                  ),
                  branch_id: row.branchId,
              }
            : null,
        map: row.hallLat && row.hallLng ? `https://maps.google.com/?q=${row.hallLat},${row.hallLng}` : null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };

    return SuccessResponse(res, {
        message: "Hall table fetched successfully",
        data: result,
    });
};

// ==========================================
// 5. Update HallTable (QR & occupied NOT updated)
// ==========================================
export const updateHallTable = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(hallTables)
        .where(and(eq(hallTables.id, id), eq(hallTables.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) {
        throw new NotFound("Hall table not found");
    }

    const {
        tbl_number,
        tblNumber,
        capacity,
        hall_id,
        hallId,
        status,
    } = req.body;

    const targetHallId = hall_id || hallId;
    if (targetHallId && targetHallId !== existing.hallId) {
        const [targetHall] = await db
            .select()
            .from(halls)
            .where(and(eq(halls.id, targetHallId), eq(halls.restaurantId, restaurantId)))
            .limit(1);

        if (!targetHall) {
            throw new BadRequest("Invalid hall selected: hall not found or does not belong to your restaurant");
        }
    }

    const updateData: Partial<typeof hallTables.$inferInsert> = {};
    const finalTblNumber = tbl_number || tblNumber;
    if (finalTblNumber !== undefined) updateData.tblNumber = String(finalTblNumber).trim();
    if (capacity !== undefined) updateData.capacity = Number(capacity);
    if (targetHallId !== undefined) updateData.hallId = targetHallId;
    if (status !== undefined) updateData.status = Boolean(status);

    // Note: 'qr' and 'occupied' are explicitly NOT updated per requirement

    if (Object.keys(updateData).length > 0) {
        await db
            .update(hallTables)
            .set(updateData)
            .where(and(eq(hallTables.id, id), eq(hallTables.restaurantId, restaurantId)));
    }

    const [updated] = await db
        .select()
        .from(hallTables)
        .where(and(eq(hallTables.id, id), eq(hallTables.restaurantId, restaurantId)))
        .limit(1);

    return SuccessResponse(res, {
        message: "Hall table updated successfully",
        data: updated,
    });
};

// ==========================================
// 6. Delete HallTable (Deletes QR image file first)
// ==========================================
export const deleteHallTable = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(hallTables)
        .where(and(eq(hallTables.id, id), eq(hallTables.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) {
        throw new NotFound("Hall table not found");
    }

    // Delete QR code image file first before removing database record
    if (existing.qr) {
        await deleteImage(existing.qr);
    }

    await db
        .delete(hallTables)
        .where(and(eq(hallTables.id, id), eq(hallTables.restaurantId, restaurantId)));

    return SuccessResponse(res, {
        message: "Hall table deleted successfully",
    });
};

// ==========================================
// 7. Toggle HallTable Status
// ==========================================
export const toggleHallTableStatus = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(hallTables)
        .where(and(eq(hallTables.id, id), eq(hallTables.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) {
        throw new NotFound("Hall table not found");
    }

    const newStatus = !existing.status;

    await db
        .update(hallTables)
        .set({ status: newStatus })
        .where(and(eq(hallTables.id, id), eq(hallTables.restaurantId, restaurantId)));

    return SuccessResponse(res, {
        message: `Hall table status changed to ${newStatus ? "active" : "inactive"}`,
        data: { id, status: newStatus },
    });
};

// ==========================================
// 8. Toggle HallTable Occupied Status
// ==========================================
export const toggleHallTableOccupied = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(hallTables)
        .where(and(eq(hallTables.id, id), eq(hallTables.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) {
        throw new NotFound("Hall table not found");
    }

    const newOccupied = !existing.occupied;

    await db
        .update(hallTables)
        .set({ occupied: newOccupied })
        .where(and(eq(hallTables.id, id), eq(hallTables.restaurantId, restaurantId)));

    return SuccessResponse(res, {
        message: `Hall table occupied status changed to ${newOccupied ? "occupied" : "vacant"}`,
        data: { id, occupied: newOccupied },
    });
};
