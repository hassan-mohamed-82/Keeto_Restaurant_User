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
    // 4. التحقق من حالة المطعم التابع له الحساب (لحماية السيستم إذا قام السوبر أدمن بحظر المطعم)
    if (user.restaurantId) {
        const [restaurant] = await connection_1.db
            .select({ status: schema_1.restaurants.status })
            .from(schema_1.restaurants)
            .where((0, drizzle_orm_1.eq)(schema_1.restaurants.id, user.restaurantId))
            .limit(1);
        if (restaurant && restaurant.status === "inactive") {
            throw new Errors_1.UnauthorizedError("The restaurant business is currently suspended.");
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
    // 6. تجهيز الـ Token Payload الديناميكي
    // الـ Owner يملك صلاحيات كاملة (branchId: null)، والـ Staff يتربط بفرعه الفردي
    const tokenPayload = {
        id: user.id,
        restaurantId: user.restaurantId,
        branchId: user.branchId, // سيكون تلقائياً null في حالة الـ owner
        name: user.name,
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
            type: user.type, // الـ الفرونت إند سيتعرف على المالك من خلال "owner"
            restaurantId: user.restaurantId,
            branchId: user.branchId
        }
    }, 200);
}
