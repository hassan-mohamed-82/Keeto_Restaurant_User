"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const validation_1 = require("../../middlewares/validation");
const rating_1 = require("../../validation/admin/rating");
const rating_2 = require("../../controllers/admin/rating");
const customerRatings_1 = require("../../controllers/admin/customerRatings");
const hasPermission_1 = require("../../middlewares/hasPermission");
const router = (0, express_1.Router)();
router.get("/", (0, catchAsync_1.catchAsync)(rating_2.getMyRestaurantRatings));
router.get("/stats", (0, catchAsync_1.catchAsync)(rating_2.getMyRestaurantRatingStats));
// ─── Moderation Requests Endpoints (طلب تعديل / حذف تقييم) ───
router.post("/requests", (0, validation_1.validate)(rating_1.createRatingRequestSchema, "body"), (0, catchAsync_1.catchAsync)(rating_2.createRatingModerationRequest));
router.get("/requests", (0, validation_1.validate)(rating_1.getRatingRequestsQuerySchema, "query"), (0, catchAsync_1.catchAsync)(rating_2.getMyRatingModerationRequests));
router.get("/customer-ratings", (0, hasPermission_1.hasPermission)("orders", "read", true), (0, catchAsync_1.catchAsync)(customerRatings_1.getCustomerRatingsInShift));
exports.default = router;
