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
    // 1. أولاً: البحث في جدول المطاعم (حساب المالك - Owner)
    // ====================================================
    const restaurantOwner = await connection_1.db.select().from(schema_1.restaurants).where((0, drizzle_orm_1.eq)(schema_1.restaurants.email, email)).limit(1);
    if (restaurantOwner.length > 0) {
        const owner = restaurantOwner[0];
        const isPasswordValid = await bcrypt_1.default.compare(password, owner.password);
        if (!isPasswordValid)
            throw new Errors_1.UnauthorizedError("Invalid Credentials");
        if (owner.status === "inactive")
            throw new Errors_1.UnauthorizedError("Restaurant account is inactive");
        // 💡 التوكن الخاص بمالك المطعم (معهوش branchId لأنه بيشوف كل الفروع)
        const tokenPayload = {
            id: owner.id,
            restaurantId: owner.id, // 👈 مهم عشان باقي الكنترولرز بتدور على req.user.restaurantId
            name: owner.name,
            type: "subadmin", // المالك بيتعامل كـ subadmin (أعلى صلاحية في المطعم)
        };
        const token = (0, jwt_1.generateRestaurantAdminToken)(tokenPayload);
        return (0, response_1.SuccessResponse)(res, {
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
    const staff = await connection_1.db.select().from(schema_1.restrauntadmin).where((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.email, email)).limit(1);
    if (staff.length > 0) {
        const admin = staff[0];
        const isPasswordValid = await bcrypt_1.default.compare(password, admin.password);
        if (!isPasswordValid)
            throw new Errors_1.UnauthorizedError("Invalid Credentials");
        if (admin.status === "inactive")
            throw new Errors_1.UnauthorizedError("Admin is inactive");
        let role = null;
        if (admin.roleId) {
            const roleResult = await connection_1.db.select().from(schema_1.rolesadmin).where((0, drizzle_orm_1.eq)(schema_1.rolesadmin.id, admin.roleId)).limit(1);
            role = roleResult[0];
        }
        // 💡 التوكن الخاص بالموظف (معاه restaurantId وممكن branchId)
        const tokenPayload = {
            id: admin.id,
            restaurantId: admin.restaurantId, // 👈 بيتربط بمطعم معين
            branchId: admin.branchId, // 👈 بيتربط بفرع معين (لو مدير فرع)
            name: admin.name,
            type: admin.type, // "subadmin" | "branch_manager"
        };
        const token = (0, jwt_1.generateRestaurantAdminToken)(tokenPayload);
        return (0, response_1.SuccessResponse)(res, {
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
    throw new Errors_1.UnauthorizedError("Invalid Credentials");
}
