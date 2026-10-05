"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = exports.generateShippingCompanyToken = exports.generateDeliveryManToken = exports.generateGuestToken = exports.generateRestaurantAdminToken = exports.generateAdminToken = exports.generateUserToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET;
// =======================
// Generate User Token
// =======================
const generateUserToken = (data) => {
    return jsonwebtoken_1.default.sign({
        id: data.id,
        name: data.name,
        role: "user",
    }, JWT_SECRET, { expiresIn: "30d" });
};
exports.generateUserToken = generateUserToken;
// =======================
// Generate Admin Token
// =======================
const generateAdminToken = (data) => {
    return jsonwebtoken_1.default.sign({
        id: data.id,
        name: data.name,
        role: "admin",
        type: data.type,
    }, JWT_SECRET, { expiresIn: "7d" });
};
exports.generateAdminToken = generateAdminToken;
// =======================
// Generate Restaurant Admin Token
// =======================
const generateRestaurantAdminToken = (data) => {
    return jsonwebtoken_1.default.sign({
        id: data.id,
        name: data.name,
        role: data.type,
        type: data.type, // هنا سيتم تخزين "owner" أو "staff" داخل الـ token payload
        restaurantId: data.restaurantId,
        branchId: data.branchId || null,
    }, JWT_SECRET, { expiresIn: "7d" });
};
exports.generateRestaurantAdminToken = generateRestaurantAdminToken;
// =======================
// Generate Guest Token
// =======================
const generateGuestToken = (data) => {
    return jsonwebtoken_1.default.sign({
        id: data.id,
        name: "Guest",
        role: "user",
        isGuest: true,
        restaurantId: data.restaurantId || null,
    }, JWT_SECRET, { expiresIn: "30d" });
};
exports.generateGuestToken = generateGuestToken;
// =======================
// Generate Delivery Man Token
// =======================
const generateDeliveryManToken = (data) => {
    return jsonwebtoken_1.default.sign({
        id: data.id,
        name: data.name,
        phone: data.phone || null,
        role: "delivery_man",
        type: "delivery_man",
        restaurantId: data.restaurantId,
        branchId: data.branchId || null,
        shippingCompanyId: data.shippingCompanyId || null,
        deliveryType: data.deliveryType || null,
    }, JWT_SECRET, { expiresIn: "30d" });
};
exports.generateDeliveryManToken = generateDeliveryManToken;
// =======================
// Generate Shipping Company Token
// =======================
const generateShippingCompanyToken = (data) => {
    return jsonwebtoken_1.default.sign({
        id: data.id,
        name: data.name,
        email: data.email,
        role: "shipping_company",
        shippingCompanyId: data.id,
    }, JWT_SECRET, { expiresIn: "30d" });
};
exports.generateShippingCompanyToken = generateShippingCompanyToken;
// =======================
// Verify Token
// =======================
const verifyToken = (token) => {
    return jsonwebtoken_1.default.verify(token, JWT_SECRET);
};
exports.verifyToken = verifyToken;
