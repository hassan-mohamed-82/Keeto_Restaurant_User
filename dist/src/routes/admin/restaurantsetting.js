"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const restaurantsetting_1 = require("../../controllers/admin/restaurantsetting");
const router = (0, express_1.Router)();
router.get("/", (0, catchAsync_1.catchAsync)(restaurantsetting_1.getSettingsByRestaurantId));
router.put("/", (0, catchAsync_1.catchAsync)(restaurantsetting_1.updateSettings));
exports.default = router;
