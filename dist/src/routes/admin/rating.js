"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const rating_1 = require("../../controllers/admin/rating");
const router = (0, express_1.Router)();
router.get("/", (0, catchAsync_1.catchAsync)(rating_1.getMyRestaurantRatings));
router.get("/stats", (0, catchAsync_1.catchAsync)(rating_1.getMyRestaurantRatingStats));
exports.default = router;
