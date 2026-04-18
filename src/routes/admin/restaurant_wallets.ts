import { Router } from "express";
import { getMyWallet, getMyWalletTransactions } from "../../controllers/admin/restaurant_wallets";
import { catchAsync } from "../../utils/catchAsync";

const router = Router();

router.get("/", catchAsync(getMyWallet));
router.get("/transactions", catchAsync(getMyWalletTransactions));
export default router;