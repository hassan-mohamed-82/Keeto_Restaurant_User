import { Router } from "express";
import { catchAsync } from "../../../utils/catchAsync";
import { validate } from "../../../middlewares/validation";
import { createShiftSchema, updateShiftSchema } from "../../../validation/admin/shifts";
import {
    createShift,
    getAllShifts,
    getShiftById,
    updateShift,
    deleteShift,
    toggleShiftStatus,
    getBranches,
} from "../../../controllers/admin/pos/shifts";

const router = Router();

router.post("/", validate(createShiftSchema), catchAsync(createShift));
router.get("/", catchAsync(getAllShifts));
router.post("/list", catchAsync(getAllShifts));
router.post("/list-shifts", catchAsync(getAllShifts));
router.get("/branch/:branch_id", catchAsync(getAllShifts));
router.post("/branch/:branch_id", catchAsync(getAllShifts));
router.get("/branches", catchAsync(getBranches));
router.post("/branches", catchAsync(getBranches));
router.get("/:id", catchAsync(getShiftById));
router.put("/:id", validate(updateShiftSchema), catchAsync(updateShift));
router.patch("/:id/toggle-status", catchAsync(toggleShiftStatus));
router.delete("/:id", catchAsync(deleteShift));

export default router;
