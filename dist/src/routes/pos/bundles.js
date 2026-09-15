"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../../utils/catchAsync");
const validation_1 = require("../../../middlewares/validation");
const offers_1 = require("../../../validation/admin/offers");
const bundle_1 = require("../../../controllers/admin/pos/bundle");
const router = (0, express_1.Router)();
router.post("/", (0, validation_1.validate)(offers_1.createOfferSchema), (0, catchAsync_1.catchAsync)(bundle_1.createOffer));
router.get("/", (0, catchAsync_1.catchAsync)(bundle_1.getAllOffers));
router.post("/list", (0, catchAsync_1.catchAsync)(bundle_1.getAllOffers));
// Options for dropdown selection
router.get("/branches", (0, catchAsync_1.catchAsync)(bundle_1.getBranches));
router.post("/branches", (0, catchAsync_1.catchAsync)(bundle_1.getBranches));
router.get("/foods", (0, validation_1.validate)(offers_1.getOfferFoodsSchema, "query"), (0, catchAsync_1.catchAsync)(bundle_1.getFoods));
router.post("/foods", (0, validation_1.validate)(offers_1.getOfferFoodsSchema, "body"), (0, catchAsync_1.catchAsync)(bundle_1.getFoods));
// Specific offer branches & foods
router.get("/:id/branches", (0, catchAsync_1.catchAsync)(bundle_1.getOfferBranches));
router.post("/:id/branches", (0, catchAsync_1.catchAsync)(bundle_1.getOfferBranches));
router.get("/:id/foods", (0, catchAsync_1.catchAsync)(bundle_1.getOfferFoods));
router.post("/:id/foods", (0, catchAsync_1.catchAsync)(bundle_1.getOfferFoods));
// Offer CRUD
router.get("/:id", (0, catchAsync_1.catchAsync)(bundle_1.getOfferById));
router.post("/:id/details", (0, catchAsync_1.catchAsync)(bundle_1.getOfferById));
router.put("/:id", (0, validation_1.validate)(offers_1.updateOfferSchema), (0, catchAsync_1.catchAsync)(bundle_1.updateOffer));
router.patch("/:id/toggle-status", (0, catchAsync_1.catchAsync)(bundle_1.toggleOfferStatus));
router.delete("/:id", (0, catchAsync_1.catchAsync)(bundle_1.deleteOffer));
exports.default = router;
