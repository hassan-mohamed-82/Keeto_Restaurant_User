"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteDeliveryMan = exports.updateDeliveryMan = exports.getDeliveryManById = exports.getDeliveryMen = exports.createDeliveryMan = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const NotFound_1 = require("../../Errors/NotFound");
const uuid_1 = require("uuid");
const bcrypt_1 = __importDefault(require("bcrypt"));
const createDeliveryMan = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing");
    const { branchId, name, phone, email, password, image, isActive } = req.body;
    if (!name || !phone) {
        throw new BadRequest_1.BadRequest("Missing required fields (name, phone)");
    }
    const id = (0, uuid_1.v4)();
    let hashedPassword = null;
    if (password) {
        hashedPassword = await bcrypt_1.default.hash(password, 10);
    }
    await connection_1.db.insert(schema_1.deliveryMen).values({
        id,
        restaurantId,
        branchId: branchId || null,
        name,
        phone,
        email: email || null,
        password: hashedPassword,
        image: image || null,
        isActive: isActive ?? true,
    });
    return (0, response_1.SuccessResponse)(res, { message: "Delivery man created successfully", data: { id } }, 201);
};
exports.createDeliveryMan = createDeliveryMan;
const getDeliveryMen = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing");
    const { branchId } = req.query;
    let condition = (0, drizzle_orm_1.eq)(schema_1.deliveryMen.restaurantId, restaurantId);
    if (branchId) {
        condition = (0, drizzle_orm_1.and)(condition, (0, drizzle_orm_1.eq)(schema_1.deliveryMen.branchId, branchId));
    }
    const allDeliveryMen = await connection_1.db.select({
        id: schema_1.deliveryMen.id,
        restaurantId: schema_1.deliveryMen.restaurantId,
        branchId: schema_1.deliveryMen.branchId,
        name: schema_1.deliveryMen.name,
        phone: schema_1.deliveryMen.phone,
        email: schema_1.deliveryMen.email,
        image: schema_1.deliveryMen.image,
        isActive: schema_1.deliveryMen.isActive,
        createdAt: schema_1.deliveryMen.createdAt,
        updatedAt: schema_1.deliveryMen.updatedAt,
    })
        .from(schema_1.deliveryMen)
        .where(condition);
    return (0, response_1.SuccessResponse)(res, { message: "Get delivery men success", data: allDeliveryMen });
};
exports.getDeliveryMen = getDeliveryMen;
const getDeliveryManById = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing");
    const deliveryMan = await connection_1.db.select({
        id: schema_1.deliveryMen.id,
        restaurantId: schema_1.deliveryMen.restaurantId,
        branchId: schema_1.deliveryMen.branchId,
        name: schema_1.deliveryMen.name,
        phone: schema_1.deliveryMen.phone,
        email: schema_1.deliveryMen.email,
        image: schema_1.deliveryMen.image,
        isActive: schema_1.deliveryMen.isActive,
        createdAt: schema_1.deliveryMen.createdAt,
        updatedAt: schema_1.deliveryMen.updatedAt,
    })
        .from(schema_1.deliveryMen)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.deliveryMen.id, id), (0, drizzle_orm_1.eq)(schema_1.deliveryMen.restaurantId, restaurantId)))
        .limit(1);
    if (!deliveryMan[0])
        throw new NotFound_1.NotFound("Delivery man not found or does not belong to your restaurant");
    return (0, response_1.SuccessResponse)(res, { message: "Get delivery man by id success", data: deliveryMan[0] });
};
exports.getDeliveryManById = getDeliveryManById;
const updateDeliveryMan = async (req, res) => {
    const { id } = req.params;
    const { branchId, name, phone, email, password, image, isActive } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing");
    const existing = await connection_1.db
        .select()
        .from(schema_1.deliveryMen)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.deliveryMen.id, id), (0, drizzle_orm_1.eq)(schema_1.deliveryMen.restaurantId, restaurantId)))
        .limit(1);
    if (!existing[0])
        throw new NotFound_1.NotFound("Delivery man not found or you don't have permission to edit it");
    const updateData = {};
    if (branchId !== undefined)
        updateData.branchId = branchId || null;
    if (name)
        updateData.name = name;
    if (phone)
        updateData.phone = phone;
    if (email !== undefined)
        updateData.email = email || null;
    if (image !== undefined)
        updateData.image = image || null;
    if (password) {
        updateData.password = await bcrypt_1.default.hash(password, 10);
    }
    if (isActive !== undefined)
        updateData.isActive = isActive;
    await connection_1.db
        .update(schema_1.deliveryMen)
        .set(updateData)
        .where((0, drizzle_orm_1.eq)(schema_1.deliveryMen.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Delivery man updated successfully" });
};
exports.updateDeliveryMan = updateDeliveryMan;
const deleteDeliveryMan = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing");
    const existing = await connection_1.db
        .select()
        .from(schema_1.deliveryMen)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.deliveryMen.id, id), (0, drizzle_orm_1.eq)(schema_1.deliveryMen.restaurantId, restaurantId)))
        .limit(1);
    if (!existing[0])
        throw new NotFound_1.NotFound("Delivery man not found or you don't have permission to delete it");
    await connection_1.db.delete(schema_1.deliveryMen).where((0, drizzle_orm_1.eq)(schema_1.deliveryMen.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Delivery man deleted successfully" });
};
exports.deleteDeliveryMan = deleteDeliveryMan;
