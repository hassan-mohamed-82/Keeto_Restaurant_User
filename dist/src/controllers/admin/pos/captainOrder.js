"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toggleCaptainOrderStatus = exports.deleteCaptainOrder = exports.updateCaptainOrder = exports.getCaptainOrderById = exports.getBranchesForCaptain = exports.getAllCaptainOrders = exports.createCaptainOrder = void 0;
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
// 1. Create CaptainOrder
// ==========================================
const createCaptainOrder = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { name, user_name, phone, password, branch_id, branchId, image, status, } = req.body;
    const targetBranchId = branch_id || branchId;
    // 1. Validate Branch belongs to restaurant
    const [targetBranch] = await connection_1.db
        .select()
        .from(schema_1.branches)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.id, targetBranchId), (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId)))
        .limit(1);
    if (!targetBranch) {
        throw new Errors_1.BadRequest("Invalid branch selected: branch not found or does not belong to your restaurant");
    }
    // 2. Check user_name uniqueness
    const [existingUserName] = await connection_1.db
        .select({ id: schema_1.captainOrders.id })
        .from(schema_1.captainOrders)
        .where((0, drizzle_orm_1.eq)(schema_1.captainOrders.userName, user_name.trim()))
        .limit(1);
    if (existingUserName) {
        throw new Errors_1.BadRequest("User name is already in use by another captain");
    }
    // 3. Check phone uniqueness
    const [existingPhone] = await connection_1.db
        .select({ id: schema_1.captainOrders.id })
        .from(schema_1.captainOrders)
        .where((0, drizzle_orm_1.eq)(schema_1.captainOrders.phone, phone.trim()))
        .limit(1);
    if (existingPhone) {
        throw new Errors_1.BadRequest("Phone number is already in use by another captain");
    }
    // 4. Hash password with bcrypt
    const hashedPassword = await bcrypt_1.default.hash(password, 10);
    // 5. Handle image if provided (not required)
    let savedImageUrl = null;
    if (image) {
        if (typeof image === "string" && image.startsWith("http")) {
            savedImageUrl = image;
        }
        else {
            savedImageUrl = await (0, handleImages_1.saveBase64Image)(image, req, "captains");
        }
    }
    const id = (0, uuid_1.v4)();
    await connection_1.db.insert(schema_1.captainOrders).values({
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
    const [created] = await connection_1.db
        .select({
        id: schema_1.captainOrders.id,
        restaurantId: schema_1.captainOrders.restaurantId,
        branchId: schema_1.captainOrders.branchId,
        name: schema_1.captainOrders.name,
        userName: schema_1.captainOrders.userName,
        phone: schema_1.captainOrders.phone,
        image: schema_1.captainOrders.image,
        status: schema_1.captainOrders.status,
        createdAt: schema_1.captainOrders.createdAt,
        updatedAt: schema_1.captainOrders.updatedAt,
    })
        .from(schema_1.captainOrders)
        .where((0, drizzle_orm_1.eq)(schema_1.captainOrders.id, id))
        .limit(1);
    return (0, response_1.SuccessResponse)(res, {
        message: "Captain order created successfully",
        data: created,
    }, 201);
};
exports.createCaptainOrder = createCaptainOrder;
// ==========================================
// 2. Get All CaptainOrders (Paginated & Filtered)
// ==========================================
const getAllCaptainOrders = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const params = { ...req.query, ...req.body };
    const { search, status, branch_id, branchId, all } = params;
    const page = Math.max(1, parseInt(params.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(params.limit) || 10));
    const offset = (page - 1) * limit;
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.captainOrders.restaurantId, restaurantId)];
    const targetBranchId = branch_id || branchId;
    if (targetBranchId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.captainOrders.branchId, targetBranchId));
    }
    if (status !== undefined && status !== "") {
        const boolStatus = status === true || status === "true" || status === 1 || status === "1";
        conditions.push((0, drizzle_orm_1.eq)(schema_1.captainOrders.status, boolStatus));
    }
    if (search && typeof search === "string" && search.trim() !== "") {
        const term = `%${search.trim()}%`;
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(schema_1.captainOrders.name, term), (0, drizzle_orm_1.like)(schema_1.captainOrders.userName, term), (0, drizzle_orm_1.like)(schema_1.captainOrders.phone, term)));
    }
    const isAll = all === "true" || all === true;
    const [totalCountResult, rawCaptains] = await Promise.all([
        connection_1.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema_1.captainOrders)
            .where((0, drizzle_orm_1.and)(...conditions)),
        isAll
            ? connection_1.db
                .select({
                id: schema_1.captainOrders.id,
                restaurantId: schema_1.captainOrders.restaurantId,
                branchId: schema_1.captainOrders.branchId,
                name: schema_1.captainOrders.name,
                userName: schema_1.captainOrders.userName,
                phone: schema_1.captainOrders.phone,
                image: schema_1.captainOrders.image,
                status: schema_1.captainOrders.status,
                createdAt: schema_1.captainOrders.createdAt,
                updatedAt: schema_1.captainOrders.updatedAt,
                branchName: schema_1.branches.name,
                branchNameAr: schema_1.branches.nameAr,
                branchNameFr: schema_1.branches.nameFr,
                branchLat: schema_1.branches.lat,
                branchLng: schema_1.branches.lng,
            })
                .from(schema_1.captainOrders)
                .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.captainOrders.branchId, schema_1.branches.id))
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.captainOrders.createdAt))
            : connection_1.db
                .select({
                id: schema_1.captainOrders.id,
                restaurantId: schema_1.captainOrders.restaurantId,
                branchId: schema_1.captainOrders.branchId,
                name: schema_1.captainOrders.name,
                userName: schema_1.captainOrders.userName,
                phone: schema_1.captainOrders.phone,
                image: schema_1.captainOrders.image,
                status: schema_1.captainOrders.status,
                createdAt: schema_1.captainOrders.createdAt,
                updatedAt: schema_1.captainOrders.updatedAt,
                branchName: schema_1.branches.name,
                branchNameAr: schema_1.branches.nameAr,
                branchNameFr: schema_1.branches.nameFr,
                branchLat: schema_1.branches.lat,
                branchLng: schema_1.branches.lng,
            })
                .from(schema_1.captainOrders)
                .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.captainOrders.branchId, schema_1.branches.id))
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.captainOrders.createdAt))
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
                name: (0, localization_helper_1.getLocalizedName)({
                    name: item.branchName || "",
                    nameAr: item.branchNameAr,
                    nameFr: item.branchNameFr,
                }, lang),
            }
            : null,
        map: item.branchLat && item.branchLng ? `https://maps.google.com/?q=${item.branchLat},${item.branchLng}` : null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
    }));
    return (0, response_1.SuccessResponse)(res, {
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
exports.getAllCaptainOrders = getAllCaptainOrders;
// ==========================================
// 3. Get Branches for Selection (id & name by lang)
// ==========================================
const getBranchesForCaptain = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const activeBranches = await connection_1.db
        .select({
        id: schema_1.branches.id,
        name: schema_1.branches.name,
        nameAr: schema_1.branches.nameAr,
        nameFr: schema_1.branches.nameFr,
    })
        .from(schema_1.branches)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.branches.status, "active")))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.branches.createdAt));
    const formatted = activeBranches.map((b) => ({
        id: b.id,
        name: (0, localization_helper_1.getLocalizedName)(b, lang),
    }));
    return (0, response_1.SuccessResponse)(res, {
        message: "Branches for dropdown fetched successfully",
        data: formatted,
    });
};
exports.getBranchesForCaptain = getBranchesForCaptain;
// ==========================================
// 4. Get CaptainOrder By ID
// ==========================================
const getCaptainOrderById = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const { id } = req.params;
    const [row] = await connection_1.db
        .select({
        id: schema_1.captainOrders.id,
        restaurantId: schema_1.captainOrders.restaurantId,
        branchId: schema_1.captainOrders.branchId,
        name: schema_1.captainOrders.name,
        userName: schema_1.captainOrders.userName,
        phone: schema_1.captainOrders.phone,
        image: schema_1.captainOrders.image,
        status: schema_1.captainOrders.status,
        createdAt: schema_1.captainOrders.createdAt,
        updatedAt: schema_1.captainOrders.updatedAt,
        branchName: schema_1.branches.name,
        branchNameAr: schema_1.branches.nameAr,
        branchNameFr: schema_1.branches.nameFr,
        branchLat: schema_1.branches.lat,
        branchLng: schema_1.branches.lng,
    })
        .from(schema_1.captainOrders)
        .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.captainOrders.branchId, schema_1.branches.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.captainOrders.id, id), (0, drizzle_orm_1.eq)(schema_1.captainOrders.restaurantId, restaurantId)))
        .limit(1);
    if (!row) {
        throw new Errors_1.NotFound("Captain order not found");
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
                name: (0, localization_helper_1.getLocalizedName)({
                    name: row.branchName || "",
                    nameAr: row.branchNameAr,
                    nameFr: row.branchNameFr,
                }, lang),
            }
            : null,
        map: row.branchLat && row.branchLng ? `https://maps.google.com/?q=${row.branchLat},${row.branchLng}` : null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
    return (0, response_1.SuccessResponse)(res, {
        message: "Captain order fetched successfully",
        data: result,
    });
};
exports.getCaptainOrderById = getCaptainOrderById;
// ==========================================
// 5. Update CaptainOrder
// ==========================================
const updateCaptainOrder = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.captainOrders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.captainOrders.id, id), (0, drizzle_orm_1.eq)(schema_1.captainOrders.restaurantId, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Captain order not found");
    }
    const { name, user_name, phone, password, branch_id, branchId, image, status, } = req.body;
    const targetBranchId = branch_id || branchId;
    if (targetBranchId && targetBranchId !== existing.branchId) {
        const [targetBranch] = await connection_1.db
            .select()
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.id, targetBranchId), (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId)))
            .limit(1);
        if (!targetBranch) {
            throw new Errors_1.BadRequest("Invalid branch selected: branch not found or does not belong to your restaurant");
        }
    }
    // Check user_name uniqueness if changed
    if (user_name && user_name.trim() !== existing.userName) {
        const [existingUserName] = await connection_1.db
            .select({ id: schema_1.captainOrders.id })
            .from(schema_1.captainOrders)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.captainOrders.userName, user_name.trim()), (0, drizzle_orm_1.ne)(schema_1.captainOrders.id, id)))
            .limit(1);
        if (existingUserName) {
            throw new Errors_1.BadRequest("User name is already in use by another captain");
        }
    }
    // Check phone uniqueness if changed
    if (phone && phone.trim() !== existing.phone) {
        const [existingPhone] = await connection_1.db
            .select({ id: schema_1.captainOrders.id })
            .from(schema_1.captainOrders)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.captainOrders.phone, phone.trim()), (0, drizzle_orm_1.ne)(schema_1.captainOrders.id, id)))
            .limit(1);
        if (existingPhone) {
            throw new Errors_1.BadRequest("Phone number is already in use by another captain");
        }
    }
    const updateData = {};
    if (name !== undefined)
        updateData.name = name.trim();
    if (user_name !== undefined)
        updateData.userName = user_name.trim();
    if (phone !== undefined)
        updateData.phone = phone.trim();
    if (targetBranchId !== undefined)
        updateData.branchId = targetBranchId;
    if (status !== undefined)
        updateData.status = Boolean(status);
    // Hash password if provided
    if (password && typeof password === "string" && password.trim() !== "") {
        updateData.password = await bcrypt_1.default.hash(password, 10);
    }
    // Handle image update (deletes old image if new one provided)
    if (image !== undefined) {
        const updatedImage = await (0, handleImages_1.handleImageUpdate)(req, existing.image, image, "captains");
        updateData.image = updatedImage;
    }
    if (Object.keys(updateData).length > 0) {
        await connection_1.db
            .update(schema_1.captainOrders)
            .set(updateData)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.captainOrders.id, id), (0, drizzle_orm_1.eq)(schema_1.captainOrders.restaurantId, restaurantId)));
    }
    const [updated] = await connection_1.db
        .select({
        id: schema_1.captainOrders.id,
        restaurantId: schema_1.captainOrders.restaurantId,
        branchId: schema_1.captainOrders.branchId,
        name: schema_1.captainOrders.name,
        userName: schema_1.captainOrders.userName,
        phone: schema_1.captainOrders.phone,
        image: schema_1.captainOrders.image,
        status: schema_1.captainOrders.status,
        createdAt: schema_1.captainOrders.createdAt,
        updatedAt: schema_1.captainOrders.updatedAt,
    })
        .from(schema_1.captainOrders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.captainOrders.id, id), (0, drizzle_orm_1.eq)(schema_1.captainOrders.restaurantId, restaurantId)))
        .limit(1);
    return (0, response_1.SuccessResponse)(res, {
        message: "Captain order updated successfully",
        data: updated,
    });
};
exports.updateCaptainOrder = updateCaptainOrder;
// ==========================================
// 6. Delete CaptainOrder (Deletes image file first)
// ==========================================
const deleteCaptainOrder = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.captainOrders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.captainOrders.id, id), (0, drizzle_orm_1.eq)(schema_1.captainOrders.restaurantId, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Captain order not found");
    }
    // Delete image file first before removing database record
    if (existing.image) {
        await (0, handleImages_1.deleteImage)(existing.image);
    }
    await connection_1.db
        .delete(schema_1.captainOrders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.captainOrders.id, id), (0, drizzle_orm_1.eq)(schema_1.captainOrders.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: "Captain order deleted successfully",
    });
};
exports.deleteCaptainOrder = deleteCaptainOrder;
// ==========================================
// 7. Toggle CaptainOrder Status
// ==========================================
const toggleCaptainOrderStatus = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.captainOrders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.captainOrders.id, id), (0, drizzle_orm_1.eq)(schema_1.captainOrders.restaurantId, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Captain order not found");
    }
    const newStatus = !existing.status;
    await connection_1.db
        .update(schema_1.captainOrders)
        .set({ status: newStatus })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.captainOrders.id, id), (0, drizzle_orm_1.eq)(schema_1.captainOrders.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: `Captain order status changed to ${newStatus ? "active" : "inactive"}`,
        data: { id, status: newStatus },
    });
};
exports.toggleCaptainOrderStatus = toggleCaptainOrderStatus;
