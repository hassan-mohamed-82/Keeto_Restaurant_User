"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const firstOrderDiscount_1 = require("../../controllers/admin/firstOrderDiscount");
const validation_1 = require("../../middlewares/validation");
const firstOrderDiscount_2 = require("../../validation/admin/firstOrderDiscount");
const router = (0, express_1.Router)();
// CRUD
router.post("/", (0, validation_1.validate)(firstOrderDiscount_2.createFirstOrderDiscountSchema), (0, catchAsync_1.catchAsync)(firstOrderDiscount_1.createFirstOrderDiscount));
router.get("/", (0, catchAsync_1.catchAsync)(firstOrderDiscount_1.getAllFirstOrderDiscounts));
router.get("/:id", (0, catchAsync_1.catchAsync)(firstOrderDiscount_1.getFirstOrderDiscountById));
router.put("/:id", (0, validation_1.validate)(firstOrderDiscount_2.updateFirstOrderDiscountSchema), (0, catchAsync_1.catchAsync)(firstOrderDiscount_1.updateFirstOrderDiscount));
router.delete("/:id", (0, catchAsync_1.catchAsync)(firstOrderDiscount_1.deleteFirstOrderDiscount));
// Toggle active/inactive status
router.put("/:id/toggle-status", (0, catchAsync_1.catchAsync)(firstOrderDiscount_1.toggleFirstOrderDiscountStatus));
// Usage history
router.get("/:id/usages", (0, catchAsync_1.catchAsync)(firstOrderDiscount_1.getFirstOrderDiscountUsages));
exports.default = router;
