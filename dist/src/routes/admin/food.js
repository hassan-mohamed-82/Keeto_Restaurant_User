"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const hasPermission_1 = require("../../middlewares/hasPermission");
const food_1 = require("../../controllers/admin/food");
const router = (0, express_1.Router)();
// ✅ Select data - يحتاج صلاحية read فقط
router.get("/select", (0, hasPermission_1.hasPermission)("foods", "read"), (0, catchAsync_1.catchAsync)(food_1.getFoodSelectData));
// ✅ Create food - يحتاج صلاحية create
router.post("/", (0, hasPermission_1.hasPermission)("foods", "create"), (0, catchAsync_1.catchAsync)(food_1.createFood));
// ✅ Get all foods - يحتاج صلاحية read
router.get("/", (0, hasPermission_1.hasPermission)("foods", "read"), (0, catchAsync_1.catchAsync)(food_1.getAllFoods));
// ✅ Get food by id - يحتاج صلاحية read
router.get("/:id", (0, hasPermission_1.hasPermission)("foods", "read"), (0, catchAsync_1.catchAsync)(food_1.getFoodById));
// ✅ Update food - يحتاج صلاحية update
router.put("/:id", (0, hasPermission_1.hasPermission)("foods", "update"), (0, catchAsync_1.catchAsync)(food_1.updateFood));
// ✅ Delete food - يحتاج صلاحية delete
router.delete("/:id", (0, hasPermission_1.hasPermission)("foods", "delete"), (0, catchAsync_1.catchAsync)(food_1.deleteFood));
// ✅ Assign ingredients - يحتاج صلاحية update
router.post("/assign-ingredients/:id", (0, hasPermission_1.hasPermission)("foods", "update"), (0, catchAsync_1.catchAsync)(food_1.assignIngredientsToFood));
// ✅ Get recipe - يحتاج صلاحية read
router.get("/recipe/:id", (0, hasPermission_1.hasPermission)("foods", "read"), (0, catchAsync_1.catchAsync)(food_1.getFoodRecipe));
// ✅ Toggle variation status - يحتاج صلاحية update
router.put("/variation/:id/status", (0, hasPermission_1.hasPermission)("foods", "update"), (0, catchAsync_1.catchAsync)(food_1.toggleVariationStatus));
// ✅ Toggle option status - يحتاج صلاحية update
router.put("/option/:id/status", (0, hasPermission_1.hasPermission)("foods", "update"), (0, catchAsync_1.catchAsync)(food_1.toggleVariationOptionStatus));
// ✅ Change food status - يحتاج صلاحية update
router.put("/status/:id", (0, hasPermission_1.hasPermission)("foods", "update"), (0, catchAsync_1.catchAsync)(food_1.changeFoodStatus));
exports.default = router;
