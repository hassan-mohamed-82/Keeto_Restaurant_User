"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../../utils/catchAsync");
const validation_1 = require("../../../middlewares/validation");
const captainOrder_1 = require("../../../validation/admin/pos/captainOrder");
const captainOrder_2 = require("../../../controllers/admin/pos/captainOrder");
const router = (0, express_1.Router)();
router.post("/", (0, validation_1.validate)(captainOrder_1.createCaptainOrderSchema), (0, catchAsync_1.catchAsync)(captainOrder_2.createCaptainOrder));
router.get("/", (0, validation_1.validate)(captainOrder_1.captainOrderQuerySchema, "query"), (0, catchAsync_1.catchAsync)(captainOrder_2.getAllCaptainOrders));
router.post("/list", (0, validation_1.validate)(captainOrder_1.captainOrderQuerySchema, "body"), (0, catchAsync_1.catchAsync)(captainOrder_2.getAllCaptainOrders));
// Branches selection endpoint for Captain
router.get("/branches", (0, catchAsync_1.catchAsync)(captainOrder_2.getBranchesForCaptain));
router.post("/branches", (0, catchAsync_1.catchAsync)(captainOrder_2.getBranchesForCaptain));
router.get("/:id", (0, catchAsync_1.catchAsync)(captainOrder_2.getCaptainOrderById));
router.put("/:id", (0, validation_1.validate)(captainOrder_1.updateCaptainOrderSchema), (0, catchAsync_1.catchAsync)(captainOrder_2.updateCaptainOrder));
router.patch("/:id/toggle-status", (0, catchAsync_1.catchAsync)(captainOrder_2.toggleCaptainOrderStatus));
router.delete("/:id", (0, catchAsync_1.catchAsync)(captainOrder_2.deleteCaptainOrder));
exports.default = router;
