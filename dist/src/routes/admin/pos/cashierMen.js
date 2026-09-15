"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../../utils/catchAsync");
const validation_1 = require("../../../middlewares/validation");
const cashierMan_1 = require("../../../validation/admin/pos/cashierMan");
const cashierMan_2 = require("../../../controllers/admin/pos/cashierMan");
const router = (0, express_1.Router)();
router.post("/", (0, validation_1.validate)(cashierMan_1.createCashierManSchema), (0, catchAsync_1.catchAsync)(cashierMan_2.createCashierMan));
router.get("/", (0, validation_1.validate)(cashierMan_1.cashierManQuerySchema, "query"), (0, catchAsync_1.catchAsync)(cashierMan_2.getAllCashierMen));
router.post("/list", (0, validation_1.validate)(cashierMan_1.cashierManQuerySchema, "body"), (0, catchAsync_1.catchAsync)(cashierMan_2.getAllCashierMen));
// Branches & report permissions endpoint for Cashier
router.get("/branches", (0, catchAsync_1.catchAsync)(cashierMan_2.getBranchesAndPermissionsForCashier));
router.post("/branches", (0, catchAsync_1.catchAsync)(cashierMan_2.getBranchesAndPermissionsForCashier));
router.get("/:id", (0, catchAsync_1.catchAsync)(cashierMan_2.getCashierManById));
router.put("/:id", (0, validation_1.validate)(cashierMan_1.updateCashierManSchema), (0, catchAsync_1.catchAsync)(cashierMan_2.updateCashierMan));
router.patch("/:id/toggle-status", (0, catchAsync_1.catchAsync)(cashierMan_2.toggleCashierManStatus));
router.delete("/:id", (0, catchAsync_1.catchAsync)(cashierMan_2.deleteCashierMan));
exports.default = router;
