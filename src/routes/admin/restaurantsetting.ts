import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { updateSettings, getSettingsByRestaurantId } from "../../controllers/admin/restaurantsetting";

const router = Router();

router.get("/", catchAsync(getSettingsByRestaurantId));
router.put("/", catchAsync(updateSettings));

export default router;
