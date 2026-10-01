"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWalletTransactionSchema = exports.restaurantWalletSchema = exports.requestWithdrawalSchema = void 0;
const zod_1 = require("zod");
// ==========================================
// 1. Restaurant Wallet Request Withdrawal Validation
// ==========================================
exports.requestWithdrawalSchema = zod_1.z.object({
    amount: zod_1.z.coerce.number().positive("Requested amount must be greater than zero"),
});
// ==========================================
// 2. Restaurant Wallets General Validation
// ==========================================
exports.restaurantWalletSchema = zod_1.z.object({
    restaurantId: zod_1.z.string().uuid("Invalid Restaurant ID"),
    balance: zod_1.z.coerce.string().optional(),
    collectedCash: zod_1.z.coerce.string().optional(),
    pendingWithdraw: zod_1.z.coerce.string().optional(),
    totalWithdrawn: zod_1.z.coerce.string().optional(),
    totalEarning: zod_1.z.coerce.string().optional(),
});
exports.createWalletTransactionSchema = zod_1.z.object({
    restaurantId: zod_1.z.string().uuid("Invalid Restaurant ID"),
    type: zod_1.z.enum([
        "order_payment",
        "cash_collection",
        "withdraw",
        "adjustment",
        "subscription",
    ], { required_error: "Transaction type is required" }),
    amount: zod_1.z.coerce.string().min(1, "Amount is required"),
    balanceBefore: zod_1.z.coerce.string().min(1, "Balance before is required"),
    balanceAfter: zod_1.z.coerce.string().min(1, "Balance after is required"),
    method: zod_1.z.string().max(50).optional(),
    reference: zod_1.z.string().max(255).optional(),
    note: zod_1.z.string().optional(),
});
