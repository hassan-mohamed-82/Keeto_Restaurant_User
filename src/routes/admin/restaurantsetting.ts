import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { updateSettings, getSettingsByRestaurantId } from "../../controllers/admin/restaurantsetting";

const router = Router();

router.get("/:restaurantId", catchAsync(getSettingsByRestaurantId));
router.put("/:restaurantId", catchAsync(updateSettings));

export default router;
