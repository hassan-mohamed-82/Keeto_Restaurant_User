"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectWalletTransaction = exports.approveWalletTransaction = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const response_1 = require("../../utils/response");
const drizzle_orm_1 = require("drizzle-orm");
const BadRequest_1 = require("../../Errors/BadRequest");
const approveWalletTransaction = async (req, res) => {
    const { transactionId } = req.params;
    const [txData] = await connection_1.db
        .select()
        .from(schema_1.userWalletTransactions)
        .where((0, drizzle_orm_1.eq)(schema_1.userWalletTransactions.id, transactionId))
        .limit(1);
    if (!txData || txData.status !== "pending") {
        throw new BadRequest_1.BadRequest("Invalid transaction");
    }
    const [wallet] = await connection_1.db
        .select()
        .from(schema_1.userWallets)
        .where((0, drizzle_orm_1.eq)(schema_1.userWallets.userId, txData.userId))
        .limit(1);
    const newBalance = Number(wallet.balance) + Number(txData.amount);
    await connection_1.db.transaction(async (dbTx) => {
        await dbTx.update(schema_1.userWalletTransactions)
            .set({ status: "approved" })
            .where((0, drizzle_orm_1.eq)(schema_1.userWalletTransactions.id, transactionId));
        await dbTx.update(schema_1.userWallets)
            .set({ balance: newBalance.toString() })
            .where((0, drizzle_orm_1.eq)(schema_1.userWallets.id, wallet.id));
    });
    return (0, response_1.SuccessResponse)(res, { message: "Transaction approved" });
};
exports.approveWalletTransaction = approveWalletTransaction;
const rejectWalletTransaction = async (req, res) => {
    const { transactionId } = req.params;
    await connection_1.db.update(schema_1.userWalletTransactions)
        .set({ status: "rejected" })
        .where((0, drizzle_orm_1.eq)(schema_1.userWalletTransactions.id, transactionId));
    return (0, response_1.SuccessResponse)(res, { message: "Transaction rejected" });
};
exports.rejectWalletTransaction = rejectWalletTransaction;
