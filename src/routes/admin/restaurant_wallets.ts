import { Router } from "express";
import { getMyWallet, getMyWalletTransactions } from "../../controllers/admin/restaurant_wallets";
import { catchAsync } from "../../utils/catchAsync";
import { requestWithdrawal } from "../../controllers/admin/restaurant_wallets";
const router = Router();

router.get("/", catchAsync(getMyWallet));
router.get("/transactions", catchAsync(getMyWalletTransactions));
router.post("/request-withdrawal", catchAsync(requestWithdrawal));

export default router;