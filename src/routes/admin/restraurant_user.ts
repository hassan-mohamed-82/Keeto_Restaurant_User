import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { validate } from "../../middlewares/validation";
import { getUserStatsParamsSchema } from "../../validation/admin/user";
import {
    getRestaurantUsers,
    getBlockedRestaurantUsers,
    updateRestaurantUser,
    deleteRestaurantUser,
    getRestaurantUserById,
    getRestaurantUserStats,
} from "../../controllers/admin/restraurant_user";

const router = Router();

router.get("/blocked", catchAsync(getBlockedRestaurantUsers));
router.get("/", catchAsync(getRestaurantUsers));
router.get("/:id/stats", validate(getUserStatsParamsSchema, "params"), catchAsync(getRestaurantUserStats));
router.get("/:id", catchAsync(getRestaurantUserById));
router.put("/:id", catchAsync(updateRestaurantUser));
router.delete("/:id", catchAsync(deleteRestaurantUser));

export default router;

