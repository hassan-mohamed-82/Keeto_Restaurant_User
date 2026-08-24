import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import {
    getMyRestaurantRatings,
    getMyRestaurantRatingStats
} from "../../controllers/admin/rating";
import { getCustomerRatingsInShift } from "../../controllers/admin/customerRatings";
import { hasPermission } from "../../middlewares/hasPermission";

const router = Router();

router.get("/", catchAsync(getMyRestaurantRatings));
router.get("/stats", catchAsync(getMyRestaurantRatingStats));

router.get("/customer-ratings", hasPermission("orders", "read", true), catchAsync(getCustomerRatingsInShift));

export default router;
