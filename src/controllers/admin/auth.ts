import { Request, Response } from "express";
import { db } from "../../models/connection";
import { branches, restaurants, restrauntadmin, restaurantSchedules } from "../../models/schema";
import { role_restaurant } from "../../models/schema/admin/role_restaurant";
import { eq, inArray, and, ne } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { UnauthorizedError } from "../../Errors";
import bcrypt from "bcrypt";
import { generateRestaurantAdminToken } from "../../utils/jwt";

export async function login(req: Request, res: Response) {
    const { email, password , fcmToken } = req.body;
    if (!email || !password) {
        throw new BadRequest("Email and password are required");
    }

    // ====================================================
    // 1. البحث في جدول الحسابات الموحد (restrauntadmin)
    // ====================================================
    const [user] = await db
        .select()
        .from(restrauntadmin)
        .where(and(eq(restrauntadmin.email, email.trim().toLowerCase()),
        inArray(restrauntadmin.type, ["owner", "subadmin", "branch_manager", "staff"])))
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
    let restaurantNameAr: string | null = null;
    let restaurantNameFr: string | null = null;
    let restaurantLogo: string | null = null;
    if (user.restaurantId) {
        const [restaurant] = await db
            .select({ status: restaurants.status, name: restaurants.name , nameAr: restaurants.nameAr, nameFr: restaurants.nameFr , logo: restaurants.logo })
            .from(restaurants)
            .where(eq(restaurants.id, user.restaurantId))
            .limit(1);

        if (restaurant) {
            if (restaurant.status === "inactive") {
                throw new UnauthorizedError("The restaurant business is currently suspended.");
            }
            restaurantName = restaurant.name as string;
            restaurantNameAr = restaurant.nameAr as string | null;
            restaurantNameFr = restaurant.nameFr as string | null;
            restaurantLogo = restaurant.logo as string | null;
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
            .from(role_restaurant)
            .where(eq(role_restaurant.id, user.roleId))
            .limit(1);
        role = roleResult ?? null;
    }

    // 5.5 جلب جدول مواعيد المطعم (Restaurant Schedules)
    let schedules: any[] = [];
    if (user.restaurantId) {
        schedules = await db
            .select()
            .from(restaurantSchedules)
            .where(eq(restaurantSchedules.restaurantId, user.restaurantId));
    }

    // 5.6 تحديث الـ FCM Token في جدول الأدمن مع تفريغه من أي حسابات أخرى (Single Device Ownership)
    let currentFcmToken = user.fcmToken;
    if (fcmToken !== undefined) {
        const tokenToSave = fcmToken && String(fcmToken).trim() !== "" ? String(fcmToken).trim() : null;
        if (tokenToSave) {
            // تفريغ هذا التوكن من أي حساب أدمن آخر فوراً لمنع وصول إشعارات المطاعم الأخرى لنفس الجهاز
            await db
                .update(restrauntadmin)
                .set({ fcmToken: null })
                .where(and(
                    eq(restrauntadmin.fcmToken, tokenToSave),
                    ne(restrauntadmin.id, user.id)
                ));
        }

        await db
            .update(restrauntadmin)
            .set({ fcmToken: tokenToSave })
            .where(eq(restrauntadmin.id, user.id));

        currentFcmToken = tokenToSave;
    }

    // 6. تجهيز الـ Token Payload الديناميكي
    const tokenPayload = {
        id: user.id,
        restaurantId: user.restaurantId,
        name: user.name,
        restaurantName,
        restaurantNameAr,
        restaurantNameFr,
        restaurantLogo,
        branchId: user.branchId,
        branchName,
        branchNameAr,
        branchNameFr,
        type: user.type, // "owner" | "branch_manager" | "staff"
    };

    const token = generateRestaurantAdminToken(tokenPayload);

    // 7. صياغة الاستجابة الموحدة لتناسب الـ Frontend

    // Owner → empty array signals "all permissions granted"
    // Others → merge role permissions + custom permissions, deduped by module
    let resolvedPermissions: any[];

    if (user.type === "owner") {
        resolvedPermissions = [];
    } else {
        const parsePerms = (p: any): any[] => {
            if (!p) return [];
            if (Array.isArray(p)) return p;
            if (typeof p === "string") {
                try {
                    const parsed = JSON.parse(p);
                    return Array.isArray(parsed) ? parsed : [];
                } catch {
                    return [];
                }
            }
            return [];
        };

        let effectivePermissions: any[] = [
            ...(role && (role as any).permissions ? parsePerms((role as any).permissions) : []),
            ...(user.permissions ? parsePerms(user.permissions) : [])
        ];

        // Deduplicate: merge actions for the same module
        const mergedPermissionsMap = new Map<string, Set<string>>();
        for (const perm of effectivePermissions) {
            if (!perm?.module) continue;
            if (!mergedPermissionsMap.has(perm.module)) {
                mergedPermissionsMap.set(perm.module, new Set());
            }
            for (const act of perm.actions ?? []) {
                const actionName = typeof act === "string" ? act : act?.action;
                if (actionName) mergedPermissionsMap.get(perm.module)!.add(actionName);
            }
        }
        resolvedPermissions = Array.from(mergedPermissionsMap.entries()).map(([module, actions]) => ({
            module,
            actions: Array.from(actions),
        }));
    }

    return SuccessResponse(res, {
        message: `${user.type === "owner" ? "Owner" : "Staff"} logged in successfully`,
        token,
        admin: {
            id: user.id,
            name: user.name,
            email: user.email,
            phoneNumber: user.phoneNumber,
            roleId: user.roleId,
            permissions: resolvedPermissions,
            status: user.status,
            type: user.type,
            restaurantId: user.restaurantId,
            restaurantName,
            restaurantNameAr,
            restaurantNameFr,
            restaurantLogo,
            branchId: user.branchId,
            branchName,
            branchNameAr,
            branchNameFr,
            fcmToken: currentFcmToken
        },
        schedules
    }, 200);
}

// ==========================================
// 8. Admin Logout & Invalidate Device FCM Token
// ==========================================
export async function logout(req: Request | any, res: Response) {
    if (!req.user?.id) {
        throw new UnauthorizedError("Unauthenticated");
    }

    // إزالة الـ FCM Token الخاص بالجهاز عند تسجيل الخروج لمنع استلام أي إشعارات بعد الخروج
    await db
        .update(restrauntadmin)
        .set({ fcmToken: null })
        .where(eq(restrauntadmin.id, req.user.id));

    return SuccessResponse(res, {
        message: "Logged out successfully and FCM token dissociated",
    });
}