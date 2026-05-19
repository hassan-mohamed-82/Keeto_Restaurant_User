import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import {
    createPopup,
    getAllPopups,
    getPopupById,
    updatePopup,
    deletePopup,
    togglePopupStatus,
} from "../../controllers/admin/popup";

const router = Router();

// CRUD
router.post("/", catchAsync(createPopup));
router.get("/", catchAsync(getAllPopups));
router.get("/:id", catchAsync(getPopupById));
router.put("/:id", catchAsync(updatePopup));
router.delete("/:id", catchAsync(deletePopup));

// Toggle active/inactive
router.patch("/:id/toggle-status", catchAsync(togglePopupStatus));

export default router;
