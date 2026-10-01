"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = login;
exports.logout = logout;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const role_restaurant_1 = require("../../models/schema/admin/role_restaurant");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const Errors_1 = require("../../Errors");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jwt_1 = require("../../utils/jwt");
const adminTokens_1 = require("../../utils/adminTokens");
async function login(req, res) {
    const { email, password, fcmToken, deviceType } = req.body;
    if (!email || !password) {
        throw new BadRequest_1.BadRequest("Email and password are required");
    }
    // 1. البحث في جدول الحسابات الموحد
    const [user] = await connection_1.db
        .select()
        .from(schema_1.restrauntadmin)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.email, email.trim().toLowerCase()), (0, drizzle_orm_1.inArray)(schema_1.restrauntadmin.type, ["owner", "subadmin", "branch_manager", "staff"])))
        .limit(1);
    if (!user) {
        throw new Errors_1.UnauthorizedError("Invalid Credentials");
    }
    // 2. كلمة المرور
    const isPasswordValid = await bcrypt_1.default.compare(password, user.password);
    if (!isPasswordValid) {
        throw new Errors_1.UnauthorizedError("Invalid Credentials");
    }
    // 3. حالة الحساب
    if (user.status === "inactive") {
        throw new Errors_1.UnauthorizedError("Your account is deactivated. Please contact support.");
    }
    // 4. حالة المطعم واسمه
    let restaurantName = null;
    let restaurantNameAr = null;
    let restaurantNameFr = null;
    let restaurantLogo = null;
    if (user.restaurantId) {
        const [restaurant] = await connection_1.db
            .select({
            status: schema_1.restaurants.status,
            name: schema_1.restaurants.name,
            nameAr: schema_1.restaurants.nameAr,
            nameFr: schema_1.restaurants.nameFr,
            logo: schema_1.restaurants.logo,
        })
            .from(schema_1.restaurants)
            .where((0, drizzle_orm_1.eq)(schema_1.restaurants.id, user.restaurantId))
            .limit(1);
        if (restaurant) {
            if (restaurant.status === "inactive") {
                throw new Errors_1.UnauthorizedError("The restaurant business is currently suspended.");
            }
            restaurantName = restaurant.name;
            restaurantNameAr = restaurant.nameAr;
            restaurantNameFr = restaurant.nameFr;
            restaurantLogo = restaurant.logo;
        }
    }
    // 4.5 أسماء الفرع
    let branchName = null;
    let branchNameAr = null;
    let branchNameFr = null;
    if (user.branchId) {
        const [branch] = await connection_1.db
            .select({ name: schema_1.branches.name, nameAr: schema_1.branches.nameAr, nameFr: schema_1.branches.nameFr })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.eq)(schema_1.branches.id, user.branchId))
            .limit(1);
        if (branch) {
            branchName = branch.name;
            branchNameAr = branch.nameAr;
            branchNameFr = branch.nameFr;
        }
    }
    // 5. الـ Role
    let role = null;
    if (user.roleId) {
        const [roleResult] = await connection_1.db
            .select()
            .from(role_restaurant_1.role_restaurant)
            .where((0, drizzle_orm_1.eq)(role_restaurant_1.role_restaurant.id, user.roleId))
            .limit(1);
        role = roleResult ?? null;
    }
    // 5.5 مواعيد المطعم
    let schedules = [];
    if (user.restaurantId) {
        schedules = await connection_1.db
            .select()
            .from(schema_1.restaurantSchedules)
            .where((0, drizzle_orm_1.eq)(schema_1.restaurantSchedules.restaurantId, user.restaurantId));
    }
    // 5.6 تسجيل توكن الجهاز (الأدمن يقدر يفتح من iOS وAndroid معاً)
    const tokenToSave = fcmToken && String(fcmToken).trim() !== "" ? String(fcmToken).trim() : null;
    if (tokenToSave) {
        const devType = (0, adminTokens_1.parseDeviceType)(deviceType) || "web";
        await (0, adminTokens_1.registerAdminToken)(user.id, tokenToSave, devType);
    }
    const currentFcmToken = tokenToSave;
    // 6. Token Payload
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
        type: user.type,
    };
    const token = (0, jwt_1.generateRestaurantAdminToken)(tokenPayload);
    // 7. الصلاحيات
    let resolvedPermissions;
    if (user.type === "owner") {
        resolvedPermissions = [];
    }
    else {
        const parsePerms = (p) => {
            if (!p)
                return [];
            if (Array.isArray(p))
                return p;
            if (typeof p === "string") {
                try {
                    const parsed = JSON.parse(p);
                    return Array.isArray(parsed) ? parsed : [];
                }
                catch {
                    return [];
                }
            }
            return [];
        };
        const effectivePermissions = [
            ...(role && role.permissions ? parsePerms(role.permissions) : []),
            ...(user.permissions ? parsePerms(user.permissions) : [])
        ];
        const mergedPermissionsMap = new Map();
        for (const perm of effectivePermissions) {
            if (!perm?.module)
                continue;
            if (!mergedPermissionsMap.has(perm.module)) {
                mergedPermissionsMap.set(perm.module, new Set());
            }
            for (const act of perm.actions ?? []) {
                const actionName = typeof act === "string" ? act : act?.action;
                if (actionName)
                    mergedPermissionsMap.get(perm.module).add(actionName);
            }
        }
        resolvedPermissions = Array.from(mergedPermissionsMap.entries()).map(([module, actions]) => ({
            module,
            actions: Array.from(actions),
        }));
    }
    return (0, response_1.SuccessResponse)(res, {
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
// Admin Logout: يمسح توكن الجهاز ده بس (لو deviceType اتبعت)
// ==========================================
async function logout(req, res) {
    if (!req.user?.id) {
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    }
    await (0, adminTokens_1.removeAdminToken)(req.user.id, (0, adminTokens_1.parseDeviceType)(req.body?.deviceType));
    return (0, response_1.SuccessResponse)(res, {
        message: "Logged out successfully and FCM token dissociated",
    });
}
