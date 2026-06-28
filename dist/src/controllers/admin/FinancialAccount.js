"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectbranch = exports.deleteFinancialAccount = exports.getFinancialAccount = exports.getAllFinancialAccounts = exports.updateFinancialAccount = exports.createFinancialAccount = void 0;
const schema_1 = require("../../models/schema");
const connection_1 = require("../../models/connection");
const drizzle_orm_1 = require("drizzle-orm");
const Errors_1 = require("../../Errors");
const response_1 = require("../../utils/response");
const handleImages_1 = require("../../utils/handleImages");
const Errors_2 = require("../../Errors");
const createFinancialAccount = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new Errors_2.UnauthorizedError("Unauthorized");
    const { name, branchId, isActive, imageUrl, balance, in_POS } = req.body;
    if (!name || !restaurantId) {
        throw new Errors_1.BadRequest("Missing required fields");
    }
    let FinalImage = imageUrl;
    if (imageUrl && imageUrl.startsWith("data:image")) {
        FinalImage = await (0, handleImages_1.saveBase64Image)(imageUrl, req, "financialAccounts");
    }
    const financialAccount = await connection_1.db.insert(schema_1.FinancialAccounts).values({
        name,
        restaurantId,
        branchId,
        isActive: isActive ?? true,
        imageUrl: FinalImage,
        balance: balance ?? 0,
        in_POS: in_POS ?? true
    });
    (0, response_1.SuccessResponse)(res, financialAccount);
};
exports.createFinancialAccount = createFinancialAccount;
const updateFinancialAccount = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new Errors_2.UnauthorizedError("Unauthorized");
    const { id, name, branchId, isActive, imageUrl, balance, in_POS } = req.body;
    if (!id || !name || !branchId) {
        throw new Errors_1.BadRequest("Missing required fields");
    }
    let FinalImage = imageUrl;
    if (imageUrl && imageUrl.startsWith("data:image")) {
        FinalImage = await (0, handleImages_1.saveBase64Image)(imageUrl, req, "financialAccounts");
    }
    const financialAccount = await connection_1.db.update(schema_1.FinancialAccounts).set({
        name,
        branchId,
        isActive: isActive ?? true,
        imageUrl: FinalImage,
        balance: balance ?? 0,
        in_POS: in_POS ?? true
    }).where((0, drizzle_orm_1.eq)(schema_1.FinancialAccounts.id, id));
    (0, response_1.SuccessResponse)(res, financialAccount);
};
exports.updateFinancialAccount = updateFinancialAccount;
const getAllFinancialAccounts = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new Errors_2.UnauthorizedError("Unauthorized");
    const financialAccounts = await connection_1.db.select().from(schema_1.FinancialAccounts).where((0, drizzle_orm_1.eq)(schema_1.FinancialAccounts.restaurantId, restaurantId));
    (0, response_1.SuccessResponse)(res, financialAccounts);
};
exports.getAllFinancialAccounts = getAllFinancialAccounts;
const getFinancialAccount = async (req, res) => {
    const restaurantId = req.user?.restaurantId;
    if (!restaurantId)
        throw new Errors_2.UnauthorizedError("Unauthorized");
    const { id } = req.params;
    const financialAccount = await connection_1.db.select().from(schema_1.FinancialAccounts).where((0, drizzle_orm_1.eq)(schema_1.FinancialAccounts.id, id));
    (0, response_1.SuccessResponse)(res, financialAccount);
};
exports.getFinancialAccount = getFinancialAccount;
const deleteFinancialAccount = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new Errors_2.UnauthorizedError("Unauthorized");
    const { id } = req.params;
    const financialAccount = await connection_1.db.delete(schema_1.FinancialAccounts).where((0, drizzle_orm_1.eq)(schema_1.FinancialAccounts.id, id));
    (0, response_1.SuccessResponse)(res, financialAccount);
};
exports.deleteFinancialAccount = deleteFinancialAccount;
const selectbranch = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new Errors_2.UnauthorizedError("Unauthorized");
    const branch = await connection_1.db.select().from(schema_1.branches).where((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId));
    (0, response_1.SuccessResponse)(res, branch);
};
exports.selectbranch = selectbranch;
