"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHallsForCaptain = exports.getCaptainOrderHalls = exports.toggleCaptainOrderStatus = exports.deleteCaptainOrder = exports.updateCaptainOrder = exports.getCaptainOrderById = exports.getBranchesForCaptain = exports.getAllCaptainOrders = exports.createCaptainOrder = void 0;
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
    const lang = (0, localization_helper_1.extractLang)(req);
    const { name, user_name, phone, password, branch_id, branchId, hall_ids, hallIds, image, status, } = req.body;
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
    // 2. Validate hall_ids
    const finalHallIds = (0, localization_helper_1.parseJsonArray)(hall_ids || hallIds);
    if (!finalHallIds || finalHallIds.length === 0) {
        throw new Errors_1.BadRequest("hall_ids is required and must contain at least one hall");
    }
    const validHalls = await connection_1.db
        .select({
        id: schema_1.halls.id,
        name: schema_1.halls.name,
        nameAr: schema_1.halls.nameAr,
        nameFr: schema_1.halls.nameFr,
    })
        .from(schema_1.halls)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.halls.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.halls.branchId, targetBranchId), (0, drizzle_orm_1.inArray)(schema_1.halls.id, finalHallIds)));
    if (validHalls.length !== finalHallIds.length) {
        throw new Errors_1.BadRequest("One or more selected halls are invalid or do not belong to the selected branch");
    }
    // 3. Check user_name uniqueness within restaurant
    const [existingUserName] = await connection_1.db
        .select({ id: schema_1.captainOrders.id })
        .from(schema_1.captainOrders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.captainOrders.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.captainOrders.userName, user_name.trim())))
        .limit(1);
    if (existingUserName) {
        throw new Errors_1.BadRequest("User name is already in use in your restaurant");
    }
    // 4. Check phone uniqueness within restaurant
    const [existingPhone] = await connection_1.db
        .select({ id: schema_1.captainOrders.id })
        .from(schema_1.captainOrders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.captainOrders.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.captainOrders.phone, phone.trim())))
        .limit(1);
    if (existingPhone) {
        throw new Errors_1.BadRequest("Phone number is already in use in your restaurant");
    }
    // 5. Hash password with bcrypt
    const hashedPassword = await bcrypt_1.default.hash(password, 10);
    // 6. Handle image if provided (not required)
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
        hallIds: finalHallIds,
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
        hallIds: schema_1.captainOrders.hallIds,
        status: schema_1.captainOrders.status,
        createdAt: schema_1.captainOrders.createdAt,
        updatedAt: schema_1.captainOrders.updatedAt,
    })
        .from(schema_1.captainOrders)
        .where((0, drizzle_orm_1.eq)(schema_1.captainOrders.id, id))
        .limit(1);
    const formattedCreated = {
        ...created,
        hall_ids: (0, localization_helper_1.parseJsonArray)(created.hallIds),
        halls: validHalls.map((h) => ({
            id: h.id,
            name: (0, localization_helper_1.getLocalizedName)(h, lang),
            nameAr: h.nameAr,
            nameFr: h.nameFr,
        })),
    };
    return (0, response_1.SuccessResponse)(res, {
        message: "Captain order created successfully",
        data: formattedCreated,
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
                hallIds: schema_1.captainOrders.hallIds,
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
                hallIds: schema_1.captainOrders.hallIds,
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
        hall_ids: (0, localization_helper_1.parseJsonArray)(item.hallIds),
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
        hallIds: schema_1.captainOrders.hallIds,
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
    const hallIdList = (0, localization_helper_1.parseJsonArray)(row.hallIds);
    let assignedHalls = [];
    if (hallIdList.length > 0) {
        const rawHalls = await connection_1.db
            .select({
            id: schema_1.halls.id,
            name: schema_1.halls.name,
            nameAr: schema_1.halls.nameAr,
            nameFr: schema_1.halls.nameFr,
            status: schema_1.halls.status,
        })
            .from(schema_1.halls)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.halls.restaurantId, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.halls.id, hallIdList)));
        assignedHalls = rawHalls.map((h) => ({
            id: h.id,
            name: (0, localization_helper_1.getLocalizedName)(h, lang),
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
    const lang = (0, localization_helper_1.extractLang)(req);
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.captainOrders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.captainOrders.id, id), (0, drizzle_orm_1.eq)(schema_1.captainOrders.restaurantId, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Captain order not found");
    }
    const { name, user_name, phone, password, branch_id, branchId, hall_ids, hallIds, image, status, } = req.body;
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
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.captainOrders.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.captainOrders.userName, user_name.trim()), (0, drizzle_orm_1.ne)(schema_1.captainOrders.id, id)))
            .limit(1);
        if (existingUserName) {
            throw new Errors_1.BadRequest("User name is already in use in your restaurant");
        }
    }
    // Check phone uniqueness if changed
    if (phone && phone.trim() !== existing.phone) {
        const [existingPhone] = await connection_1.db
            .select({ id: schema_1.captainOrders.id })
            .from(schema_1.captainOrders)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.captainOrders.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.captainOrders.phone, phone.trim()), (0, drizzle_orm_1.ne)(schema_1.captainOrders.id, id)))
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
    if (status !== undefined)
        updateData.status = Boolean(status);
    // Validate and update hall_ids if provided
    if (hall_ids !== undefined || hallIds !== undefined) {
        const rawHallsInput = hall_ids !== undefined ? hall_ids : hallIds;
        const finalHallIds = (0, localization_helper_1.parseJsonArray)(rawHallsInput);
        if (finalHallIds.length === 0) {
            throw new Errors_1.BadRequest("At least one hall must be selected");
        }
        const branchToCheck = targetBranchId || existing.branchId;
        const validHalls = await connection_1.db
            .select({ id: schema_1.halls.id })
            .from(schema_1.halls)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.halls.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.halls.branchId, branchToCheck), (0, drizzle_orm_1.inArray)(schema_1.halls.id, finalHallIds)));
        if (validHalls.length !== finalHallIds.length) {
            throw new Errors_1.BadRequest("One or more selected halls are invalid or do not belong to the selected branch");
        }
        updateData.hallIds = finalHallIds;
    }
    else if (targetBranchId && targetBranchId !== existing.branchId) {
        // If branch changed but halls were not re-sent, check if existing halls belong to new branch
        const existingHalls = (0, localization_helper_1.parseJsonArray)(existing.hallIds);
        if (existingHalls.length > 0) {
            const validInNewBranch = await connection_1.db
                .select({ id: schema_1.halls.id })
                .from(schema_1.halls)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.halls.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.halls.branchId, targetBranchId), (0, drizzle_orm_1.inArray)(schema_1.halls.id, existingHalls)));
            if (validInNewBranch.length !== existingHalls.length) {
                throw new Errors_1.BadRequest("Branch changed: please provide new hall_ids belonging to the new branch");
            }
        }
    }
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
        hallIds: schema_1.captainOrders.hallIds,
        status: schema_1.captainOrders.status,
        createdAt: schema_1.captainOrders.createdAt,
        updatedAt: schema_1.captainOrders.updatedAt,
    })
        .from(schema_1.captainOrders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.captainOrders.id, id), (0, drizzle_orm_1.eq)(schema_1.captainOrders.restaurantId, restaurantId)))
        .limit(1);
    const hallIdList = (0, localization_helper_1.parseJsonArray)(updated.hallIds);
    let assignedHalls = [];
    if (hallIdList.length > 0) {
        const rawHalls = await connection_1.db
            .select({
            id: schema_1.halls.id,
            name: schema_1.halls.name,
            nameAr: schema_1.halls.nameAr,
            nameFr: schema_1.halls.nameFr,
            status: schema_1.halls.status,
        })
            .from(schema_1.halls)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.halls.restaurantId, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.halls.id, hallIdList)));
        assignedHalls = rawHalls.map((h) => ({
            id: h.id,
            name: (0, localization_helper_1.getLocalizedName)(h, lang),
            nameAr: h.nameAr,
            nameFr: h.nameFr,
            status: h.status,
        }));
    }
    return (0, response_1.SuccessResponse)(res, {
        message: "Captain order updated successfully",
        data: {
            ...updated,
            hall_ids: hallIdList,
            hallIds: hallIdList,
            halls: assignedHalls,
        },
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
// ==========================================
// 8. Get Halls of a Specific CaptainOrder
// ==========================================
const getCaptainOrderHalls = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const { id } = req.params;
    const [captain] = await connection_1.db
        .select({
        id: schema_1.captainOrders.id,
        name: schema_1.captainOrders.name,
        branchId: schema_1.captainOrders.branchId,
        hallIds: schema_1.captainOrders.hallIds,
    })
        .from(schema_1.captainOrders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.captainOrders.id, id), (0, drizzle_orm_1.eq)(schema_1.captainOrders.restaurantId, restaurantId)))
        .limit(1);
    if (!captain) {
        throw new Errors_1.NotFound("Captain order not found");
    }
    const hallIdList = (0, localization_helper_1.parseJsonArray)(captain.hallIds);
    if (hallIdList.length === 0) {
        return (0, response_1.SuccessResponse)(res, {
            message: "Captain order halls fetched successfully",
            data: [],
        });
    }
    const rawHalls = await connection_1.db
        .select({
        id: schema_1.halls.id,
        name: schema_1.halls.name,
        nameAr: schema_1.halls.nameAr,
        nameFr: schema_1.halls.nameFr,
        status: schema_1.halls.status,
    })
        .from(schema_1.halls)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.halls.restaurantId, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.halls.id, hallIdList)));
    const formatted = rawHalls.map((h) => ({
        id: h.id,
        name: (0, localization_helper_1.getLocalizedName)(h, lang),
        nameAr: h.nameAr,
        nameFr: h.nameFr,
        status: h.status,
    }));
    return (0, response_1.SuccessResponse)(res, {
        message: "Captain order halls fetched successfully",
        data: formatted,
    });
};
exports.getCaptainOrderHalls = getCaptainOrderHalls;
// ==========================================
// 9. Get Available Halls for Selection (by branch)
// ==========================================
const getHallsForCaptain = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const branchId = req.query?.branch_id ||
        req.query?.branchId ||
        req.body?.branch_id ||
        req.body?.branchId;
    const conditions = [
        (0, drizzle_orm_1.eq)(schema_1.halls.restaurantId, restaurantId),
        (0, drizzle_orm_1.eq)(schema_1.halls.status, true),
    ];
    if (branchId && typeof branchId === "string") {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.halls.branchId, branchId));
    }
    const rawHalls = await connection_1.db
        .select({
        id: schema_1.halls.id,
        branchId: schema_1.halls.branchId,
        name: schema_1.halls.name,
        nameAr: schema_1.halls.nameAr,
        nameFr: schema_1.halls.nameFr,
    })
        .from(schema_1.halls)
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.halls.createdAt));
    const formatted = rawHalls.map((h) => ({
        id: h.id,
        branchId: h.branchId,
        name: (0, localization_helper_1.getLocalizedName)(h, lang),
        nameAr: h.nameAr,
        nameFr: h.nameFr,
    }));
    return (0, response_1.SuccessResponse)(res, {
        message: "Halls for captain fetched successfully",
        data: formatted,
    });
};
exports.getHallsForCaptain = getHallsForCaptain;
