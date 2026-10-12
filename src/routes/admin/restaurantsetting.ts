import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { updateSettings, getSettingsByRestaurantId, updateBusyStatus, getBusyStatus } from "../../controllers/admin/restaurantsetting";
import { validate } from "../../middlewares/validation";
import { updateBusyStatusSchema } from "../../validation/admin/restaurantsetting";

const router = Router();

router.get("/", catchAsync(getSettingsByRestaurantId));
router.put("/", catchAsync(updateSettings));
router.get("/busy-status", catchAsync(getBusyStatus));
router.put("/busy-status", validate(updateBusyStatusSchema), catchAsync(updateBusyStatus));

export default router;
