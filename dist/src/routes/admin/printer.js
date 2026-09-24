"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const validation_1 = require("../../middlewares/validation");
const printer_1 = require("../../validation/admin/printer");
const printer_2 = require("../../controllers/admin/printer");
const router = (0, express_1.Router)();
// Create
router.post("/", (0, validation_1.validate)(printer_1.createPrinterSchema), (0, catchAsync_1.catchAsync)(printer_2.createPrinter));
// Get all (GET with query params or POST with body for complex filters)
router.get("/", (0, validation_1.validate)(printer_1.printerQuerySchema, "query"), (0, catchAsync_1.catchAsync)(printer_2.getAllPrinters));
// Single record
router.get("/:id", (0, catchAsync_1.catchAsync)(printer_2.getPrinterById));
// Update
router.put("/:id", (0, validation_1.validate)(printer_1.updatePrinterSchema), (0, catchAsync_1.catchAsync)(printer_2.updatePrinter));
// Delete
router.delete("/:id", (0, catchAsync_1.catchAsync)(printer_2.deletePrinter));
exports.default = router;
