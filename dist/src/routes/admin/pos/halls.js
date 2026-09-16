"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../../utils/catchAsync");
const validation_1 = require("../../../middlewares/validation");
const hall_1 = require("../../../validation/admin/pos/hall");
const hall_2 = require("../../../controllers/admin/pos/hall");
const router = (0, express_1.Router)();
router.post("/", (0, validation_1.validate)(hall_1.createHallSchema), (0, catchAsync_1.catchAsync)(hall_2.createHall));
router.get("/", (0, validation_1.validate)(hall_1.hallQuerySchema, "query"), (0, catchAsync_1.catchAsync)(hall_2.getAllHalls));
router.post("/list", (0, validation_1.validate)(hall_1.hallQuerySchema, "body"), (0, catchAsync_1.catchAsync)(hall_2.getAllHalls));
// Branches selection endpoint for Hall
router.get("/branches", (0, catchAsync_1.catchAsync)(hall_2.getBranchesForHall));
router.post("/branches", (0, catchAsync_1.catchAsync)(hall_2.getBranchesForHall));
router.get("/:id", (0, catchAsync_1.catchAsync)(hall_2.getHallById));
router.put("/:id", (0, validation_1.validate)(hall_1.updateHallSchema), (0, catchAsync_1.catchAsync)(hall_2.updateHall));
router.patch("/:id/toggle-status", (0, catchAsync_1.catchAsync)(hall_2.toggleHallStatus));
router.delete("/:id", (0, catchAsync_1.catchAsync)(hall_2.deleteHall));
exports.default = router;
