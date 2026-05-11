import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import {
    getMyRestaurantRatings,
    getMyRestaurantRatingStats
} from "../../controllers/admin/rating";

const router = Router();

router.get("/", catchAsync(getMyRestaurantRatings));
router.get("/stats", catchAsync(getMyRestaurantRatingStats));

export default router;
