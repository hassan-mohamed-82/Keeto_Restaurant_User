import { Router } from "express";
import { createFinancialAccount, updateFinancialAccount, 
    getAllFinancialAccounts, getFinancialAccount, deleteFinancialAccount,
    selectbranch } from "../../controllers/admin/FinancialAccount";
import { catchAsync } from "../../utils/catchAsync";
const router = Router();
router.get("/select", catchAsync(selectbranch));
router.post("/", catchAsync(createFinancialAccount));
router.put("/", catchAsync(updateFinancialAccount));
router.get("/", catchAsync(getAllFinancialAccounts));
router.get("/:id", catchAsync(getFinancialAccount));
router.delete("/:id", catchAsync(deleteFinancialAccount));
export default router;
