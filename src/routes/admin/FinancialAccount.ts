import { Router } from "express";
import { createFinancialAccount, updateFinancialAccount, 
    getAllFinancialAccounts, getFinancialAccount, deleteFinancialAccount,
    selectbranch, updateFinancialAccountStatus } from "../../controllers/admin/FinancialAccount";
import { catchAsync } from "../../utils/catchAsync";
const router = Router();
router.get("/select", catchAsync(selectbranch));
router.post("/", catchAsync(createFinancialAccount));
router.get("/", catchAsync(getAllFinancialAccounts));
router.get("/:id", catchAsync(getFinancialAccount));
router.put("/status/:id", catchAsync(updateFinancialAccountStatus));
router.put("/:id", catchAsync(updateFinancialAccount));
router.delete("/:id", catchAsync(deleteFinancialAccount));
export default router;
