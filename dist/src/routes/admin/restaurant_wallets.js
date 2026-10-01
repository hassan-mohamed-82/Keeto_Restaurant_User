"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const restaurant_wallets_1 = require("../../controllers/admin/restaurant_wallets");
const catchAsync_1 = require("../../utils/catchAsync");
const validation_1 = require("../../middlewares/validation");
const restaurant_wallets_2 = require("../../validation/admin/restaurant_wallets");
const router = (0, express_1.Router)();
// جلب تفاصيل محفظة المطعم الشاملة
router.get("/", (0, catchAsync_1.catchAsync)(restaurant_wallets_1.getMyWallet));
// جلب سجل الحركات
router.get("/transactions", (0, catchAsync_1.catchAsync)(restaurant_wallets_1.getMyWalletTransactions));
// طلب سحب رصيد مع التحقق من صحة المبلغ
router.post("/request-withdrawal", (0, validation_1.validate)(restaurant_wallets_2.requestWithdrawalSchema), (0, catchAsync_1.catchAsync)(restaurant_wallets_1.requestWithdrawal));
exports.default = router;
