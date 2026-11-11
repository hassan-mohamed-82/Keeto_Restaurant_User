import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import {
  updateSettings,
  getSettingsByRestaurantId,
  updateBusyStatus,
  getBusyStatus,
  getOrderNowSetting,
  updateOrderNowSetting,
} from "../../controllers/admin/restaurantsetting";
import { hasRestaurantOpenClosePermission } from "../../middlewares/hasPermission";
import { validate } from "../../middlewares/validation";
import {
  updateBusyStatusSchema,
  updateSettingsSchema,
  updateOrderNowSettingSchema,
} from "../../validation/admin/restaurantsetting";

const router = Router();

router.get("/", catchAsync(getSettingsByRestaurantId));
router.put("/", validate(updateSettingsSchema), hasRestaurantOpenClosePermission, catchAsync(updateSettings));
router.get("/busy-status", catchAsync(getBusyStatus));
router.put("/busy-status", validate(updateBusyStatusSchema), catchAsync(updateBusyStatus));

router.get("/order-now", catchAsync(getOrderNowSetting));
router.put("/order-now", validate(updateOrderNowSettingSchema), catchAsync(updateOrderNowSetting));

export default router;
