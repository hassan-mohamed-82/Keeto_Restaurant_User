import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { validate } from "../../middlewares/validation";
import { createPopupSchema, updatePopupSchema } from "../../validation/admin/popup";
import {
    createPopup,
    getAllPopups,
    getPopupById,
    updatePopup,
    deletePopup,
    togglePopupStatus,
    getLinkTargetOptions,
} from "../../controllers/admin/popup";

const router = Router();

// Options / Link target constants & items
router.get("/link-options", catchAsync(getLinkTargetOptions));

// CRUD
router.post("/", validate(createPopupSchema), catchAsync(createPopup));
router.get("/", catchAsync(getAllPopups));
router.get("/:id", catchAsync(getPopupById));
router.put("/:id", validate(updatePopupSchema), catchAsync(updatePopup));
router.delete("/:id", catchAsync(deletePopup));

// Toggle active/inactive
router.patch("/:id/toggle-status", catchAsync(togglePopupStatus));

export default router;
