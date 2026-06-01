"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRestaurantQRbyid = exports.updateRestaurantQR = exports.deletRestaurantQR = exports.getRestaurantQR = exports.generateRestaurantQR = void 0;
const restQR_1 = require("../../models/schema/admin/restQR");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const uuid_1 = require("uuid");
const qrcode_1 = __importDefault(require("qrcode"));
const connection_1 = require("../../models/connection");
const redis_1 = __importDefault(require("../../config/redis"));
const generateRestaurantQR = async (req, res) => {
    // 1. استلام اللينك من الـ body
    const { restaurantUrl } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID is required.");
    }
    if (!restaurantUrl) {
        throw new BadRequest_1.BadRequest("Restaurant URL is required.");
    }
    // 2. تحويل اللينك لـ QR Code (على هيئة Base64)
    const qrCodeBase64 = await qrcode_1.default.toDataURL(restaurantUrl);
    await connection_1.db.insert(restQR_1.restaurantsUrl).values({
        id: (0, uuid_1.v4)(),
        restaurantid: restaurantId,
        qrCodeImg: qrCodeBase64,
    });
    // Invalidate cache since a new QR was generated
    await redis_1.default.del(`qr:${restaurantId}`);
    // 3. إرجاع الـ QR Code للمطعم
    return (0, response_1.SuccessResponse)(res, {
        message: "QR Code generated successfully",
        data: {
            qrCode: qrCodeBase64, // هيرجع كنص Base64 ممكن الفرونت اند يعرضه مباشرة في تاج <img>
            // qrUrl: savedQrUrl // لو قررت تحفظه وترجع اللينك
        }
    }, 200);
};
exports.generateRestaurantQR = generateRestaurantQR;
const getRestaurantQR = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID is required.");
    }
    const cacheKey = `qr:${restaurantId}`;
    const cachedData = await redis_1.default.get(cacheKey);
    if (cachedData) {
        return (0, response_1.SuccessResponse)(res, {
            message: "Restaurants fetched successfully (from cache)",
            data: JSON.parse(cachedData),
        }, 200);
    }
    const existingRestaurant = await connection_1.db.select().from(restQR_1.restaurantsUrl).where((0, drizzle_orm_1.eq)(restQR_1.restaurantsUrl.restaurantid, restaurantId));
    // Cache the result for 1 hour (3600 seconds)
    await redis_1.default.set(cacheKey, JSON.stringify(existingRestaurant), 'EX', 3600);
    return (0, response_1.SuccessResponse)(res, {
        message: "Restaurants fetched successfully",
        data: existingRestaurant,
    }, 200);
};
exports.getRestaurantQR = getRestaurantQR;
const deletRestaurantQR = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID is required.");
    }
    const { id } = req.params;
    if (!id) {
        throw new BadRequest_1.BadRequest("id is required.");
    }
    const existingRestaurant = await connection_1.db.select().from(restQR_1.restaurantsUrl).where((0, drizzle_orm_1.eq)(restQR_1.restaurantsUrl.id, id));
    if (!existingRestaurant[0]) {
        throw new BadRequest_1.BadRequest("Restaurant QR not found.");
    }
    await connection_1.db.delete(restQR_1.restaurantsUrl).where((0, drizzle_orm_1.eq)(restQR_1.restaurantsUrl.id, id));
    // Invalidate cache after deletion
    await redis_1.default.del(`qr:${restaurantId}`);
    return (0, response_1.SuccessResponse)(res, {
        message: "Restaurants deleted successfully",
    }, 200);
};
exports.deletRestaurantQR = deletRestaurantQR;
const updateRestaurantQR = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID is required.");
    }
    const existingRestaurant = await connection_1.db.select().from(restQR_1.restaurantsUrl).where((0, drizzle_orm_1.eq)(restQR_1.restaurantsUrl.restaurantid, restaurantId));
    if (existingRestaurant[0]) {
        throw new BadRequest_1.BadRequest("Restaurant QR already exists.");
    }
    return (0, response_1.SuccessResponse)(res, {
        message: "Restaurants fetched successfully",
        data: existingRestaurant,
    }, 200);
};
exports.updateRestaurantQR = updateRestaurantQR;
const getRestaurantQRbyid = async (req, res) => {
    const id = req.params.id;
    if (!id) {
        throw new BadRequest_1.BadRequest("id is required.");
    }
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID is required.");
    }
    const existingRestaurant = await connection_1.db.select().from(restQR_1.restaurantsUrl).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(restQR_1.restaurantsUrl.id, id), (0, drizzle_orm_1.eq)(restQR_1.restaurantsUrl.restaurantid, restaurantId)));
    if (!existingRestaurant[0]) {
        throw new BadRequest_1.BadRequest("Restaurant QR not found.");
    }
    return (0, response_1.SuccessResponse)(res, {
        message: "Restaurants fetched successfully",
        data: existingRestaurant,
    }, 200);
};
exports.getRestaurantQRbyid = getRestaurantQRbyid;
