"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteExpense = exports.updateExpense = exports.getExpenseById = exports.getAllExpenses = exports.createExpense = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const Errors_1 = require("../../Errors");
const response_1 = require("../../utils/response");
const createExpense = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new Errors_1.BadRequest("Restaurant context missing");
    const { name, amount, categoryId, shiftId, cashierId, note, financialAccountId } = req.body;
    const cashiermanId = req.user?.id;
    if (!cashiermanId)
        throw new Errors_1.BadRequest("User context missing");
    // === التعديل هنا: إضافة سطر الحماية للتأكد من وجود الحقول الإجبارية ===
    if (!name || !amount || !categoryId) {
        throw new Errors_1.BadRequest("Missing required fields: name, amount, or categoryId");
    }
    await connection_1.db.insert(schema_1.expenss).values({
        restrauntid: restaurantId,
        name,
        amount,
        categoryId,
        shiftId,
        cashierId,
        cashiermanId,
        note,
        financialAccountId
    });
    return (0, response_1.SuccessResponse)(res, { message: "Expense created successfully" }, 201);
};
exports.createExpense = createExpense;
const getAllExpenses = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new Errors_1.BadRequest("Restaurant context missing");
    const expenses = await connection_1.db.select().from(schema_1.expenss)
        .where((0, drizzle_orm_1.eq)(schema_1.expenss.restrauntid, restaurantId))
        .innerJoin(schema_1.FinancialAccounts, (0, drizzle_orm_1.eq)(schema_1.expenss.financialAccountId, schema_1.FinancialAccounts.id));
    return (0, response_1.SuccessResponse)(res, { message: "Expenses fetched successfully", data: expenses });
};
exports.getAllExpenses = getAllExpenses;
const getExpenseById = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new Errors_1.BadRequest("Restaurant context missing");
    const { id } = req.params;
    const [expense] = await connection_1.db.select().from(schema_1.expenss)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.expenss.id, id), (0, drizzle_orm_1.eq)(schema_1.expenss.restrauntid, restaurantId)))
        .innerJoin(schema_1.FinancialAccounts, (0, drizzle_orm_1.eq)(schema_1.expenss.financialAccountId, schema_1.FinancialAccounts.id))
        .limit(1);
    if (!expense)
        throw new Errors_1.NotFound("Expense not found");
    return (0, response_1.SuccessResponse)(res, { message: "Expense fetched successfully", data: expense });
};
exports.getExpenseById = getExpenseById;
const updateExpense = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new Errors_1.BadRequest("Restaurant context missing");
    const { id } = req.params;
    const { name, amount, categoryId, shiftId, cashierId, note, paymentmethodId } = req.body;
    const [existing] = await connection_1.db.select().from(schema_1.expenss)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.expenss.id, id), (0, drizzle_orm_1.eq)(schema_1.expenss.restrauntid, restaurantId)))
        .limit(1);
    if (!existing)
        throw new Errors_1.NotFound("Expense not found");
    const updateData = {};
    if (name !== undefined)
        updateData.name = name;
    if (amount !== undefined)
        updateData.amount = amount;
    if (categoryId !== undefined)
        updateData.categoryId = categoryId;
    if (shiftId !== undefined)
        updateData.shiftId = shiftId;
    if (cashierId !== undefined)
        updateData.cashierId = cashierId;
    if (note !== undefined)
        updateData.note = note;
    if (paymentmethodId !== undefined)
        updateData.paymentmethodId = paymentmethodId;
    await connection_1.db.update(schema_1.expenss).set(updateData).where((0, drizzle_orm_1.eq)(schema_1.expenss.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Expense updated successfully" });
};
exports.updateExpense = updateExpense;
const deleteExpense = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new Errors_1.BadRequest("Restaurant context missing");
    const { id } = req.params;
    const [existing] = await connection_1.db.select().from(schema_1.expenss)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.expenss.id, id), (0, drizzle_orm_1.eq)(schema_1.expenss.restrauntid, restaurantId)))
        .limit(1);
    if (!existing)
        throw new Errors_1.NotFound("Expense not found");
    await connection_1.db.delete(schema_1.expenss).where((0, drizzle_orm_1.eq)(schema_1.expenss.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Expense deleted successfully" });
};
exports.deleteExpense = deleteExpense;
