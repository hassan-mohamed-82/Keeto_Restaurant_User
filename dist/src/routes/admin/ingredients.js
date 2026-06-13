"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const catchAsync_1 = require("../../utils/catchAsync");
const express_1 = require("express");
const hasPermission_1 = require("../../middlewares/hasPermission");
const ingredients_1 = require("../../controllers/admin/ingredients");
const router = (0, express_1.Router)();
// ✅ Get select data - يحتاج صلاحية read (foods module)
router.get("/select", (0, hasPermission_1.hasPermission)("foods", "read"), (0, catchAsync_1.catchAsync)(ingredients_1.getallactiveingredientscategory));
// ✅ Create ingredient - يحتاج صلاحية create (foods module)
router.post("/", (0, hasPermission_1.hasPermission)("foods", "create"), (0, catchAsync_1.catchAsync)(ingredients_1.createIngredient));
// ✅ Get all ingredients - يحتاج صلاحية read (foods module)
router.get("/", (0, hasPermission_1.hasPermission)("foods", "read"), (0, catchAsync_1.catchAsync)(ingredients_1.getIngredients));
// ✅ Get ingredient by id - يحتاج صلاحية read (foods module)
router.get("/:id", (0, hasPermission_1.hasPermission)("foods", "read"), (0, catchAsync_1.catchAsync)(ingredients_1.getIngredientById));
// ✅ Get foods by ingredient - يحتاج صلاحية read (foods module)
router.get("/foods/:id", (0, hasPermission_1.hasPermission)("foods", "read"), (0, catchAsync_1.catchAsync)(ingredients_1.getFoodsByIngredient));
// ✅ Update ingredient - يحتاج صلاحية update (foods module)
router.put("/:id", (0, hasPermission_1.hasPermission)("foods", "update"), (0, catchAsync_1.catchAsync)(ingredients_1.updateIngredient));
// ✅ Toggle stock - يحتاج صلاحية update (foods module)
router.put("/stock/:id", (0, hasPermission_1.hasPermission)("foods", "update"), (0, catchAsync_1.catchAsync)(ingredients_1.toggleIngredientStock));
// ✅ Delete ingredient - يحتاج صلاحية delete (foods module)
router.delete("/:id", (0, hasPermission_1.hasPermission)("foods", "delete"), (0, catchAsync_1.catchAsync)(ingredients_1.deleteIngredient));
exports.default = router;
