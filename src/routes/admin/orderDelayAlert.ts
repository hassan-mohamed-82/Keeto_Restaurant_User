import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { validate } from "../../middlewares/validation";
import {
    createOrderDelayAlertGroupSchema,
    updateOrderDelayAlertGroupSchema,
} from "../../validation/admin/orderDelayAlert";
import {
    createAlertGroup,
    getAllAlertGroups,
    getAlertGroupById,
    updateAlertGroup,
    toggleAlertGroupStatus,
    deleteAlertGroup,
} from "../../controllers/admin/orderDelayAlert";

const router = Router();

// 1. Create alert group
router.post("/", validate(createOrderDelayAlertGroupSchema), catchAsync(createAlertGroup));

// 2. Get all alert groups
router.get("/", catchAsync(getAllAlertGroups));

// 3. Get alert group by ID
router.get("/:id", catchAsync(getAlertGroupById));

// 4. Update alert group
router.put("/:id", validate(updateOrderDelayAlertGroupSchema), catchAsync(updateAlertGroup));

// 5. Toggle active status
router.put("/:id/toggle-status", catchAsync(toggleAlertGroupStatus));

// 6. Delete alert group
router.delete("/:id", catchAsync(deleteAlertGroup));

export default router;
