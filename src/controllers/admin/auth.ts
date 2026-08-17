import { Request, Response } from "express";
import { db } from "../../models/connection";
import { branches, restaurants, restrauntadmin, rolesadmin } from "../../models/schema";
import { eq } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { UnauthorizedError } from "../../Errors";
import bcrypt from "bcrypt";
import { generateRestaurantAdminToken } from "../../utils/jwt";

export async function login(req: Request, res: Response) {
    const { email, password } = req.body;
    if (!email || !password) {
        throw new BadRequest("Email and password are required");
    }

    // ====================================================
    // 1. البحث في جدول الحسابات الموحد (restrauntadmin)
    // ====================================================
    const [user] = await db
        .select()
        .from(restrauntadmin)
        .where(eq(restrauntadmin.email, email.trim().toLowerCase()))
        .limit(1);

    // إذا لم يتم العثور على الحساب
    if (!user) {
        throw new UnauthorizedError("Invalid Credentials");
    }

    // 2. التحقق من صحة كلمة المرور
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
        throw new UnauthorizedError("Invalid Credentials");
    }

    // 3. التحقق من حالة حساب المستخدم نفسه
    if (user.status === "inactive") {
        throw new UnauthorizedError("Your account is deactivated. Please contact support.");
    }

    // 4. التحقق من حالة المطعم وجلب اسمه
    let restaurantName: string | null = null;
    if (user.restaurantId) {
        const [restaurant] = await db
            .select({ status: restaurants.status, name: restaurants.name })
            .from(restaurants)
            .where(eq(restaurants.id, user.restaurantId))
            .limit(1);

        if (restaurant) {
            if (restaurant.status === "inactive") {
                throw new UnauthorizedError("The restaurant business is currently suspended.");
            }
            restaurantName = restaurant.name as string;
        }
    }

    // 🌐 4.5 جلب أسماء الفرع باللغات المختلفة
    let branchName: string | null = null;
    let branchNameAr: string | null = null;
    let branchNameFr: string | null = null;

    if (user.branchId) {
        const [branch] = await db
            .select({
                name: branches.name,
                nameAr: branches.nameAr,
                nameFr: branches.nameFr,
            })
            .from(branches)
            .where(eq(branches.id, user.branchId))
            .limit(1);

        if (branch) {
            branchName = branch.name as string;
            branchNameAr = branch.nameAr as string | null;
            branchNameFr = branch.nameFr as string | null;
        }
    }

    // 5. جلب الـ Role إذا كان المستخدم موظفاً وله دور محدد
    let role = null;
    if (user.roleId) {
        const [roleResult] = await db
            .select()
            .from(rolesadmin)
            .where(eq(rolesadmin.id, user.roleId))
            .limit(1);
        role = roleResult;
    }

    // 6. تجهيز الـ Token Payload الديناميكي
    const tokenPayload = {
        id: user.id,
        restaurantId: user.restaurantId,
        name: user.name,
        restaurantName,
        branchId: user.branchId,
        branchName,
        branchNameAr,
        branchNameFr,
        type: user.type, // "owner" | "branch_manager" | "staff"
    };

    const token = generateRestaurantAdminToken(tokenPayload);

    // 7. صياغة الاستجابة الموحدة لتناسب الـ Frontend
    return SuccessResponse(res, {
        message: `${user.type === "owner" ? "Owner" : "Staff"} logged in successfully`,
        token,
        admin: {
            id: user.id,
            name: user.name,
            email: user.email,
            phoneNumber: user.phoneNumber,
            roleId: user.roleId,
            permissions: user.permissions || [],
            status: user.status,
            type: user.type,
            restaurantId: user.restaurantId,
            restaurantName,
            branchId: user.branchId,
            branchName,
            branchNameAr,
            branchNameFr
        }
    }, 200);
}