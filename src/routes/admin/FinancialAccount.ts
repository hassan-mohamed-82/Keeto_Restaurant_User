import { Router } from "express";
import { createFinancialAccount, updateFinancialAccount, 
    getAllFinancialAccounts, getFinancialAccount, deleteFinancialAccount,
    selectbranch } from "../../controllers/admin/FinancialAccount";
import { catchAsync } from "../../utils/catchAsync";
const router = Router();
router.get("/select", catchAsync(selectbranch));
router.post("/", catchAsync(createFinancialAccount));
router.get("/", catchAsync(getAllFinancialAccounts));
router.get("/:id", catchAsync(getFinancialAccount));
router.put("/:id", catchAsync(updateFinancialAccount));
router.delete("/:id", catchAsync(deleteFinancialAccount));
export default router;
