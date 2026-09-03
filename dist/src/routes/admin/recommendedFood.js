"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const hasPermission_1 = require("../../middlewares/hasPermission");
const recommendedFood_1 = require("../../controllers/admin/recommendedFood");
const router = (0, express_1.Router)();
// ✅ Get all foods for select dropdown (returns id, name, nameAr, nameFr, image, price)
router.get("/foods-select", (0, hasPermission_1.hasPermission)("foods", "read"), (0, catchAsync_1.catchAsync)(recommendedFood_1.getFoodsForSelect));
// ✅ Get all recommended foods pairings (includes basic food and its list of recommended foods)
router.get("/", (0, hasPermission_1.hasPermission)("foods", "read"), (0, catchAsync_1.catchAsync)(recommendedFood_1.getAllRecommendedFoods));
// ✅ Assign / update recommended products for a basic food item
router.post("/assign", (0, hasPermission_1.hasPermission)("foods", "update"), (0, catchAsync_1.catchAsync)(recommendedFood_1.assignRecommendedProducts));
// ✅ Get recommended products for a specific basic food item
router.get("/:foodId", (0, hasPermission_1.hasPermission)("foods", "read"), (0, catchAsync_1.catchAsync)(recommendedFood_1.getRecommendedProductsByFoodId));
// ✅ Remove a recommended product link
router.delete("/:foodId/:recommendedFoodId", (0, hasPermission_1.hasPermission)("foods", "delete"), (0, catchAsync_1.catchAsync)(recommendedFood_1.removeRecommendedProduct));
exports.default = router;
