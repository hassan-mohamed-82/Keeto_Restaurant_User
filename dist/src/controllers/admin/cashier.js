"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveCashiers = exports.deleteCashier = exports.updateCashier = exports.getCashierById = exports.getCashiers = exports.createCashier = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const Errors_1 = require("../../Errors");
const createCashier = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new Errors_1.BadRequest("Restaurant context missing");
    const { name, ar_name, status, branchid, cashier_active, financialAccountId } = req.body;
    if (!name || !branchid || !financialAccountId) {
        throw new Errors_1.BadRequest("Missing required fields: name, branchid, paymentmethodid");
    }
    await connection_1.db.insert(schema_1.cashiers).values({
        restaurantid: restaurantId,
        name,
        ar_name,
        status: status || "active",
        branchid,
        cashier_active: cashier_active !== undefined ? cashier_active : true,
        financialAccountId,
    });
    return (0, response_1.SuccessResponse)(res, { message: "Cashier created successfully" }, 201);
};
exports.createCashier = createCashier;
const getCashiers = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new Errors_1.BadRequest("Restaurant context missing");
    const allCashiers = await connection_1.db.select().from(schema_1.cashiers)
        .where((0, drizzle_orm_1.eq)(schema_1.cashiers.restaurantid, restaurantId))
        .innerJoin(schema_1.FinancialAccounts, (0, drizzle_orm_1.eq)(schema_1.cashiers.financialAccountId, schema_1.FinancialAccounts.id));
    return (0, response_1.SuccessResponse)(res, { message: "Cashiers fetched successfully", data: allCashiers });
};
exports.getCashiers = getCashiers;
const getCashierById = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new Errors_1.BadRequest("Restaurant context missing");
    const { id } = req.params;
    const [cashier] = await connection_1.db.select().from(schema_1.cashiers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cashiers.id, id), (0, drizzle_orm_1.eq)(schema_1.cashiers.restaurantid, restaurantId)))
        .innerJoin(schema_1.FinancialAccounts, (0, drizzle_orm_1.eq)(schema_1.cashiers.financialAccountId, schema_1.FinancialAccounts.id))
        .limit(1);
    if (!cashier)
        throw new Errors_1.NotFound("Cashier not found");
    return (0, response_1.SuccessResponse)(res, { message: "Cashier fetched successfully", data: cashier });
};
exports.getCashierById = getCashierById;
const updateCashier = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new Errors_1.BadRequest("Restaurant context missing");
    const { id } = req.params;
    const { name, ar_name, status, branchid, cashier_active, paymentmethodid } = req.body;
    const [existing] = await connection_1.db.select().from(schema_1.cashiers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cashiers.id, id), (0, drizzle_orm_1.eq)(schema_1.cashiers.restaurantid, restaurantId)))
        .limit(1);
    if (!existing)
        throw new Errors_1.NotFound("Cashier not found");
    const updateData = {};
    if (name !== undefined)
        updateData.name = name;
    if (ar_name !== undefined)
        updateData.ar_name = ar_name;
    if (status !== undefined)
        updateData.status = status;
    if (branchid !== undefined)
        updateData.branchid = branchid;
    if (cashier_active !== undefined)
        updateData.cashier_active = cashier_active;
    if (paymentmethodid !== undefined)
        updateData.paymentmethodid = paymentmethodid;
    await connection_1.db.update(schema_1.cashiers).set(updateData).where((0, drizzle_orm_1.eq)(schema_1.cashiers.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Cashier updated successfully" });
};
exports.updateCashier = updateCashier;
const deleteCashier = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new Errors_1.BadRequest("Restaurant context missing");
    const { id } = req.params;
    const [existing] = await connection_1.db.select().from(schema_1.cashiers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cashiers.id, id), (0, drizzle_orm_1.eq)(schema_1.cashiers.restaurantid, restaurantId)))
        .limit(1);
    if (!existing)
        throw new Errors_1.NotFound("Cashier not found");
    await connection_1.db.delete(schema_1.cashiers).where((0, drizzle_orm_1.eq)(schema_1.cashiers.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Cashier deleted successfully" });
};
exports.deleteCashier = deleteCashier;
const getActiveCashiers = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new Errors_1.BadRequest("Restaurant context missing");
    const allCashiers = await connection_1.db.select().from(schema_1.cashiers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cashiers.restaurantid, restaurantId), (0, drizzle_orm_1.eq)(schema_1.cashiers.status, "active")));
    const activefinicialaccounts = await connection_1.db.select().from(schema_1.FinancialAccounts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.FinancialAccounts.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.FinancialAccounts.isActive, true)));
    return (0, response_1.SuccessResponse)(res, { message: "Cashiers fetched successfully", data: { allCashiers, activefinicialaccounts } });
};
exports.getActiveCashiers = getActiveCashiers;
