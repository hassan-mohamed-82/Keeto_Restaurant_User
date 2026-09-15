"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../../utils/catchAsync");
const validation_1 = require("../../../middlewares/validation");
const taxType_1 = require("../../../validation/admin/taxType");
const taxType_2 = require("../../../controllers/admin/pos/taxType");
const router = (0, express_1.Router)();
// Show TaxType (automatically scoped to req.user.restaurantId)
router.get("/", (0, catchAsync_1.catchAsync)(taxType_2.getTaxType));
router.get("/:restrauntid", (0, catchAsync_1.catchAsync)(taxType_2.getTaxType));
// Create if null, update if exist (Upsert - strictly uses req.user.restaurantId)
router.post("/", (0, validation_1.validate)(taxType_1.upsertTaxTypeSchema), (0, catchAsync_1.catchAsync)(taxType_2.upsertTaxType));
router.put("/", (0, validation_1.validate)(taxType_1.upsertTaxTypeSchema), (0, catchAsync_1.catchAsync)(taxType_2.upsertTaxType));
router.post("/upsert", (0, validation_1.validate)(taxType_1.upsertTaxTypeSchema), (0, catchAsync_1.catchAsync)(taxType_2.upsertTaxType));
router.post("/:restrauntid", (0, validation_1.validate)(taxType_1.upsertTaxTypeSchema), (0, catchAsync_1.catchAsync)(taxType_2.upsertTaxType));
router.put("/:restrauntid", (0, validation_1.validate)(taxType_1.upsertTaxTypeSchema), (0, catchAsync_1.catchAsync)(taxType_2.upsertTaxType));
exports.default = router;
