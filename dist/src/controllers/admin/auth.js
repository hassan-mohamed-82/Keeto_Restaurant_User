"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = login;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const Errors_1 = require("../../Errors");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jwt_1 = require("../../utils/jwt");
async function login(req, res) {
    const { email, password } = req.body;
    if (!email || !password) {
        throw new BadRequest_1.BadRequest("Email and password are required");
    }
    // ====================================================
    // 1. البحث في جدول الحسابات الموحد (restrauntadmin)
    // ====================================================
    const [user] = await connection_1.db
        .select()
        .from(schema_1.restrauntadmin)
        .where((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.email, email.trim().toLowerCase()))
        .limit(1);
    // إذا لم يتم العثور على الحساب
    if (!user) {
        throw new Errors_1.UnauthorizedError("Invalid Credentials");
    }
    // 2. التحقق من صحة كلمة المرور
    const isPasswordValid = await bcrypt_1.default.compare(password, user.password);
    if (!isPasswordValid) {
        throw new Errors_1.UnauthorizedError("Invalid Credentials");
    }
    // 3. التحقق من حالة حساب المستخدم نفسه
    if (user.status === "inactive") {
        throw new Errors_1.UnauthorizedError("Your account is deactivated. Please contact support.");
    }
    // 4. التحقق من حالة المطعم وجلب اسمه
    let restaurantName = null;
    if (user.restaurantId) {
        const [restaurant] = await connection_1.db
            .select({ status: schema_1.restaurants.status, name: schema_1.restaurants.name })
            .from(schema_1.restaurants)
            .where((0, drizzle_orm_1.eq)(schema_1.restaurants.id, user.restaurantId))
            .limit(1);
        if (restaurant) {
            if (restaurant.status === "inactive") {
                throw new Errors_1.UnauthorizedError("The restaurant business is currently suspended.");
            }
            restaurantName = restaurant.name;
        }
    }
    // 🌐 4.5 جلب أسماء الفرع باللغات المختلفة
    let branchName = null;
    let branchNameAr = null;
    let branchNameFr = null;
    if (user.branchId) {
        const [branch] = await connection_1.db
            .select({
            name: schema_1.branches.name,
            nameAr: schema_1.branches.nameAr,
            nameFr: schema_1.branches.nameFr,
        })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.eq)(schema_1.branches.id, user.branchId))
            .limit(1);
        if (branch) {
            branchName = branch.name;
            branchNameAr = branch.nameAr;
            branchNameFr = branch.nameFr;
        }
    }
    // 5. جلب الـ Role إذا كان المستخدم موظفاً وله دور محدد
    let role = null;
    if (user.roleId) {
        const [roleResult] = await connection_1.db
            .select()
            .from(schema_1.rolesadmin)
            .where((0, drizzle_orm_1.eq)(schema_1.rolesadmin.id, user.roleId))
            .limit(1);
        role = roleResult;
    }
    // 5.5 جلب جدول مواعيد المطعم (Restaurant Schedules)
    let schedules = [];
    if (user.restaurantId) {
        schedules = await connection_1.db
            .select()
            .from(schema_1.restaurantSchedules)
            .where((0, drizzle_orm_1.eq)(schema_1.restaurantSchedules.restaurantId, user.restaurantId));
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
    const token = (0, jwt_1.generateRestaurantAdminToken)(tokenPayload);
    // 7. صياغة الاستجابة الموحدة لتناسب الـ Frontend
    return (0, response_1.SuccessResponse)(res, {
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
        },
        schedules
    }, 200);
}
