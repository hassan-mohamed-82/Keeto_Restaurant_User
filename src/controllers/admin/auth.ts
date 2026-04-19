import { Request, Response } from "express";
import { db } from "../../models/connection";
import { restaurants, restrauntadmin, rolesadmin } from "../../models/schema";
import { eq } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { UnauthorizedError } from "../../Errors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Permission, Role } from "../../types/custom";
import { generateAdminToken } from "../../utils/jwt";

export async function login(req: Request, res: Response) {
    const { email, password } = req.body;
    if (!email || !password) {
        throw new BadRequest("Email and password are required");
    }

    // ====================================================
    // 1. أولاً: البحث في جدول المطاعم (حساب المالك - Owner)
    // ====================================================
    const restaurantOwner = await db.select().from(restaurants).where(eq(restaurants.email, email)).limit(1);

    if (restaurantOwner.length > 0) {
        const owner = restaurantOwner[0];
        const isPasswordValid = await bcrypt.compare(password, owner.password);
        
        if (!isPasswordValid) throw new UnauthorizedError("Invalid Credentials");
        if (owner.status === "inactive") throw new UnauthorizedError("Restaurant account is inactive");

        // 💡 التوكن الخاص بمالك المطعم (معهوش branchId لأنه بيشوف كل الفروع)
        const tokenPayload = {
            id: owner.id, 
            restaurantId: owner.id, // 👈 مهم عشان باقي الكنترولرز بتدور على req.user.restaurantId
            name: owner.name,
            role: "restaurantadmin" as Role, 
        };

        const token = generateAdminToken(tokenPayload);

        return SuccessResponse(res, {
            message: "Restaurant Owner logged in successfully", 
            token, 
            admin: {
                name: owner.name,
                email: owner.email,
                phoneNumber: owner.ownerPhone,
                roleId: null, // المالك ملوش Role محدد لأنه الـ Super بتاع مطعمه
                permissions: [], // ممكن تخلي الفرانتد يفهم إن الـ permissions الفاضية للمالك تعني "كل الصلاحيات"
                status: owner.status,
                type: "restaurantadmin",
                restaurantId: owner.id
            }
        }, 200);
    }

    // ====================================================
    // 2. ثانياً: البحث في جدول الموظفين (Staff / Branch Managers)
    // ====================================================
    const staff = await db.select().from(restrauntadmin).where(eq(restrauntadmin.email, email)).limit(1);

    if (staff.length > 0) {
        const admin = staff[0];
        const isPasswordValid = await bcrypt.compare(password, admin.password);
        
        if (!isPasswordValid) throw new UnauthorizedError("Invalid Credentials");
        if (admin.status === "inactive") throw new UnauthorizedError("Admin is inactive");

        let role = null;
        if (admin.roleId) {
            const roleResult = await db.select().from(rolesadmin).where(eq(rolesadmin.id, admin.roleId)).limit(1);
            role = roleResult[0];
        }

        // 💡 التوكن الخاص بالموظف (معاه restaurantId وممكن branchId)
        const tokenPayload = {
            id: admin.id,
            restaurantId: admin.restaurantId, // 👈 بيتربط بمطعم معين
            branchId: admin.branchId, // 👈 بيتربط بفرع معين (لو مدير فرع)
            name: admin.name,
            role: (role ? role.name : admin.type) as Role,
        };

        const token = generateAdminToken(tokenPayload);

        return SuccessResponse(res, {
            message: "Staff logged in successfully", 
            token, 
            admin: {
                name: admin.name,
                email: admin.email,
                phoneNumber: admin.phoneNumber,
                roleId: admin.roleId,
                permissions: admin.permissions,
                status: admin.status,
                type: admin.type,
                restaurantId: admin.restaurantId,
                branchId: admin.branchId
            }
        }, 200);
    }

    // ====================================================
    // 3. لو ملقاهوش لا هنا ولا هنا
    // ====================================================
    throw new UnauthorizedError("Invalid Credentials");
}