import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { updateSettings, getSettingsByRestaurantId, updateBusyStatus, getBusyStatus } from "../../controllers/admin/restaurantsetting";
import { validate } from "../../middlewares/validation";
import { updateBusyStatusSchema, updateSettingsSchema } from "../../validation/admin/restaurantsetting";

const router = Router();

router.get("/", catchAsync(getSettingsByRestaurantId));
router.put("/", validate(updateSettingsSchema), catchAsync(updateSettings));
router.get("/busy-status", catchAsync(getBusyStatus));
router.put("/busy-status", validate(updateBusyStatusSchema), catchAsync(updateBusyStatus));

export default router;
