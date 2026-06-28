import { Router } from "express";
import { 
    createExpense, 
    getAllExpenses, 
    getExpenseById, 
    updateExpense, 
    deleteExpense,
    selectdata
} from "../../controllers/admin/expense";
import { catchAsync } from "../../utils/catchAsync";

const router = Router();

router.get("/select", catchAsync(selectdata));
router.post("/", catchAsync(createExpense));
router.get("/", catchAsync(getAllExpenses));
router.get("/:id", catchAsync(getExpenseById));
router.put("/:id", catchAsync(updateExpense));
router.delete("/:id", catchAsync(deleteExpense));

export default router;