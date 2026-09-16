"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toggleStoreManStatus = exports.deleteStoreMan = exports.updateStoreMan = exports.getStoreManById = exports.getStoresForStoreMan = exports.getAllStoreMen = exports.createStoreMan = void 0;
const connection_1 = require("../../../models/connection");
const schema_1 = require("../../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../../utils/response");
const Errors_1 = require("../../../Errors");
const uuid_1 = require("uuid");
const bcrypt_1 = __importDefault(require("bcrypt"));
const handleImages_1 = require("../../../utils/handleImages");
const localization_helper_1 = require("../../../helpers/localization.helper");
// ==========================================
// 1. Create StoreMan
// ==========================================
const createStoreMan = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { name, phone, password, store_id, storeId, image, status, } = req.body;
    const targetStoreId = store_id || storeId;
    // 1. Validate Store belongs to the same restaurant
    const [targetStore] = await connection_1.db
        .select()
        .from(schema_1.stores)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.stores.id, targetStoreId), (0, drizzle_orm_1.eq)(schema_1.stores.restaurantId, restaurantId)))
        .limit(1);
    if (!targetStore) {
        throw new Errors_1.BadRequest("Invalid store selected: store not found or does not belong to your restaurant");
    }
    // 2. Check phone uniqueness within the restaurant
    const [existingPhone] = await connection_1.db
        .select({ id: schema_1.storeMen.id })
        .from(schema_1.storeMen)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.storeMen.phone, phone.trim()), (0, drizzle_orm_1.eq)(schema_1.storeMen.restaurantId, restaurantId)))
        .limit(1);
    if (existingPhone) {
        throw new Errors_1.BadRequest("Phone number is already in use by another store manager in your restaurant");
    }
    // 3. Check name uniqueness within the restaurant
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const [existingName] = await connection_1.db
        .select({ id: schema_1.storeMen.id })
        .from(schema_1.storeMen)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.storeMen.name, trimmedName), (0, drizzle_orm_1.eq)(schema_1.storeMen.restaurantId, restaurantId)))
        .limit(1);
    if (existingName) {
        throw new Errors_1.BadRequest("A store manager with this name already exists in your restaurant");
    }
    // 4. Hash password with bcrypt (same as login)
    const hashedPassword = await bcrypt_1.default.hash(password, 10);
    // 5. Handle image upload if provided
    let savedImageUrl = null;
    if (image) {
        if (typeof image === "string" && image.startsWith("http")) {
            savedImageUrl = image;
        }
        else {
            savedImageUrl = await (0, handleImages_1.saveBase64Image)(image, req, "store_men");
        }
    }
    const id = (0, uuid_1.v4)();
    await connection_1.db.insert(schema_1.storeMen).values({
        id,
        restaurantId,
        storeId: targetStoreId,
        name: trimmedName,
        phone: trimmedPhone,
        password: hashedPassword,
        image: savedImageUrl,
        status: status !== undefined ? Boolean(status) : true,
    });
    const [created] = await connection_1.db
        .select({
        id: schema_1.storeMen.id,
        restaurantId: schema_1.storeMen.restaurantId,
        storeId: schema_1.storeMen.storeId,
        name: schema_1.storeMen.name,
        phone: schema_1.storeMen.phone,
        image: schema_1.storeMen.image,
        status: schema_1.storeMen.status,
        createdAt: schema_1.storeMen.createdAt,
        updatedAt: schema_1.storeMen.updatedAt,
    })
        .from(schema_1.storeMen)
        .where((0, drizzle_orm_1.eq)(schema_1.storeMen.id, id))
        .limit(1);
    return (0, response_1.SuccessResponse)(res, {
        message: "Store manager created successfully",
        data: created,
    }, 201);
};
exports.createStoreMan = createStoreMan;
// ==========================================
// 2. Get All StoreMen (Paginated & Filtered, Password omitted)
// ==========================================
const getAllStoreMen = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const params = { ...req.query, ...req.body };
    const { search, status, store_id, storeId, all } = params;
    const page = Math.max(1, parseInt(params.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(params.limit) || 10));
    const offset = (page - 1) * limit;
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.storeMen.restaurantId, restaurantId)];
    const targetStoreId = store_id || storeId;
    if (targetStoreId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.storeMen.storeId, targetStoreId));
    }
    if (status !== undefined && status !== "") {
        const boolStatus = status === true || status === "true" || status === 1 || status === "1";
        conditions.push((0, drizzle_orm_1.eq)(schema_1.storeMen.status, boolStatus));
    }
    if (search && typeof search === "string" && search.trim() !== "") {
        const term = `%${search.trim()}%`;
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(schema_1.storeMen.name, term), (0, drizzle_orm_1.like)(schema_1.storeMen.phone, term)));
    }
    const isAll = all === "true" || all === true;
    const [totalCountResult, rawStoreMen] = await Promise.all([
        connection_1.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema_1.storeMen)
            .where((0, drizzle_orm_1.and)(...conditions)),
        isAll
            ? connection_1.db
                .select({
                id: schema_1.storeMen.id,
                restaurantId: schema_1.storeMen.restaurantId,
                storeId: schema_1.storeMen.storeId,
                name: schema_1.storeMen.name,
                phone: schema_1.storeMen.phone,
                image: schema_1.storeMen.image,
                status: schema_1.storeMen.status,
                createdAt: schema_1.storeMen.createdAt,
                updatedAt: schema_1.storeMen.updatedAt,
                storeName: schema_1.stores.name,
                storeNameAr: schema_1.stores.nameAr,
                storeNameFr: schema_1.stores.nameFr,
            })
                .from(schema_1.storeMen)
                .leftJoin(schema_1.stores, (0, drizzle_orm_1.eq)(schema_1.storeMen.storeId, schema_1.stores.id))
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.storeMen.createdAt))
            : connection_1.db
                .select({
                id: schema_1.storeMen.id,
                restaurantId: schema_1.storeMen.restaurantId,
                storeId: schema_1.storeMen.storeId,
                name: schema_1.storeMen.name,
                phone: schema_1.storeMen.phone,
                image: schema_1.storeMen.image,
                status: schema_1.storeMen.status,
                createdAt: schema_1.storeMen.createdAt,
                updatedAt: schema_1.storeMen.updatedAt,
                storeName: schema_1.stores.name,
                storeNameAr: schema_1.stores.nameAr,
                storeNameFr: schema_1.stores.nameFr,
            })
                .from(schema_1.storeMen)
                .leftJoin(schema_1.stores, (0, drizzle_orm_1.eq)(schema_1.storeMen.storeId, schema_1.stores.id))
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.storeMen.createdAt))
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
                name: (0, localization_helper_1.getLocalizedName)({
                    name: item.storeName || "",
                    nameAr: item.storeNameAr,
                    nameFr: item.storeNameFr,
                }, lang),
            }
            : null,
        createdAt: item.createdAt,
    }));
    return (0, response_1.SuccessResponse)(res, {
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
exports.getAllStoreMen = getAllStoreMen;
// ==========================================
// 3. Get Stores List for Selection (id & name by lang)
// ==========================================
const getStoresForStoreMan = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const activeStores = await connection_1.db
        .select({
        id: schema_1.stores.id,
        name: schema_1.stores.name,
        nameAr: schema_1.stores.nameAr,
        nameFr: schema_1.stores.nameFr,
    })
        .from(schema_1.stores)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.stores.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.stores.status, true)))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.stores.createdAt));
    const formatted = activeStores.map((s) => ({
        id: s.id,
        name: (0, localization_helper_1.getLocalizedName)(s, lang),
    }));
    return (0, response_1.SuccessResponse)(res, {
        message: "Stores for dropdown fetched successfully",
        data: formatted,
    });
};
exports.getStoresForStoreMan = getStoresForStoreMan;
// ==========================================
// 4. Get StoreMan By ID
// ==========================================
const getStoreManById = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const { id } = req.params;
    const [row] = await connection_1.db
        .select({
        id: schema_1.storeMen.id,
        restaurantId: schema_1.storeMen.restaurantId,
        storeId: schema_1.storeMen.storeId,
        name: schema_1.storeMen.name,
        phone: schema_1.storeMen.phone,
        image: schema_1.storeMen.image,
        status: schema_1.storeMen.status,
        createdAt: schema_1.storeMen.createdAt,
        updatedAt: schema_1.storeMen.updatedAt,
        storeName: schema_1.stores.name,
        storeNameAr: schema_1.stores.nameAr,
        storeNameFr: schema_1.stores.nameFr,
    })
        .from(schema_1.storeMen)
        .leftJoin(schema_1.stores, (0, drizzle_orm_1.eq)(schema_1.storeMen.storeId, schema_1.stores.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.storeMen.id, id), (0, drizzle_orm_1.eq)(schema_1.storeMen.restaurantId, restaurantId)))
        .limit(1);
    if (!row) {
        throw new Errors_1.NotFound("Store manager not found");
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
                name: (0, localization_helper_1.getLocalizedName)({
                    name: row.storeName || "",
                    nameAr: row.storeNameAr,
                    nameFr: row.storeNameFr,
                }, lang),
            }
            : null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
    return (0, response_1.SuccessResponse)(res, {
        message: "Store manager fetched successfully",
        data: result,
    });
};
exports.getStoreManById = getStoreManById;
// ==========================================
// 5. Update StoreMan
// ==========================================
const updateStoreMan = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.storeMen)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.storeMen.id, id), (0, drizzle_orm_1.eq)(schema_1.storeMen.restaurantId, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Store manager not found");
    }
    const { name, phone, password, store_id, storeId, image, status, } = req.body;
    const targetStoreId = store_id || storeId;
    if (targetStoreId && targetStoreId !== existing.storeId) {
        const [targetStore] = await connection_1.db
            .select()
            .from(schema_1.stores)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.stores.id, targetStoreId), (0, drizzle_orm_1.eq)(schema_1.stores.restaurantId, restaurantId)))
            .limit(1);
        if (!targetStore) {
            throw new Errors_1.BadRequest("Invalid store selected: store not found or does not belong to your restaurant");
        }
    }
    // Check phone uniqueness if phone is changing
    if (phone && phone.trim() !== existing.phone) {
        const [existingPhone] = await connection_1.db
            .select({ id: schema_1.storeMen.id })
            .from(schema_1.storeMen)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.storeMen.phone, phone.trim()), (0, drizzle_orm_1.eq)(schema_1.storeMen.restaurantId, restaurantId), (0, drizzle_orm_1.ne)(schema_1.storeMen.id, id)))
            .limit(1);
        if (existingPhone) {
            throw new Errors_1.BadRequest("Phone number is already in use by another store manager in your restaurant");
        }
    }
    // Check name uniqueness if name is changing
    const trimmedUpdateName = name ? name.trim() : undefined;
    const trimmedUpdatePhone = phone ? phone.trim() : undefined;
    if (trimmedUpdateName && trimmedUpdateName !== existing.name) {
        const [existingName] = await connection_1.db
            .select({ id: schema_1.storeMen.id })
            .from(schema_1.storeMen)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.storeMen.name, trimmedUpdateName), (0, drizzle_orm_1.eq)(schema_1.storeMen.restaurantId, restaurantId), (0, drizzle_orm_1.ne)(schema_1.storeMen.id, id)))
            .limit(1);
        if (existingName) {
            throw new Errors_1.BadRequest("A store manager with this name already exists in your restaurant");
        }
    }
    const updateData = {};
    if (trimmedUpdateName !== undefined)
        updateData.name = trimmedUpdateName;
    if (trimmedUpdatePhone !== undefined)
        updateData.phone = trimmedUpdatePhone;
    if (targetStoreId !== undefined)
        updateData.storeId = targetStoreId;
    if (status !== undefined)
        updateData.status = Boolean(status);
    // Hash password if provided
    if (password && typeof password === "string" && password.trim() !== "") {
        updateData.password = await bcrypt_1.default.hash(password, 10);
    }
    // Handle image update (deletes old image if new one provided)
    if (image !== undefined) {
        const updatedImage = await (0, handleImages_1.handleImageUpdate)(req, existing.image, image, "store_men");
        updateData.image = updatedImage;
    }
    if (Object.keys(updateData).length > 0) {
        await connection_1.db
            .update(schema_1.storeMen)
            .set(updateData)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.storeMen.id, id), (0, drizzle_orm_1.eq)(schema_1.storeMen.restaurantId, restaurantId)));
    }
    const [updated] = await connection_1.db
        .select({
        id: schema_1.storeMen.id,
        restaurantId: schema_1.storeMen.restaurantId,
        storeId: schema_1.storeMen.storeId,
        name: schema_1.storeMen.name,
        phone: schema_1.storeMen.phone,
        image: schema_1.storeMen.image,
        status: schema_1.storeMen.status,
        createdAt: schema_1.storeMen.createdAt,
        updatedAt: schema_1.storeMen.updatedAt,
    })
        .from(schema_1.storeMen)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.storeMen.id, id), (0, drizzle_orm_1.eq)(schema_1.storeMen.restaurantId, restaurantId)))
        .limit(1);
    return (0, response_1.SuccessResponse)(res, {
        message: "Store manager updated successfully",
        data: updated,
    });
};
exports.updateStoreMan = updateStoreMan;
// ==========================================
// 6. Delete StoreMan (Deletes image file first)
// ==========================================
const deleteStoreMan = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.storeMen)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.storeMen.id, id), (0, drizzle_orm_1.eq)(schema_1.storeMen.restaurantId, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Store manager not found");
    }
    // Delete image file first before removing database record
    if (existing.image) {
        await (0, handleImages_1.deleteImage)(existing.image);
    }
    await connection_1.db
        .delete(schema_1.storeMen)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.storeMen.id, id), (0, drizzle_orm_1.eq)(schema_1.storeMen.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: "Store manager deleted successfully",
    });
};
exports.deleteStoreMan = deleteStoreMan;
// ==========================================
// 7. Toggle StoreMan Status
// ==========================================
const toggleStoreManStatus = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.storeMen)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.storeMen.id, id), (0, drizzle_orm_1.eq)(schema_1.storeMen.restaurantId, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Store manager not found");
    }
    const newStatus = !existing.status;
    await connection_1.db
        .update(schema_1.storeMen)
        .set({ status: newStatus })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.storeMen.id, id), (0, drizzle_orm_1.eq)(schema_1.storeMen.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: `Store manager status changed to ${newStatus ? "active" : "inactive"}`,
        data: { id, status: newStatus },
    });
};
exports.toggleStoreManStatus = toggleStoreManStatus;
