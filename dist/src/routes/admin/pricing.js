"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const pricing_controller_1 = require("../../controllers/admin/pricing.controller");
const router = (0, express_1.Router)();
router.get("/select", pricing_controller_1.getActiveBranchWithServiceModule);
// Endpoint 1: Upsert food item along with branch overrides & channel pricing
router.post("/upsert-food", pricing_controller_1.upsertFoodWithPricing);
// Endpoint 2: Get dynamic menu with COALESCE pricing hierarchy for a specific branch & service module
router.get("/dynamic-menu", pricing_controller_1.getMenuWithDynamicPricing);
// Endpoint 3: Get food list (with variations & options) for the pricing UI
router.get("/food-for-pricing", pricing_controller_1.getFoodForPricing);
// Endpoint 4: Upsert product (food) channel pricing — accepts a single object or an array
router.post("/product-channel", pricing_controller_1.upsertProductChannelPricing);
// Endpoint 5: Upsert variant channel pricing — accepts a single object or an array
router.post("/variant-channel", pricing_controller_1.upsertVariantChannelPricing);
exports.default = router;
