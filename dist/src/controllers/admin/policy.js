"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRestaurantPolicyById = exports.getRestaurantPolicies = exports.deleteRestaurantPolicy = exports.updateRestaurantPolicy = exports.createRestaurantPolicy = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const Errors_1 = require("../../Errors");
const createRestaurantPolicy = async (req, res) => {
    const { title, description } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new Errors_1.BadRequest("Unauthorized");
    if (!title || !description) {
        throw new Errors_1.BadRequest("Missing required fields");
    }
    const [newPolicy] = await connection_1.db
        .insert(schema_1.policy)
        .values({
        title,
        description,
        type: "restaurant",
        restaurantId,
    });
    return (0, response_1.SuccessResponse)(res, {
        data: newPolicy,
    });
};
exports.createRestaurantPolicy = createRestaurantPolicy;
const updateRestaurantPolicy = async (req, res) => {
    const { id } = req.params;
    const { title, description } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new Errors_1.BadRequest("Unauthorized");
    await connection_1.db
        .update(schema_1.policy)
        .set({
        title,
        description,
        updatedAt: new Date(),
    })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.policy.id, id), (0, drizzle_orm_1.eq)(schema_1.policy.type, "restaurant"), (0, drizzle_orm_1.eq)(schema_1.policy.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: "Restaurant policy updated",
    });
};
exports.updateRestaurantPolicy = updateRestaurantPolicy;
const deleteRestaurantPolicy = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new Errors_1.BadRequest("Unauthorized");
    await connection_1.db
        .delete(schema_1.policy)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.policy.id, id), (0, drizzle_orm_1.eq)(schema_1.policy.type, "restaurant"), (0, drizzle_orm_1.eq)(schema_1.policy.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: "Restaurant policy deleted",
    });
};
exports.deleteRestaurantPolicy = deleteRestaurantPolicy;
const getRestaurantPolicies = async (req, res) => {
    const { restaurantId } = req.params;
    const policies = await connection_1.db
        .select()
        .from(schema_1.policy)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.policy.type, "restaurant"), (0, drizzle_orm_1.eq)(schema_1.policy.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        data: policies,
    });
};
exports.getRestaurantPolicies = getRestaurantPolicies;
const getRestaurantPolicyById = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new Errors_1.BadRequest("Unauthorized");
    const [policies] = await connection_1.db
        .select()
        .from(schema_1.policy)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.policy.id, id), (0, drizzle_orm_1.eq)(schema_1.policy.type, "restaurant"), (0, drizzle_orm_1.eq)(schema_1.policy.restaurantId, restaurantId)));
    if (!policies)
        throw new Errors_1.BadRequest("Policy not found");
    return (0, response_1.SuccessResponse)(res, {
        data: policies,
    });
};
exports.getRestaurantPolicyById = getRestaurantPolicyById;
