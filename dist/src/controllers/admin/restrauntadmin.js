"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteStaff = exports.toggleStaffStatus = exports.updateStaff = exports.getStaffById = exports.getAllStaff = exports.createStaff = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const NotFound_1 = require("../../Errors/NotFound");
const BadRequest_1 = require("../../Errors/BadRequest");
const bcrypt_1 = __importDefault(require("bcrypt"));
const uuid_1 = require("uuid");
// ==========================================
// 1. إضافة موظف جديد
// ==========================================
const createStaff = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant context missing");
    const { name, email, password, phoneNumber, branchId, type, roleId, permissions } = req.body;
    if (!name || !email || !password || !phoneNumber) {
        throw new BadRequest_1.BadRequest("Missing required fields");
    }
    // التأكد إن الإيميل مش متكرر
    const existingAdmin = await connection_1.db.select().from(schema_1.restrauntadmin).where((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.email, email)).limit(1);
    if (existingAdmin[0])
        throw new BadRequest_1.BadRequest("Email already exists");
    // لو الموظف هيتربط بفرع معين، نتأكد إن الفرع ده تبع المطعم
    if (branchId) {
        const branchExists = await connection_1.db.select().from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.id, branchId), (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId))).limit(1);
        if (!branchExists[0])
            throw new BadRequest_1.BadRequest("Branch not found or doesn't belong to your restaurant");
    }
    // لو تم إرسال Role ID نتأكد إنه موجود
    if (roleId) {
        const roleExists = await connection_1.db.select().from(schema_1.rolesadmin).where((0, drizzle_orm_1.eq)(schema_1.rolesadmin.id, roleId)).limit(1);
        if (!roleExists[0])
            throw new BadRequest_1.BadRequest("Role not found");
    }
    const hashedPassword = await bcrypt_1.default.hash(password, 10);
    const id = (0, uuid_1.v4)();
    await connection_1.db.insert(schema_1.restrauntadmin).values({
        id,
        restaurantId,
        branchId: branchId || null,
        name,
        email,
        password: hashedPassword,
        phoneNumber,
        type: type || "branch_manager",
        roleId: roleId || null,
        permissions: permissions || [], // في حالة لو هتديله Custom permissions غير الـ Role
        status: "active"
    });
    return (0, response_1.SuccessResponse)(res, { message: "Staff created successfully", data: { id } }, 201);
};
exports.createStaff = createStaff;
// ==========================================
// 2. جلب كل الموظفين (الخاصين بهذا المطعم فقط)
// ==========================================
const getAllStaff = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant context missing");
    const staffList = await connection_1.db
        .select({
        id: schema_1.restrauntadmin.id,
        name: schema_1.restrauntadmin.name,
        email: schema_1.restrauntadmin.email,
        phoneNumber: schema_1.restrauntadmin.phoneNumber,
        type: schema_1.restrauntadmin.type,
        status: schema_1.restrauntadmin.status,
        createdAt: schema_1.restrauntadmin.createdAt,
        branch: {
            id: schema_1.branches.id,
            name: schema_1.branches.name,
        },
        role: {
            id: schema_1.rolesadmin.id,
            name: schema_1.rolesadmin.name,
        },
    })
        .from(schema_1.restrauntadmin)
        .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.restrauntadmin.branchId, schema_1.branches.id))
        .leftJoin(schema_1.rolesadmin, (0, drizzle_orm_1.eq)(schema_1.restrauntadmin.roleId, schema_1.rolesadmin.id))
        .where((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.restaurantId, restaurantId)); // 🛡️ حماية: موظفين المطعم ده بس
    return (0, response_1.SuccessResponse)(res, { message: "Get all staff success", data: staffList });
};
exports.getAllStaff = getAllStaff;
// ==========================================
// 3. جلب موظف معين بالـ ID
// ==========================================
const getStaffById = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const staffItem = await connection_1.db
        .select({
        id: schema_1.restrauntadmin.id,
        name: schema_1.restrauntadmin.name,
        email: schema_1.restrauntadmin.email,
        phoneNumber: schema_1.restrauntadmin.phoneNumber,
        type: schema_1.restrauntadmin.type,
        permissions: schema_1.restrauntadmin.permissions,
        status: schema_1.restrauntadmin.status,
        branchId: schema_1.restrauntadmin.branchId,
        roleId: schema_1.restrauntadmin.roleId,
    })
        .from(schema_1.restrauntadmin)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.id, id), (0, drizzle_orm_1.eq)(schema_1.restrauntadmin.restaurantId, restaurantId) // 🛡️ حماية
    )).limit(1);
    if (!staffItem[0])
        throw new NotFound_1.NotFound("Staff member not found");
    return (0, response_1.SuccessResponse)(res, { message: "Get staff by id success", data: staffItem[0] });
};
exports.getStaffById = getStaffById;
// ==========================================
// 4. تعديل بيانات موظف
// ==========================================
const updateStaff = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const { name, email, phoneNumber, branchId, type, roleId, permissions } = req.body;
    const existingStaff = await connection_1.db.select().from(schema_1.restrauntadmin)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.id, id), (0, drizzle_orm_1.eq)(schema_1.restrauntadmin.restaurantId, restaurantId))).limit(1);
    if (!existingStaff[0])
        throw new NotFound_1.NotFound("Staff member not found");
    const updateData = {};
    if (name)
        updateData.name = name;
    if (phoneNumber)
        updateData.phoneNumber = phoneNumber;
    if (type)
        updateData.type = type;
    if (branchId !== undefined)
        updateData.branchId = branchId || null;
    if (roleId !== undefined)
        updateData.roleId = roleId || null;
    if (permissions)
        updateData.permissions = permissions;
    // لو بيغير الإيميل، لازم نتأكد إنه مش مستخدم
    if (email && email !== existingStaff[0].email) {
        const emailExists = await connection_1.db.select().from(schema_1.restrauntadmin).where((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.email, email)).limit(1);
        if (emailExists[0])
            throw new BadRequest_1.BadRequest("Email already in use");
        updateData.email = email;
    }
    if (Object.keys(updateData).length === 0)
        throw new BadRequest_1.BadRequest("No data to update");
    await connection_1.db.update(schema_1.restrauntadmin).set(updateData).where((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Staff updated successfully" });
};
exports.updateStaff = updateStaff;
// ==========================================
// 5. تفعيل / إيقاف موظف (Status Toggle)
// ==========================================
const toggleStaffStatus = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const existingStaff = await connection_1.db.select({ status: schema_1.restrauntadmin.status })
        .from(schema_1.restrauntadmin)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.id, id), (0, drizzle_orm_1.eq)(schema_1.restrauntadmin.restaurantId, restaurantId))).limit(1);
    if (!existingStaff[0])
        throw new NotFound_1.NotFound("Staff member not found");
    const newStatus = existingStaff[0].status === "active" ? "inactive" : "active";
    await connection_1.db.update(schema_1.restrauntadmin)
        .set({ status: newStatus })
        .where((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.id, id));
    return (0, response_1.SuccessResponse)(res, { message: `Staff status changed to ${newStatus}` });
};
exports.toggleStaffStatus = toggleStaffStatus;
// ==========================================
// 6. حذف موظف نهائياً
// ==========================================
const deleteStaff = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const existingStaff = await connection_1.db.select().from(schema_1.restrauntadmin)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.id, id), (0, drizzle_orm_1.eq)(schema_1.restrauntadmin.restaurantId, restaurantId))).limit(1);
    if (!existingStaff[0])
        throw new NotFound_1.NotFound("Staff member not found");
    await connection_1.db.delete(schema_1.restrauntadmin).where((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Staff deleted successfully" });
};
exports.deleteStaff = deleteStaff;
