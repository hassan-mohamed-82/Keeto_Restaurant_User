import { Router } from "express";
import { 
    createExpenseCategory, 
    getAllExpenseCategories, 
    getExpenseCategoryById, 
    updateExpenseCategory, 
    deleteExpenseCategory 
} from "../../controllers/admin/expenseCategory";
import { catchAsync } from "../../utils/catchAsync";

const router = Router();

router.post("/", catchAsync(createExpenseCategory));
router.get("/", catchAsync(getAllExpenseCategories));
router.get("/:id", catchAsync(getExpenseCategoryById));
router.put("/:id", catchAsync(updateExpenseCategory));
router.delete("/:id", catchAsync(deleteExpenseCategory));

export default router;