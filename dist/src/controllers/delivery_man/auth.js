"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateFcmToken = exports.logoutDeliveryMan = exports.loginDeliveryMan = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const Errors_1 = require("../../Errors");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jwt_1 = require("../../utils/jwt");
// ==========================================
// POST /delivery-man/auth/login
// ==========================================
const loginDeliveryMan = async (req, res) => {
    const { identifier, password, fcmToken } = req.body;
    const trimmed = (identifier || "").trim();
    if (!trimmed || !password) {
        throw new BadRequest_1.BadRequest("Identifier (phone or email) and password are required");
    }
    // Search by phone or email
    const [deliveryMan] = await connection_1.db
        .select()
        .from(schema_1.deliveryMen)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.deliveryMen.phone, trimmed), (0, drizzle_orm_1.eq)(schema_1.deliveryMen.email, trimmed.toLowerCase())), (0, drizzle_orm_1.eq)(schema_1.deliveryMen.isDeleted, false)))
        .limit(1);
    if (!deliveryMan) {
        throw new Errors_1.UnauthorizedError("Invalid credentials");
    }
    return await _processLogin(res, deliveryMan, password, fcmToken);
};
exports.loginDeliveryMan = loginDeliveryMan;
async function _processLogin(res, deliveryMan, password, fcmToken) {
    // Check password
    if (!deliveryMan.password) {
        throw new Errors_1.UnauthorizedError("Account has no password set. Contact your restaurant admin.");
    }
    const isPasswordValid = await bcrypt_1.default.compare(password, deliveryMan.password);
    if (!isPasswordValid)
        throw new Errors_1.UnauthorizedError("Invalid credentials");
    // Check active status
    if (deliveryMan.isActive === false) {
        throw new Errors_1.UnauthorizedError("Your account is deactivated. Please contact your restaurant admin.");
    }
    // Fetch restaurant info
    let restaurantName = null;
    let restaurantStatus = null;
    if (deliveryMan.restaurantId) {
        const [restaurant] = await connection_1.db
            .select({ status: schema_1.restaurants.status, name: schema_1.restaurants.name })
            .from(schema_1.restaurants)
            .where((0, drizzle_orm_1.eq)(schema_1.restaurants.id, deliveryMan.restaurantId))
            .limit(1);
        if (restaurant) {
            if (restaurant.status === "inactive") {
                throw new Errors_1.UnauthorizedError("The restaurant is currently suspended.");
            }
            restaurantName = restaurant.name;
            restaurantStatus = restaurant.status;
        }
    }
    // Fetch branch info
    let branchName = null;
    let branchNameAr = null;
    if (deliveryMan.branchId) {
        const [branch] = await connection_1.db
            .select({ name: schema_1.branches.name, nameAr: schema_1.branches.nameAr })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.eq)(schema_1.branches.id, deliveryMan.branchId))
            .limit(1);
        if (branch) {
            branchName = branch.name;
            branchNameAr = branch.nameAr;
        }
    }
    // Save FCM token (only after all checks passed)
    if (fcmToken && typeof fcmToken === "string" && fcmToken.trim()) {
        await connection_1.db
            .update(schema_1.deliveryMen)
            .set({ fcmToken: fcmToken.trim() })
            .where((0, drizzle_orm_1.eq)(schema_1.deliveryMen.id, deliveryMan.id));
    }
    // Generate token
    const token = (0, jwt_1.generateDeliveryManToken)({
        id: deliveryMan.id,
        name: deliveryMan.name,
        restaurantId: deliveryMan.restaurantId,
        branchId: deliveryMan.branchId || null,
        phone: deliveryMan.phone,
    });
    return (0, response_1.SuccessResponse)(res, {
        message: "Delivery man logged in successfully",
        token,
        deliveryMan: {
            id: deliveryMan.id,
            name: deliveryMan.name,
            phone: deliveryMan.phone,
            email: deliveryMan.email,
            image: deliveryMan.image,
            isActive: deliveryMan.isActive,
            restaurantId: deliveryMan.restaurantId,
            restaurantName,
            branchId: deliveryMan.branchId,
            branchName,
            branchNameAr,
        },
    }, 200);
}
// ==========================================
// POST /delivery-man/auth/logout
// ==========================================
const logoutDeliveryMan = async (req, res) => {
    const deliveryManId = req.user?.id;
    if (!deliveryManId)
        throw new Errors_1.UnauthorizedError("Not authenticated");
    // JWT is stateless and is discarded client-side.
    // Clear the FCM token so this device stops receiving pushes after logout.
    await connection_1.db
        .update(schema_1.deliveryMen)
        .set({ fcmToken: null })
        .where((0, drizzle_orm_1.eq)(schema_1.deliveryMen.id, deliveryManId));
    return (0, response_1.SuccessResponse)(res, { message: "Logged out successfully" });
};
exports.logoutDeliveryMan = logoutDeliveryMan;
// ==========================================
// POST /delivery-man/auth/fcm-token
// Called by the app when Firebase refreshes the token (onTokenRefresh)
// ==========================================
const updateFcmToken = async (req, res) => {
    const deliveryManId = req.user?.id;
    if (!deliveryManId)
        throw new Errors_1.UnauthorizedError("Not authenticated");
    const { fcmToken } = req.body;
    if (!fcmToken || typeof fcmToken !== "string" || !fcmToken.trim()) {
        throw new BadRequest_1.BadRequest("fcmToken is required");
    }
    await connection_1.db
        .update(schema_1.deliveryMen)
        .set({ fcmToken: fcmToken.trim() })
        .where((0, drizzle_orm_1.eq)(schema_1.deliveryMen.id, deliveryManId));
    return (0, response_1.SuccessResponse)(res, { message: "FCM token updated successfully" });
};
exports.updateFcmToken = updateFcmToken;
