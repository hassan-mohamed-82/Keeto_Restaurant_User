"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyWalletTransactions = exports.getMyWallet = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const NotFound_1 = require("../../Errors/NotFound");
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
