"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const hasPermission_1 = require("../../middlewares/hasPermission");
const pointsProducts_1 = require("../../controllers/admin/pointsProducts");
const router = (0, express_1.Router)();
// ✅ Food picker — returns all active foods, marking which are already enrolled
// GET /points-products/food-select
router.get("/food-select", (0, hasPermission_1.hasPermission)("foods", "read"), (0, catchAsync_1.catchAsync)(pointsProducts_1.getFoodsForPointsSelect));
// ✅ List all foods currently enrolled in the points program
// GET /points-products
router.get("/", (0, hasPermission_1.hasPermission)("foods", "read"), (0, catchAsync_1.catchAsync)(pointsProducts_1.getPointsProducts));
// ✅ Enroll foods — accepts single food OR bulk array in one request
// POST /points-products
// Body: { foodId: "uuid" }             ← single
// Body: { foodIds: ["uuid", "uuid"] }  ← multiple
router.post("/", (0, hasPermission_1.hasPermission)("foods", "update"), (0, catchAsync_1.catchAsync)(pointsProducts_1.enrollPointsProducts));
// ✅ Toggle isActive on / off for one enrollment entry
// PUT /points-products/:id/toggle
router.put("/:id/toggle", (0, hasPermission_1.hasPermission)("foods", "update"), (0, catchAsync_1.catchAsync)(pointsProducts_1.togglePointsProduct));
// ✅ Remove a food from the enrollment list
// DELETE /points-products/:id
router.delete("/:id", (0, hasPermission_1.hasPermission)("foods", "delete"), (0, catchAsync_1.catchAsync)(pointsProducts_1.removePointsProduct));
exports.default = router;
