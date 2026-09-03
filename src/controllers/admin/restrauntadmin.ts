import { Request, Response } from "express";
import { db } from "../../models/connection";
import { restrauntadmin, role_restaurant, branches } from "../../models/schema";
import { eq, and, ne } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { NotFound } from "../../Errors/NotFound";
import { BadRequest } from "../../Errors/BadRequest";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";


// Get all roles
export const getAllRoles = async (req: Request, res: Response) => {
    const restaurantId = (req.user?.restaurantId || req.user?.id || req.user?.branchId) as string;
    if (!restaurantId) throw new BadRequest("Restaurant context missing");
    const rolesList = await db.select().from(role_restaurant).where(eq(role_restaurant.restaurantId, restaurantId));
    return SuccessResponse(res, { message: "Get all roles success", data: rolesList });
};

// ==========================================
// 1. إضافة موظف جديد (Staff / Branch Manager)
// ==========================================
export const createStaff = async (req: Request, res: Response) => {
    const restaurantId = (req.user?.restaurantId || req.user?.id) as string; 
    if (!restaurantId) throw new BadRequest("Restaurant context missing");

    const { name, email, password, phoneNumber, branchId, type, roleId, permissions } = req.body;

    if (!name || !email || !password || !phoneNumber) {
        throw new BadRequest("Missing required fields");
    }

    // 🛡️ أمنياً: لا يمكن إنشاء حساب من نوع owner من هنا، المالك ينشأ من السوبر أدمن فقط
    if (type === "owner") {
        throw new BadRequest("Cannot create another owner account");
    }

    // التأكد إن الإيميل مش متكرر في السيستم بالكامل
    const existingAdmin = await db.select().from(restrauntadmin).where(eq(restrauntadmin.email, email.trim())).limit(1);
    if (existingAdmin[0]) throw new BadRequest("Email already exists");

    // لو الموظف هيتربط بفرع معين، نتأكد إن الفرع ده تبع المطعم
    if (branchId) {
        const branchExists = await db.select().from(branches)
            .where(and(eq(branches.id, branchId), eq(branches.restaurantId, restaurantId))).limit(1);
        if (!branchExists[0]) throw new BadRequest("Branch not found or doesn't belong to your restaurant");
    }

    // لو تم إرسال Role ID نتأكد إنه موجود
    if (roleId) {
        const roleExists = await db.select().from(role_restaurant).where(eq(role_restaurant.id, roleId)).limit(1);
        if (!roleExists[0]) throw new BadRequest("Role not found");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const id = uuidv4();

    await db.insert(restrauntadmin).values({
        id,
        restaurantId,
        branchId: branchId || null,
        name,
        email: email.trim(),
        password: hashedPassword,
        phoneNumber,
        type: type || "branch_manager", // القيمة الافتراضية موظف/مدير فرع وليس مالك
        roleId: roleId || null,
        permissions: permissions || [], 
        status: "active"
    });

    return SuccessResponse(res, { message: "Staff created successfully", data: { id } }, 201);
};

// ==========================================
// 2. جلب كل الموظفين (مع استثناء حساب الـ Owner الرئيسي)
// ==========================================
export const getAllStaff = async (req: Request, res: Response) => {
    const restaurantId = (req.user?.restaurantId || req.user?.id) as string;
    if (!restaurantId) throw new BadRequest("Restaurant context missing");

    const staffList = await db
        .select({
            id: restrauntadmin.id,
            name: restrauntadmin.name,
            email: restrauntadmin.email,
            phoneNumber: restrauntadmin.phoneNumber,
            type: restrauntadmin.type,
            status: restrauntadmin.status,
            createdAt: restrauntadmin.createdAt,
            branch: {
                id: branches.id,
                name: branches.name,
            },
            role: {
                id: role_restaurant.id,
                name: role_restaurant.name,
            },
        })
        .from(restrauntadmin)
        .leftJoin(branches, eq(restrauntadmin.branchId, branches.id))
        .leftJoin(role_restaurant, eq(restrauntadmin.roleId, role_restaurant.id))
        .where(
            and(
                eq(restrauntadmin.restaurantId, restaurantId),
                ne(restrauntadmin.type, "owner") // 🛡️ استثناء المالك حتى لا يظهر كالموظفين العاديين
            )
        ); 

    return SuccessResponse(res, { message: "Get all staff success", data: staffList });
};

// ==========================================
// 3. جلب موظف معين بالـ ID
// ==========================================
export const getStaffById = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = (req.user?.restaurantId || req.user?.id) as string;

    const staffItem = await db
        .select({
            id: restrauntadmin.id,
            name: restrauntadmin.name,
            email: restrauntadmin.email,
            phoneNumber: restrauntadmin.phoneNumber,
            type: restrauntadmin.type,
            permissions: restrauntadmin.permissions,
            status: restrauntadmin.status,
            branchId: restrauntadmin.branchId,
            roleId: restrauntadmin.roleId,
        })
        .from(restrauntadmin)
        .where(
            and(
                eq(restrauntadmin.id, id),
                eq(restrauntadmin.restaurantId, restaurantId)
            )
        ).limit(1);

    if (!staffItem[0]) throw new NotFound("Staff member not found");

    return SuccessResponse(res, { message: "Get staff by id success", data: staffItem[0] });
};

// ==========================================
// 4. تعديل بيانات موظف
// ==========================================
export const updateStaff = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = (req.user?.restaurantId || req.user?.id) as string;
    const { name, email, phoneNumber, branchId, type, roleId, permissions } = req.body;

    const existingStaff = await db.select().from(restrauntadmin)
        .where(and(eq(restrauntadmin.id, id), eq(restrauntadmin.restaurantId, restaurantId))).limit(1);

    if (!existingStaff[0]) throw new NotFound("Staff member not found");

    // 🛡️ حماية أمنية: منع تعديل حساب المالك من لوحة تحكم الموظفين/الفروع
    if (existingStaff[0].type === "owner") {
        throw new BadRequest("Action denied. Owner account can only be updated by Super Admin.");
    }

    // 🛡️ حماية أمنية: منع ترقية موظف عادي إلى رتبة owner من هنا
    if (type === "owner") {
        throw new BadRequest("Cannot assign owner role to a staff member");
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (phoneNumber) updateData.phoneNumber = phoneNumber;
    if (type) updateData.type = type;
    if (branchId !== undefined) updateData.branchId = branchId || null;
    if (roleId !== undefined) updateData.roleId = roleId || null;
    if (permissions) updateData.permissions = permissions;

    // لو بيغير الإيميل، لازم نتأكد إنه مش مستخدم في أي حساب آخر
    if (email && email !== existingStaff[0].email) {
        const emailExists = await db.select().from(restrauntadmin).where(eq(restrauntadmin.email, email.trim())).limit(1);
        if (emailExists[0]) throw new BadRequest("Email already in use");
        updateData.email = email.trim();
    }

    if (Object.keys(updateData).length === 0) throw new BadRequest("No data to update");

    await db.update(restrauntadmin).set(updateData).where(eq(restrauntadmin.id, id));

    return SuccessResponse(res, { message: "Staff updated successfully" });
};

// ==========================================
// 5. تفعيل / إيقاف موظف (Status Toggle)
// ==========================================
export const toggleStaffStatus = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = (req.user?.restaurantId || req.user?.id) as string;

    const existingStaff = await db.select({ type: restrauntadmin.type, status: restrauntadmin.status })
        .from(restrauntadmin)
        .where(and(eq(restrauntadmin.id, id), eq(restrauntadmin.restaurantId, restaurantId))).limit(1);

    if (!existingStaff[0]) throw new NotFound("Staff member not found");

    // 🛡️ حماية أمنية: منع قفل حساب الـ Owner من هنا
    if (existingStaff[0].type === "owner") {
        throw new BadRequest("Action denied. Owner status can only be toggled by Super Admin.");
    }

    const newStatus = existingStaff[0].status === "active" ? "inactive" : "active";

    await db.update(restrauntadmin)
        .set({ status: newStatus })
        .where(eq(restrauntadmin.id, id));

    return SuccessResponse(res, { message: `Staff status changed to ${newStatus}` });
};

// ==========================================
// 6. حذف موظف نهائياً
// ==========================================
export const deleteStaff = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = (req.user?.restaurantId || req.user?.id) as string;

    const existingStaff = await db.select().from(restrauntadmin)
        .where(and(eq(restrauntadmin.id, id), eq(restrauntadmin.restaurantId, restaurantId))).limit(1);

    if (!existingStaff[0]) throw new NotFound("Staff member not found");

    // 🛡️ حماية أمنية: منع حذف الـ Owner نهائياً إلا عن طريق حذف المطعم كاملاً من الـ Super Admin
    if (existingStaff[0].type === "owner") {
        throw new BadRequest("Action denied. Owner account cannot be deleted individually.");
    }

    await db.delete(restrauntadmin).where(eq(restrauntadmin.id, id));

    return SuccessResponse(res, { message: "Staff deleted successfully" });
};