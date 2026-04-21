import { Request, Response } from "express";
import { db } from "../../models/connection";
import { restrauntadmin, rolesadmin, branches } from "../../models/schema";
import { eq, and } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { NotFound } from "../../Errors/NotFound";
import { BadRequest } from "../../Errors/BadRequest";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";

// ==========================================
// 1. إضافة موظف جديد
// ==========================================
export const createStaff = async (req: Request, res: Response) => {
    const restaurantId = (req.user?.restaurantId || req.user?.id) as string; 
    if (!restaurantId) throw new BadRequest("Restaurant context missing");

    const { name, email, password, phoneNumber, branchId, type, roleId, permissions } = req.body;

    if (!name || !email || !password || !phoneNumber) {
        throw new BadRequest("Missing required fields");
    }

    // التأكد إن الإيميل مش متكرر
    const existingAdmin = await db.select().from(restrauntadmin).where(eq(restrauntadmin.email, email)).limit(1);
    if (existingAdmin[0]) throw new BadRequest("Email already exists");

    // لو الموظف هيتربط بفرع معين، نتأكد إن الفرع ده تبع المطعم
    if (branchId) {
        const branchExists = await db.select().from(branches)
            .where(and(eq(branches.id, branchId), eq(branches.restaurantId, restaurantId))).limit(1);
        if (!branchExists[0]) throw new BadRequest("Branch not found or doesn't belong to your restaurant");
    }

    // لو تم إرسال Role ID نتأكد إنه موجود
    if (roleId) {
        const roleExists = await db.select().from(rolesadmin).where(eq(rolesadmin.id, roleId)).limit(1);
        if (!roleExists[0]) throw new BadRequest("Role not found");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const id = uuidv4();

    await db.insert(restrauntadmin).values({
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

    return SuccessResponse(res, { message: "Staff created successfully", data: { id } }, 201);
};

// ==========================================
// 2. جلب كل الموظفين (الخاصين بهذا المطعم فقط)
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
                id: rolesadmin.id,
                name: rolesadmin.name,
            },
        })
        .from(restrauntadmin)
        .leftJoin(branches, eq(restrauntadmin.branchId, branches.id))
        .leftJoin(rolesadmin, eq(restrauntadmin.roleId, rolesadmin.id))
        .where(eq(restrauntadmin.restaurantId, restaurantId)); // 🛡️ حماية: موظفين المطعم ده بس

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
        .where(and(
            eq(restrauntadmin.id, id),
            eq(restrauntadmin.restaurantId, restaurantId) // 🛡️ حماية
        )).limit(1);

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

    const updateData: any = {};
    if (name) updateData.name = name;
    if (phoneNumber) updateData.phoneNumber = phoneNumber;
    if (type) updateData.type = type;
    if (branchId !== undefined) updateData.branchId = branchId || null;
    if (roleId !== undefined) updateData.roleId = roleId || null;
    if (permissions) updateData.permissions = permissions;

    // لو بيغير الإيميل، لازم نتأكد إنه مش مستخدم
    if (email && email !== existingStaff[0].email) {
        const emailExists = await db.select().from(restrauntadmin).where(eq(restrauntadmin.email, email)).limit(1);
        if (emailExists[0]) throw new BadRequest("Email already in use");
        updateData.email = email;
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

    const existingStaff = await db.select({ status: restrauntadmin.status })
        .from(restrauntadmin)
        .where(and(eq(restrauntadmin.id, id), eq(restrauntadmin.restaurantId, restaurantId))).limit(1);

    if (!existingStaff[0]) throw new NotFound("Staff member not found");

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

    await db.delete(restrauntadmin).where(eq(restrauntadmin.id, id));

    return SuccessResponse(res, { message: "Staff deleted successfully" });
};