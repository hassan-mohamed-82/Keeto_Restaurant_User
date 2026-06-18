"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestWithdrawal = exports.getMyWalletTransactions = exports.getMyWallet = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const NotFound_1 = require("../../Errors/NotFound");
const uuid_1 = require("uuid");
// ==========================================
// 1. جلب ملخص محفظة المطعم (الأرصدة)
// ==========================================
const getMyWallet = async (req, res) => {
    // 1. تحديد هوية المطعم
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const branchId = req.user?.branchId; // لو ده موجود، يبقى ده مدير فرع
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant context missing");
    // 🛡️ حماية مالية: نمنع مديري الفروع من رؤية محفظة المطعم الأساسية
    if (branchId) {
        throw new BadRequest_1.BadRequest("Unauthorized: Only restaurant owners can view wallet data");
    }
    // 2. جلب بيانات المحفظة
    const [wallet] = await connection_1.db.select()
        .from(schema_1.restaurantWallets)
        .where((0, drizzle_orm_1.eq)(schema_1.restaurantWallets.restaurantId, restaurantId))
        .limit(1);
    if (!wallet) {
        throw new NotFound_1.NotFound("Wallet not found for this restaurant");
    }
    return (0, response_1.SuccessResponse)(res, {
        message: "Get wallet details success",
        data: wallet
    });
};
exports.getMyWallet = getMyWallet;
// ==========================================
// 2. جلب سجل حركات المحفظة (Transactions History)
// ==========================================
const getMyWalletTransactions = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const branchId = req.user?.branchId;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant context missing");
    // 🛡️ حماية مالية: نفس نظام الحماية
    if (branchId) {
        throw new BadRequest_1.BadRequest("Unauthorized: Only restaurant owners can view transaction history");
    }
    // 2. جلب سجل الحركات وترتيبه من الأحدث للأقدم
    const transactions = await connection_1.db.select()
        .from(schema_1.restaurantWalletTransactions)
        .where((0, drizzle_orm_1.eq)(schema_1.restaurantWalletTransactions.restaurantId, restaurantId))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.restaurantWalletTransactions.createdAt));
    return (0, response_1.SuccessResponse)(res, {
        message: "Get wallet transactions success",
        data: transactions
    });
};
exports.getMyWalletTransactions = getMyWalletTransactions;
// ==========================================
// 3. REQUEST WITHDRAWAL (Restaurant App)
// ==========================================
const requestWithdrawal = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const { amount } = req.body;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant context missing");
    const requestedAmount = parseFloat(amount);
    if (!requestedAmount || requestedAmount <= 0) {
        throw new BadRequest_1.BadRequest("Invalid requested amount");
    }
    const [wallet] = await connection_1.db.select().from(schema_1.restaurantWallets).where((0, drizzle_orm_1.eq)(schema_1.restaurantWallets.restaurantId, restaurantId)).limit(1);
    if (!wallet)
        throw new NotFound_1.NotFound("Wallet not found");
    const currentBalance = parseFloat(wallet.balance || "0");
    const currentPending = parseFloat(wallet.pendingWithdraw || "0");
    // 🛡️ لازم نتأكد إن المطعم عنده رصيد إيجابي يغطي المبلغ اللي طالبه
    if (requestedAmount > currentBalance) {
        throw new BadRequest_1.BadRequest("Insufficient balance to request this withdrawal");
    }
    const newBalance = currentBalance - requestedAmount;
    const newPending = currentPending + requestedAmount;
    await connection_1.db.transaction(async (tx) => {
        // 1. نخصم من الرصيد الأساسي ونحط في الـ Pending
        await tx.update(schema_1.restaurantWallets)
            .set({
            balance: newBalance.toFixed(2),
            pendingWithdraw: newPending.toFixed(2)
        })
            .where((0, drizzle_orm_1.eq)(schema_1.restaurantWallets.restaurantId, restaurantId));
        // 2. نسجل الحركة
        await tx.insert(schema_1.restaurantWalletTransactions).values({
            id: (0, uuid_1.v4)(),
            restaurantId,
            type: "withdraw_request", // ضيف النوع ده للـ Enum عندك
            amount: `-${requestedAmount.toFixed(2)}`,
            balanceBefore: currentBalance.toFixed(2),
            balanceAfter: newBalance.toFixed(2),
            method: "bank",
            note: "Restaurant requested a withdrawal",
            createdAt: new Date()
        });
    });
    return (0, response_1.SuccessResponse)(res, { message: "Withdrawal request submitted successfully" });
};
exports.requestWithdrawal = requestWithdrawal;
