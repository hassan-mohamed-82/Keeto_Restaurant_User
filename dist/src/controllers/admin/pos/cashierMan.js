"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toggleCashierManStatus = exports.deleteCashierMan = exports.updateCashierMan = exports.getCashierManById = exports.getBranchesAndPermissionsForCashier = exports.getAllCashierMen = exports.createCashierMan = void 0;
const connection_1 = require("../../../models/connection");
const schema_1 = require("../../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../../utils/response");
const Errors_1 = require("../../../Errors");
const uuid_1 = require("uuid");
const bcrypt_1 = __importDefault(require("bcrypt"));
const handleImages_1 = require("../../../utils/handleImages");
const localization_helper_1 = require("../../../helpers/localization.helper");
const cashierMan_1 = require("../../../validation/admin/pos/cashierMan");
// ==========================================
// 1. Create CashierMan
// ==========================================
const createCashierMan = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { name, user_name, phone, password, branch_id, branchId, image, roles, report_perimission, status, } = req.body;
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
    // 2. Check user_name uniqueness within restaurant
    const [existingUserName] = await connection_1.db
        .select({ id: schema_1.cashierMen.id })
        .from(schema_1.cashierMen)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cashierMen.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.cashierMen.userName, user_name.trim())))
        .limit(1);
    if (existingUserName) {
        throw new Errors_1.BadRequest("User name is already in use in your restaurant");
    }
    // 3. Check phone uniqueness within restaurant
    const [existingPhone] = await connection_1.db
        .select({ id: schema_1.cashierMen.id })
        .from(schema_1.cashierMen)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cashierMen.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.cashierMen.phone, phone.trim())))
        .limit(1);
    if (existingPhone) {
        throw new Errors_1.BadRequest("Phone number is already in use in your restaurant");
    }
    // 4. Hash password with bcrypt
    const hashedPassword = await bcrypt_1.default.hash(password, 10);
    // 5. Handle image if provided
    let savedImageUrl = null;
    if (image) {
        if (typeof image === "string" && image.startsWith("http")) {
            savedImageUrl = image;
        }
        else {
            savedImageUrl = await (0, handleImages_1.saveBase64Image)(image, req, "cashiers");
        }
    }
    const parsedRoles = (0, localization_helper_1.parseJsonArray)(roles);
    const parsedPermissions = (0, localization_helper_1.parseJsonArray)(report_perimission);
    const id = (0, uuid_1.v4)();
    await connection_1.db.insert(schema_1.cashierMen).values({
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
    const [created] = await connection_1.db
        .select({
        id: schema_1.cashierMen.id,
        restaurantId: schema_1.cashierMen.restaurantId,
        branchId: schema_1.cashierMen.branchId,
        name: schema_1.cashierMen.name,
        userName: schema_1.cashierMen.userName,
        phone: schema_1.cashierMen.phone,
        image: schema_1.cashierMen.image,
        roles: schema_1.cashierMen.roles,
        report_perimission: schema_1.cashierMen.report_perimission,
        status: schema_1.cashierMen.status,
        createdAt: schema_1.cashierMen.createdAt,
        updatedAt: schema_1.cashierMen.updatedAt,
    })
        .from(schema_1.cashierMen)
        .where((0, drizzle_orm_1.eq)(schema_1.cashierMen.id, id))
        .limit(1);
    return (0, response_1.SuccessResponse)(res, {
        message: "Cashier created successfully",
        data: created,
    }, 201);
};
exports.createCashierMan = createCashierMan;
// ==========================================
// 2. Get All CashierMen (Paginated & Filtered)
// ==========================================
const getAllCashierMen = async (req, res) => {
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
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.cashierMen.restaurantId, restaurantId)];
    const targetBranchId = branch_id || branchId;
    if (targetBranchId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.cashierMen.branchId, targetBranchId));
    }
    if (status !== undefined && status !== "") {
        const boolStatus = status === true || status === "true" || status === 1 || status === "1";
        conditions.push((0, drizzle_orm_1.eq)(schema_1.cashierMen.status, boolStatus));
    }
    if (search && typeof search === "string" && search.trim() !== "") {
        const term = `%${search.trim()}%`;
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(schema_1.cashierMen.name, term), (0, drizzle_orm_1.like)(schema_1.cashierMen.userName, term), (0, drizzle_orm_1.like)(schema_1.cashierMen.phone, term)));
    }
    const isAll = all === "true" || all === true;
    const [totalCountResult, rawCashiers] = await Promise.all([
        connection_1.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema_1.cashierMen)
            .where((0, drizzle_orm_1.and)(...conditions)),
        isAll
            ? connection_1.db
                .select({
                id: schema_1.cashierMen.id,
                restaurantId: schema_1.cashierMen.restaurantId,
                branchId: schema_1.cashierMen.branchId,
                cashierId: schema_1.cashierMen.cashierId,
                cashierName: schema_1.cashiers.name,
                cashierArName: schema_1.cashiers.ar_name,
                name: schema_1.cashierMen.name,
                userName: schema_1.cashierMen.userName,
                phone: schema_1.cashierMen.phone,
                image: schema_1.cashierMen.image,
                roles: schema_1.cashierMen.roles,
                report_perimission: schema_1.cashierMen.report_perimission,
                status: schema_1.cashierMen.status,
                createdAt: schema_1.cashierMen.createdAt,
                updatedAt: schema_1.cashierMen.updatedAt,
                branchName: schema_1.branches.name,
                branchNameAr: schema_1.branches.nameAr,
                branchNameFr: schema_1.branches.nameFr,
                branchLat: schema_1.branches.lat,
                branchLng: schema_1.branches.lng,
            })
                .from(schema_1.cashierMen)
                .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.cashierMen.branchId, schema_1.branches.id))
                .leftJoin(schema_1.cashiers, (0, drizzle_orm_1.eq)(schema_1.cashierMen.cashierId, schema_1.cashiers.id))
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.cashierMen.createdAt))
            : connection_1.db
                .select({
                id: schema_1.cashierMen.id,
                restaurantId: schema_1.cashierMen.restaurantId,
                branchId: schema_1.cashierMen.branchId,
                cashierId: schema_1.cashierMen.cashierId,
                cashierName: schema_1.cashiers.name,
                cashierArName: schema_1.cashiers.ar_name,
                name: schema_1.cashierMen.name,
                userName: schema_1.cashierMen.userName,
                phone: schema_1.cashierMen.phone,
                image: schema_1.cashierMen.image,
                roles: schema_1.cashierMen.roles,
                report_perimission: schema_1.cashierMen.report_perimission,
                status: schema_1.cashierMen.status,
                createdAt: schema_1.cashierMen.createdAt,
                updatedAt: schema_1.cashierMen.updatedAt,
                branchName: schema_1.branches.name,
                branchNameAr: schema_1.branches.nameAr,
                branchNameFr: schema_1.branches.nameFr,
                branchLat: schema_1.branches.lat,
                branchLng: schema_1.branches.lng,
            })
                .from(schema_1.cashierMen)
                .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.cashierMen.branchId, schema_1.branches.id))
                .leftJoin(schema_1.cashiers, (0, drizzle_orm_1.eq)(schema_1.cashierMen.cashierId, schema_1.cashiers.id))
                .where((0, drizzle_orm_1.and)(...conditions))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.cashierMen.createdAt))
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
        roles: (0, localization_helper_1.parseJsonArray)(item.roles),
        report_perimission: (0, localization_helper_1.parseJsonArray)(item.report_perimission),
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
    return (0, response_1.SuccessResponse)(res, {
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
exports.getAllCashierMen = getAllCashierMen;
// ==========================================
// 3. Get Branches & Report Permissions for Cashier
// ==========================================
const getBranchesAndPermissionsForCashier = async (req, res) => {
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
    const formattedBranches = activeBranches.map((b) => ({
        id: b.id,
        name: (0, localization_helper_1.getLocalizedName)(b, lang),
    }));
    return (0, response_1.SuccessResponse)(res, {
        message: "Branches and report permissions fetched successfully",
        data: {
            branches: formattedBranches,
            report_perimission: [...cashierMan_1.ALLOWED_REPORT_PERMISSIONS],
        },
    });
};
exports.getBranchesAndPermissionsForCashier = getBranchesAndPermissionsForCashier;
// ==========================================
// 4. Get CashierMan By ID
// ==========================================
const getCashierManById = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const { id } = req.params;
    const [row] = await connection_1.db
        .select({
        id: schema_1.cashierMen.id,
        restaurantId: schema_1.cashierMen.restaurantId,
        branchId: schema_1.cashierMen.branchId,
        name: schema_1.cashierMen.name,
        userName: schema_1.cashierMen.userName,
        phone: schema_1.cashierMen.phone,
        image: schema_1.cashierMen.image,
        roles: schema_1.cashierMen.roles,
        report_perimission: schema_1.cashierMen.report_perimission,
        status: schema_1.cashierMen.status,
        createdAt: schema_1.cashierMen.createdAt,
        updatedAt: schema_1.cashierMen.updatedAt,
        branchName: schema_1.branches.name,
        branchNameAr: schema_1.branches.nameAr,
        branchNameFr: schema_1.branches.nameFr,
        branchLat: schema_1.branches.lat,
        branchLng: schema_1.branches.lng,
    })
        .from(schema_1.cashierMen)
        .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.cashierMen.branchId, schema_1.branches.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cashierMen.id, id), (0, drizzle_orm_1.eq)(schema_1.cashierMen.restaurantId, restaurantId)))
        .limit(1);
    if (!row) {
        throw new Errors_1.NotFound("Cashier not found");
    }
    const result = {
        id: row.id,
        name: row.name,
        user_name: row.userName,
        phone: row.phone,
        image: row.image,
        roles: (0, localization_helper_1.parseJsonArray)(row.roles),
        report_perimission: (0, localization_helper_1.parseJsonArray)(row.report_perimission),
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
        message: "Cashier fetched successfully",
        data: result,
    });
};
exports.getCashierManById = getCashierManById;
// ==========================================
// 5. Update CashierMan
// ==========================================
const updateCashierMan = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.cashierMen)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cashierMen.id, id), (0, drizzle_orm_1.eq)(schema_1.cashierMen.restaurantId, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Cashier not found");
    }
    const { name, user_name, phone, password, branch_id, branchId, image, roles, report_perimission, status, } = req.body;
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
            .select({ id: schema_1.cashierMen.id })
            .from(schema_1.cashierMen)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cashierMen.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.cashierMen.userName, user_name.trim()), (0, drizzle_orm_1.ne)(schema_1.cashierMen.id, id)))
            .limit(1);
        if (existingUserName) {
            throw new Errors_1.BadRequest("User name is already in use in your restaurant");
        }
    }
    // Check phone uniqueness if changed
    if (phone && phone.trim() !== existing.phone) {
        const [existingPhone] = await connection_1.db
            .select({ id: schema_1.cashierMen.id })
            .from(schema_1.cashierMen)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cashierMen.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.cashierMen.phone, phone.trim()), (0, drizzle_orm_1.ne)(schema_1.cashierMen.id, id)))
            .limit(1);
        if (existingPhone) {
            throw new Errors_1.BadRequest("Phone number is already in use in your restaurant");
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
    if (roles !== undefined)
        updateData.roles = (0, localization_helper_1.parseJsonArray)(roles);
    if (report_perimission !== undefined)
        updateData.report_perimission = (0, localization_helper_1.parseJsonArray)(report_perimission);
    if (status !== undefined)
        updateData.status = Boolean(status);
    // Hash password if provided
    if (password && typeof password === "string" && password.trim() !== "") {
        updateData.password = await bcrypt_1.default.hash(password, 10);
    }
    // Handle image update (deletes old image if new one provided)
    if (image !== undefined) {
        const updatedImage = await (0, handleImages_1.handleImageUpdate)(req, existing.image, image, "cashiers");
        updateData.image = updatedImage;
    }
    if (Object.keys(updateData).length > 0) {
        await connection_1.db
            .update(schema_1.cashierMen)
            .set(updateData)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cashierMen.id, id), (0, drizzle_orm_1.eq)(schema_1.cashierMen.restaurantId, restaurantId)));
    }
    const [updated] = await connection_1.db
        .select({
        id: schema_1.cashierMen.id,
        restaurantId: schema_1.cashierMen.restaurantId,
        branchId: schema_1.cashierMen.branchId,
        name: schema_1.cashierMen.name,
        userName: schema_1.cashierMen.userName,
        phone: schema_1.cashierMen.phone,
        image: schema_1.cashierMen.image,
        roles: schema_1.cashierMen.roles,
        report_perimission: schema_1.cashierMen.report_perimission,
        status: schema_1.cashierMen.status,
        createdAt: schema_1.cashierMen.createdAt,
        updatedAt: schema_1.cashierMen.updatedAt,
    })
        .from(schema_1.cashierMen)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cashierMen.id, id), (0, drizzle_orm_1.eq)(schema_1.cashierMen.restaurantId, restaurantId)))
        .limit(1);
    return (0, response_1.SuccessResponse)(res, {
        message: "Cashier updated successfully",
        data: updated,
    });
};
exports.updateCashierMan = updateCashierMan;
// ==========================================
// 6. Delete CashierMan (Deletes image file first)
// ==========================================
const deleteCashierMan = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.cashierMen)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cashierMen.id, id), (0, drizzle_orm_1.eq)(schema_1.cashierMen.restaurantId, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Cashier not found");
    }
    // Delete image file first before removing database record
    if (existing.image) {
        await (0, handleImages_1.deleteImage)(existing.image);
    }
    await connection_1.db
        .delete(schema_1.cashierMen)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cashierMen.id, id), (0, drizzle_orm_1.eq)(schema_1.cashierMen.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: "Cashier deleted successfully",
    });
};
exports.deleteCashierMan = deleteCashierMan;
// ==========================================
// 7. Toggle CashierMan Status
// ==========================================
const toggleCashierManStatus = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.cashierMen)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cashierMen.id, id), (0, drizzle_orm_1.eq)(schema_1.cashierMen.restaurantId, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Cashier not found");
    }
    const newStatus = !existing.status;
    await connection_1.db
        .update(schema_1.cashierMen)
        .set({ status: newStatus })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cashierMen.id, id), (0, drizzle_orm_1.eq)(schema_1.cashierMen.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: `Cashier status changed to ${newStatus ? "active" : "inactive"}`,
        data: { id, status: newStatus },
    });
};
exports.toggleCashierManStatus = toggleCashierManStatus;
