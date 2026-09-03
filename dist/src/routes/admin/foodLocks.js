"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const foodLocks_1 = require("../../controllers/admin/foodLocks");
const catchAsync_1 = require("../../utils/catchAsync");
const hasPermission_1 = require("../../middlewares/hasPermission");
const router = (0, express_1.Router)();
// جلب حالة قفل منتج أو مكون في جميع الفروع
router.get("/availability", (0, hasPermission_1.hasPermission)("foods", "read"), (0, catchAsync_1.catchAsync)(foodLocks_1.getBranchAvailability));
// قفل منتج في فرع معين
router.put("/:branchId/food/:foodId/lock", (0, hasPermission_1.hasPermission)("foods", "update"), (0, catchAsync_1.catchAsync)(foodLocks_1.toggleBranchFoodLock));
// قفل ingredient لمنتج (سواء globally أو في فرع معين عبر تمرير branchId في الـ body)
router.put("/food/:foodId/ingredient/:ingredientId/lock", (0, hasPermission_1.hasPermission)("foods", "update"), (0, catchAsync_1.catchAsync)(foodLocks_1.toggleIngredientLock));
exports.default = router;
