import { Router } from "express";
import { catchAsync } from "../../../utils/catchAsync";
import { validate } from "../../../middlewares/validation";
import {
    createCashierManSchema,
    updateCashierManSchema,
    cashierManQuerySchema,
} from "../../../validation/admin/pos/cashierMan";
import {
    createCashierMan,
    getAllCashierMen,
    getBranchesAndPermissionsForCashier,
    getCashierManById,
    updateCashierMan,
    deleteCashierMan,
    toggleCashierManStatus,
} from "../../../controllers/admin/pos/cashierMan";

const router = Router();

router.post("/", validate(createCashierManSchema), catchAsync(createCashierMan));
router.get("/", validate(cashierManQuerySchema, "query"), catchAsync(getAllCashierMen));
router.post("/list", validate(cashierManQuerySchema, "body"), catchAsync(getAllCashierMen));

// Branches & report permissions endpoint for Cashier
router.get("/branches", catchAsync(getBranchesAndPermissionsForCashier));
router.post("/branches", catchAsync(getBranchesAndPermissionsForCashier));

router.get("/:id", catchAsync(getCashierManById));
router.put("/:id", validate(updateCashierManSchema), catchAsync(updateCashierMan));
router.patch("/:id/toggle-status", catchAsync(toggleCashierManStatus));
router.delete("/:id", catchAsync(deleteCashierMan));

export default router;
