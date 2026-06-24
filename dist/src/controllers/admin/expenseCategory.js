"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteExpenseCategory = exports.updateExpenseCategory = exports.getExpenseCategoryById = exports.getAllExpenseCategories = exports.createExpenseCategory = void 0;
const connection_1 = require("../../models/connection");
const expensscategory_1 = require("../../models/schema/admin/expensscategory");
const drizzle_orm_1 = require("drizzle-orm");
const Errors_1 = require("../../Errors");
const response_1 = require("../../utils/response");
const createExpenseCategory = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new Errors_1.BadRequest("Restaurant context missing");
    const { name, arName } = req.body;
    await connection_1.db.insert(expensscategory_1.expensscategory).values({
        restaurantid: restaurantId,
        name,
        arName,
    });
    return (0, response_1.SuccessResponse)(res, { message: "Expense category created successfully" }, 201);
};
exports.createExpenseCategory = createExpenseCategory;
const getAllExpenseCategories = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new Errors_1.BadRequest("Restaurant context missing");
    const categories = await connection_1.db.select().from(expensscategory_1.expensscategory)
        .where((0, drizzle_orm_1.eq)(expensscategory_1.expensscategory.restaurantid, restaurantId));
    return (0, response_1.SuccessResponse)(res, { message: "Expense categories fetched successfully", data: categories });
};
exports.getAllExpenseCategories = getAllExpenseCategories;
const getExpenseCategoryById = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new Errors_1.BadRequest("Restaurant context missing");
    const { id } = req.params;
    const [category] = await connection_1.db.select().from(expensscategory_1.expensscategory)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(expensscategory_1.expensscategory.id, id), (0, drizzle_orm_1.eq)(expensscategory_1.expensscategory.restaurantid, restaurantId)))
        .limit(1);
    if (!category)
        throw new Errors_1.NotFound("Category not found");
    return (0, response_1.SuccessResponse)(res, { message: "Expense category fetched successfully", data: category });
};
exports.getExpenseCategoryById = getExpenseCategoryById;
const updateExpenseCategory = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new Errors_1.BadRequest("Restaurant context missing");
    const { id } = req.params;
    const { name, arName } = req.body;
    const [existing] = await connection_1.db.select().from(expensscategory_1.expensscategory)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(expensscategory_1.expensscategory.id, id), (0, drizzle_orm_1.eq)(expensscategory_1.expensscategory.restaurantid, restaurantId)))
        .limit(1);
    if (!existing)
        throw new Errors_1.NotFound("Category not found");
    const updateData = {};
    if (name !== undefined)
        updateData.name = name;
    if (arName !== undefined)
        updateData.arName = arName;
    await connection_1.db.update(expensscategory_1.expensscategory).set(updateData).where((0, drizzle_orm_1.eq)(expensscategory_1.expensscategory.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Expense category updated successfully" });
};
exports.updateExpenseCategory = updateExpenseCategory;
const deleteExpenseCategory = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new Errors_1.BadRequest("Restaurant context missing");
    const { id } = req.params;
    const [existing] = await connection_1.db.select().from(expensscategory_1.expensscategory)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(expensscategory_1.expensscategory.id, id), (0, drizzle_orm_1.eq)(expensscategory_1.expensscategory.restaurantid, restaurantId)))
        .limit(1);
    if (!existing)
        throw new Errors_1.NotFound("Category not found");
    await connection_1.db.delete(expensscategory_1.expensscategory).where((0, drizzle_orm_1.eq)(expensscategory_1.expensscategory.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Expense category deleted successfully" });
};
exports.deleteExpenseCategory = deleteExpenseCategory;
