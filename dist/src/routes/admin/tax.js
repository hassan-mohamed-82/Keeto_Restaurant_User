"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const validation_1 = require("../../middlewares/validation");
const tax_1 = require("../../validation/admin/tax");
const tax_2 = require("../../controllers/admin/tax");
const router = (0, express_1.Router)();
// One route per controller (filters go in the query string)
router.get("/options", (0, catchAsync_1.catchAsync)(tax_2.getTaxListOptions));
router.get("/branches", (0, catchAsync_1.catchAsync)(tax_2.getBranches)); // ?taxId=
router.get("/subcategories", (0, catchAsync_1.catchAsync)(tax_2.getSubcategories));
router.get("/foods", (0, catchAsync_1.catchAsync)(tax_2.getFoods)); // ?taxId=&subcategoryId=
router.post("/", (0, validation_1.validate)(tax_1.createTaxSchema), (0, catchAsync_1.catchAsync)(tax_2.createTax));
router.get("/", (0, catchAsync_1.catchAsync)(tax_2.getAllTaxes)); // ?status=&source=&taxType=&modules=&moduleType=&search=&page=&limit=&all=
router.get("/:id", (0, catchAsync_1.catchAsync)(tax_2.getTaxById));
router.put("/:id", (0, validation_1.validate)(tax_1.updateTaxSchema), (0, catchAsync_1.catchAsync)(tax_2.updateTax));
router.patch("/:id/toggle-status", (0, catchAsync_1.catchAsync)(tax_2.toggleTaxStatus));
router.delete("/:id", (0, catchAsync_1.catchAsync)(tax_2.deleteTax));
exports.default = router;
