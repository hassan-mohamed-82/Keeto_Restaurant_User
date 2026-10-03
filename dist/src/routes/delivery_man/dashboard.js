"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dashboard_1 = require("../../controllers/delivery_man/dashboard");
const validation_1 = require("../../middlewares/validation");
const dashboard_2 = require("../../validation/delivery_man/dashboard");
const router = (0, express_1.Router)();
// Summary: cashOnHand, totalAssignedOrders, deliveredOrders, cancelledRefundOrders
router.get("/", (0, validation_1.validate)(dashboard_2.deliveryManDashboardQuerySchema, "query"), dashboard_1.getDashboard);
exports.default = router;
