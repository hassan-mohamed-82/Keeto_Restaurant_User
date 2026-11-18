"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const hasPermission_1 = require("../../middlewares/hasPermission");
const validation_1 = require("../../middlewares/validation");
const weightRequests_1 = require("../../controllers/admin/weightRequests");
const food_1 = require("../../controllers/admin/food");
const weightRequests_2 = require("../../validation/admin/weightRequests");
const router = (0, express_1.Router)();
// 1. Paginated list of weight requests
router.get("/", (0, hasPermission_1.hasPermission)("order", "read", true), (0, validation_1.validate)(weightRequests_2.getWeightRequestsQuerySchema, "query"), (0, catchAsync_1.catchAsync)(weightRequests_1.getWeightRequests));
// 1.5 Get active and in-stock foods with variations and addons for staff selection
router.get("/available-foods", (0, hasPermission_1.hasPermission)("order", "read", true), (0, catchAsync_1.catchAsync)(food_1.getActiveInStockFoods));
// 2. Details of a single weight request
router.get("/:id", (0, hasPermission_1.hasPermission)("order", "read", true), (0, validation_1.validate)(weightRequests_2.getWeightRequestParamSchema, "params"), (0, catchAsync_1.catchAsync)(weightRequests_1.getWeightRequestById));
// 3. PUT weight or unavailable for customer item
router.put("/:id/items/:cartItemId", (0, hasPermission_1.hasPermission)("order", "update", true), (0, validation_1.validate)(weightRequests_2.patchWeightItemParamSchema, "params"), (0, validation_1.validate)(weightRequests_2.patchWeightItemBodySchema, "body"), (0, catchAsync_1.catchAsync)(weightRequests_1.patchCustomerItemWeight));
// 4. PUT replace restaurant items
router.put("/:id/items", (0, hasPermission_1.hasPermission)("order", "update", true), (0, validation_1.validate)(weightRequests_2.getWeightRequestParamSchema, "params"), (0, validation_1.validate)(weightRequests_2.replaceRestaurantItemsSchema, "body"), (0, catchAsync_1.catchAsync)(weightRequests_1.replaceRestaurantItems));
// 5. Confirm weight request (sends to customer)
router.post("/:id/confirm", (0, hasPermission_1.hasPermission)("order", "update", true), (0, validation_1.validate)(weightRequests_2.getWeightRequestParamSchema, "params"), (0, validation_1.validate)(weightRequests_2.confirmWeightRequestSchema, "body"), (0, catchAsync_1.catchAsync)(weightRequests_1.confirmWeightRequest));
// 6. Reject weight request
router.post("/:id/reject", (0, hasPermission_1.hasPermission)("order", "update", true), (0, validation_1.validate)(weightRequests_2.getWeightRequestParamSchema, "params"), (0, validation_1.validate)(weightRequests_2.rejectWeightRequestSchema, "body"), (0, catchAsync_1.catchAsync)(weightRequests_1.rejectWeightRequest));
exports.default = router;
