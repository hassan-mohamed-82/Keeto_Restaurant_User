import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { validate } from "../../middlewares/validation";
import { getPaymentTransactionsQuerySchema } from "../../validation/admin/paymentTransactions";
import {
    getPaymentTransactions,
    getPaymentTransactionDetails,
} from "../../controllers/admin/paymentTransactions";
import { hasPermission } from "../../middlewares/hasPermission";

const router = Router();

router.get(
    "/",
    hasPermission("order", "read"),
    validate(getPaymentTransactionsQuerySchema, "query"),
    catchAsync(getPaymentTransactions)
);

router.get(
    "/:id",
    hasPermission("order", "read"),
    catchAsync(getPaymentTransactionDetails)
);

export default router;
