import { Request, Response } from "express";
import { db } from "../../../models/connection";
import { storeMen, stores } from "../../../models/schema";
import { eq, and, desc, count, or, like, ne } from "drizzle-orm";
import { SuccessResponse } from "../../../utils/response";
import { BadRequest, NotFound } from "../../../Errors";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";
import { saveBase64Image, handleImageUpdate, deleteImage } from "../../../utils/handleImages";
import { extractLang, getLocalizedName } from "../../../helpers/localization.helper";

// ==========================================
// 1. Create StoreMan
// ==========================================
export const createStoreMan = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const {
        name,
        phone,
        password,
        store_id,
        storeId,
        image,
        status,
    } = req.body;

    const targetStoreId = store_id || storeId;

    // 1. Validate Store belongs to the same restaurant
    const [targetStore] = await db
        .select()
        .from(stores)
        .where(and(eq(stores.id, targetStoreId), eq(stores.restaurantId, restaurantId)))
        .limit(1);

    if (!targetStore) {
        throw new BadRequest("Invalid store selected: store not found or does not belong to your restaurant");
    }

    // 2. Check phone uniqueness within the restaurant
    const [existingPhone] = await db
        .select({ id: storeMen.id })
        .from(storeMen)
        .where(
            and(
                eq(storeMen.phone, phone.trim()),
                eq(storeMen.restaurantId, restaurantId)
            )
        )
        .limit(1);

    if (existingPhone) {
        throw new BadRequest("Phone number is already in use by another store manager in your restaurant");
    }

    // 3. Check name uniqueness within the restaurant
    const [existingName] = await db
        .select({ id: storeMen.id })
        .from(storeMen)
        .where(and(eq(storeMen.name, name), eq(storeMen.restaurantId, restaurantId)))
        .limit(1);

    if (existingName) {
        throw new BadRequest("A store manager with this name already exists in your restaurant");
    }

    // 4. Hash password with bcrypt (same as login)
    const hashedPassword = await bcrypt.hash(password, 10);

    // 5. Handle image upload if provided
    let savedImageUrl: string | null = null;
    if (image) {
        if (typeof image === "string" && image.startsWith("http")) {
            savedImageUrl = image;
        } else {
            savedImageUrl = await saveBase64Image(image, req, "store_men");
        }
    }

    const id = uuidv4();
    await db.insert(storeMen).values({
        id,
        restaurantId,
        storeId: targetStoreId,
        name,
        phone,
        password: hashedPassword,
        image: savedImageUrl,
        status: status !== undefined ? Boolean(status) : true,
    });

    const [created] = await db
        .select({
            id: storeMen.id,
            restaurantId: storeMen.restaurantId,
            storeId: storeMen.storeId,
            name: storeMen.name,
            phone: storeMen.phone,
            image: storeMen.image,
            status: storeMen.status,
            createdAt: storeMen.createdAt,
            updatedAt: storeMen.updatedAt,
        })
        .from(storeMen)
        .where(eq(storeMen.id, id))
        .limit(1);

    return SuccessResponse(
        res,
        {
            message: "Store manager created successfully",
            data: created,
        },
        201
    );
};

// ==========================================
// 2. Get All StoreMen (Paginated & Filtered, Password omitted)
// ==========================================
export const getAllStoreMen = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const params = { ...req.query, ...req.body };
    const { search, status, store_id, storeId, all } = params;

    const page = Math.max(1, parseInt(params.page as string) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(params.limit as string) || 10));
    const offset = (page - 1) * limit;

    const conditions = [eq(storeMen.restaurantId, restaurantId)];

    const targetStoreId = store_id || storeId;
    if (targetStoreId) {
        conditions.push(eq(storeMen.storeId, targetStoreId));
    }

    if (status !== undefined && status !== "") {
        const boolStatus = status === true || status === "true" || status === 1 || status === "1";
        conditions.push(eq(storeMen.status, boolStatus));
    }

    if (search && typeof search === "string" && search.trim() !== "") {
        const term = `%${search.trim()}%`;
        conditions.push(
            or(
                like(storeMen.name, term),
                like(storeMen.phone, term)
            ) as any
        );
    }

    const isAll = all === "true" || all === true;

    const [totalCountResult, rawStoreMen] = await Promise.all([
        db
            .select({ count: count() })
            .from(storeMen)
            .where(and(...conditions)),
        isAll
            ? db
                  .select({
                      id: storeMen.id,
                      restaurantId: storeMen.restaurantId,
                      storeId: storeMen.storeId,
                      name: storeMen.name,
                      phone: storeMen.phone,
                      image: storeMen.image,
                      status: storeMen.status,
                      createdAt: storeMen.createdAt,
                      updatedAt: storeMen.updatedAt,
                      storeName: stores.name,
                      storeNameAr: stores.nameAr,
                      storeNameFr: stores.nameFr,
                  })
                  .from(storeMen)
                  .leftJoin(stores, eq(storeMen.storeId, stores.id))
                  .where(and(...conditions))
                  .orderBy(desc(storeMen.createdAt))
            : db
                  .select({
                      id: storeMen.id,
                      restaurantId: storeMen.restaurantId,
                      storeId: storeMen.storeId,
                      name: storeMen.name,
                      phone: storeMen.phone,
                      image: storeMen.image,
                      status: storeMen.status,
                      createdAt: storeMen.createdAt,
                      updatedAt: storeMen.updatedAt,
                      storeName: stores.name,
                      storeNameAr: stores.nameAr,
                      storeNameFr: stores.nameFr,
                  })
                  .from(storeMen)
                  .leftJoin(stores, eq(storeMen.storeId, stores.id))
                  .where(and(...conditions))
                  .orderBy(desc(storeMen.createdAt))
                  .limit(limit)
                  .offset(offset),
    ]);

    const totalItems = Number(totalCountResult[0]?.count || 0);
    const totalPages = isAll ? 1 : Math.ceil(totalItems / limit);

    const formattedList = rawStoreMen.map((item) => ({
        id: item.id,
        name: item.name,
        phone: item.phone,
        image: item.image,
        status: item.status,
        store: item.storeId
            ? {
                  id: item.storeId,
                  name: getLocalizedName(
                      {
                          name: item.storeName || "",
                          nameAr: item.storeNameAr,
                          nameFr: item.storeNameFr,
                      },
                      lang
                  ),
              }
            : null,
        createdAt: item.createdAt,
    }));

    return SuccessResponse(res, {
        message: "Store managers fetched successfully",
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
// 3. Get Stores List for Selection (id & name by lang)
// ==========================================
export const getStoresForStoreMan = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);

    const activeStores = await db
        .select({
            id: stores.id,
            name: stores.name,
            nameAr: stores.nameAr,
            nameFr: stores.nameFr,
        })
        .from(stores)
        .where(
            and(
                eq(stores.restaurantId, restaurantId),
                eq(stores.status, true)
            )
        )
        .orderBy(desc(stores.createdAt));

    const formatted = activeStores.map((s) => ({
        id: s.id,
        name: getLocalizedName(s, lang),
    }));

    return SuccessResponse(res, {
        message: "Stores for dropdown fetched successfully",
        data: formatted,
    });
};

// ==========================================
// 4. Get StoreMan By ID
// ==========================================
export const getStoreManById = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const lang = extractLang(req);
    const { id } = req.params;

    const [row] = await db
        .select({
            id: storeMen.id,
            restaurantId: storeMen.restaurantId,
            storeId: storeMen.storeId,
            name: storeMen.name,
            phone: storeMen.phone,
            image: storeMen.image,
            status: storeMen.status,
            createdAt: storeMen.createdAt,
            updatedAt: storeMen.updatedAt,
            storeName: stores.name,
            storeNameAr: stores.nameAr,
            storeNameFr: stores.nameFr,
        })
        .from(storeMen)
        .leftJoin(stores, eq(storeMen.storeId, stores.id))
        .where(and(eq(storeMen.id, id), eq(storeMen.restaurantId, restaurantId)))
        .limit(1);

    if (!row) {
        throw new NotFound("Store manager not found");
    }

    const result = {
        id: row.id,
        name: row.name,
        phone: row.phone,
        image: row.image,
        status: row.status,
        store: row.storeId
            ? {
                  id: row.storeId,
                  name: getLocalizedName(
                      {
                          name: row.storeName || "",
                          nameAr: row.storeNameAr,
                          nameFr: row.storeNameFr,
                      },
                      lang
                  ),
              }
            : null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };

    return SuccessResponse(res, {
        message: "Store manager fetched successfully",
        data: result,
    });
};

// ==========================================
// 5. Update StoreMan
// ==========================================
export const updateStoreMan = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(storeMen)
        .where(and(eq(storeMen.id, id), eq(storeMen.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) {
        throw new NotFound("Store manager not found");
    }

    const {
        name,
        phone,
        password,
        store_id,
        storeId,
        image,
        status,
    } = req.body;

    const targetStoreId = store_id || storeId;
    if (targetStoreId && targetStoreId !== existing.storeId) {
        const [targetStore] = await db
            .select()
            .from(stores)
            .where(and(eq(stores.id, targetStoreId), eq(stores.restaurantId, restaurantId)))
            .limit(1);

        if (!targetStore) {
            throw new BadRequest("Invalid store selected: store not found or does not belong to your restaurant");
        }
    }

    // Check phone uniqueness if phone is changing
    if (phone && phone.trim() !== existing.phone) {
        const [existingPhone] = await db
            .select({ id: storeMen.id })
            .from(storeMen)
            .where(
                and(
                    eq(storeMen.phone, phone.trim()),
                    eq(storeMen.restaurantId, restaurantId),
                    ne(storeMen.id, id)
                )
            )
            .limit(1);

        if (existingPhone) {
            throw new BadRequest("Phone number is already in use by another store manager in your restaurant");
        }
    }

    // Check name uniqueness if name is changing
    if (name && name !== existing.name) {
        const [existingName] = await db
            .select({ id: storeMen.id })
            .from(storeMen)
            .where(
                and(
                    eq(storeMen.name, name),
                    eq(storeMen.restaurantId, restaurantId),
                    ne(storeMen.id, id)
                )
            )
            .limit(1);

        if (existingName) {
            throw new BadRequest("A store manager with this name already exists in your restaurant");
        }
    }

    const updateData: Partial<typeof storeMen.$inferInsert> = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (targetStoreId !== undefined) updateData.storeId = targetStoreId;
    if (status !== undefined) updateData.status = Boolean(status);

    // Hash password if provided
    if (password && typeof password === "string" && password.trim() !== "") {
        updateData.password = await bcrypt.hash(password, 10);
    }

    // Handle image update (deletes old image if new one provided)
    if (image !== undefined) {
        const updatedImage = await handleImageUpdate(req, existing.image, image, "store_men");
        updateData.image = updatedImage;
    }

    if (Object.keys(updateData).length > 0) {
        await db
            .update(storeMen)
            .set(updateData)
            .where(and(eq(storeMen.id, id), eq(storeMen.restaurantId, restaurantId)));
    }

    const [updated] = await db
        .select({
            id: storeMen.id,
            restaurantId: storeMen.restaurantId,
            storeId: storeMen.storeId,
            name: storeMen.name,
            phone: storeMen.phone,
            image: storeMen.image,
            status: storeMen.status,
            createdAt: storeMen.createdAt,
            updatedAt: storeMen.updatedAt,
        })
        .from(storeMen)
        .where(and(eq(storeMen.id, id), eq(storeMen.restaurantId, restaurantId)))
        .limit(1);

    return SuccessResponse(res, {
        message: "Store manager updated successfully",
        data: updated,
    });
};

// ==========================================
// 6. Delete StoreMan (Deletes image file first)
// ==========================================
export const deleteStoreMan = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(storeMen)
        .where(and(eq(storeMen.id, id), eq(storeMen.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) {
        throw new NotFound("Store manager not found");
    }

    // Delete image file first before removing database record
    if (existing.image) {
        await deleteImage(existing.image);
    }

    await db
        .delete(storeMen)
        .where(and(eq(storeMen.id, id), eq(storeMen.restaurantId, restaurantId)));

    return SuccessResponse(res, {
        message: "Store manager deleted successfully",
    });
};

// ==========================================
// 7. Toggle StoreMan Status
// ==========================================
export const toggleStoreManStatus = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(storeMen)
        .where(and(eq(storeMen.id, id), eq(storeMen.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) {
        throw new NotFound("Store manager not found");
    }

    const newStatus = !existing.status;

    await db
        .update(storeMen)
        .set({ status: newStatus })
        .where(and(eq(storeMen.id, id), eq(storeMen.restaurantId, restaurantId)));

    return SuccessResponse(res, {
        message: `Store manager status changed to ${newStatus ? "active" : "inactive"}`,
        data: { id, status: newStatus },
    });
};
