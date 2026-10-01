import { Router } from "express";
import {
    getMyWallet,
    getMyWalletTransactions,
    requestWithdrawal
} from "../../controllers/admin/restaurant_wallets";
import { catchAsync } from "../../utils/catchAsync";
import { validate } from "../../middlewares/validation";
import { requestWithdrawalSchema } from "../../validation/admin/restaurant_wallets";

const router = Router();

// جلب تفاصيل محفظة المطعم الشاملة
router.get("/", catchAsync(getMyWallet));
// جلب سجل الحركات
router.get("/transactions", catchAsync(getMyWalletTransactions));

// طلب سحب رصيد مع التحقق من صحة المبلغ
router.post("/request-withdrawal", validate(requestWithdrawalSchema), catchAsync(requestWithdrawal));

export default router;