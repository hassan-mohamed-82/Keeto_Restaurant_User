import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { validate } from "../../middlewares/validation";
import {
    createRatingRequestSchema,
    getRatingRequestsQuerySchema,
} from "../../validation/admin/rating";
import {
    getMyRestaurantRatings,
    getMyRestaurantRatingStats,
    createRatingModerationRequest,
    getMyRatingModerationRequests,
} from "../../controllers/admin/rating";
import { getCustomerRatingsInShift } from "../../controllers/admin/customerRatings";
import { hasPermission } from "../../middlewares/hasPermission";

const router = Router();

router.get("/", catchAsync(getMyRestaurantRatings));
router.get("/stats", catchAsync(getMyRestaurantRatingStats));

// ─── Moderation Requests Endpoints (طلب تعديل / حذف تقييم) ───
router.post("/requests", validate(createRatingRequestSchema, "body"), catchAsync(createRatingModerationRequest));
router.get("/requests", validate(getRatingRequestsQuerySchema, "query"), catchAsync(getMyRatingModerationRequests));

router.get("/customer-ratings", hasPermission("orders", "read", true), catchAsync(getCustomerRatingsInShift));

export default router;

