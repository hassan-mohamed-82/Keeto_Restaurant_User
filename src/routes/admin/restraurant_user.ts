import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import {
    getRestaurantUsers,
    getBlockedRestaurantUsers,
    updateRestaurantUser,
    deleteRestaurantUser,
    getRestaurantUserById
} from "../../controllers/admin/restraurant_user";

const router = Router();

router.get("/blocked", catchAsync(getBlockedRestaurantUsers));
router.get("/", catchAsync(getRestaurantUsers));
router.get("/:id", catchAsync(getRestaurantUserById));
router.put("/:id", catchAsync(updateRestaurantUser));
router.delete("/:id", catchAsync(deleteRestaurantUser));

export default router;
