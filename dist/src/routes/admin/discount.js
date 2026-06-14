"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const discount_1 = require("../../controllers/admin/discount");
const router = (0, express_1.Router)();
// CRUD
router.post("/", (0, catchAsync_1.catchAsync)(discount_1.createDiscount));
router.get("/", (0, catchAsync_1.catchAsync)(discount_1.getAllDiscounts));
router.get("/:id", (0, catchAsync_1.catchAsync)(discount_1.getDiscountById));
router.put("/:id", (0, catchAsync_1.catchAsync)(discount_1.updateDiscount));
router.put("/:id/toggle-status", (0, catchAsync_1.catchAsync)(discount_1.toggleDiscountStatus));
router.delete("/:id", (0, catchAsync_1.catchAsync)(discount_1.deleteDiscount));
exports.default = router;
