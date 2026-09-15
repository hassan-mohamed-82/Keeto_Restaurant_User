"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../../utils/catchAsync");
const validation_1 = require("../../../middlewares/validation");
const foodOffer_1 = require("../../../validation/admin/foodOffer");
const offer_1 = require("../../../controllers/admin/pos/offer");
const router = (0, express_1.Router)();
// ==========================================
// 1. View Offers List (where offer_price IS NOT NULL)
// ==========================================
router.get("/", (0, validation_1.validate)(foodOffer_1.getFoodOfferQuerySchema, "query"), (0, catchAsync_1.catchAsync)(offer_1.getOffers));
router.post("/list", (0, validation_1.validate)(foodOffer_1.getFoodOfferQuerySchema, "body"), (0, catchAsync_1.catchAsync)(offer_1.getOffers));
// ==========================================
// 2. Available Foods List (where offer_price IS NULL)
// ==========================================
router.get("/available-foods", (0, validation_1.validate)(foodOffer_1.getFoodOfferQuerySchema, "query"), (0, catchAsync_1.catchAsync)(offer_1.getFoodsWithoutOffer));
router.post("/available-foods", (0, validation_1.validate)(foodOffer_1.getFoodOfferQuerySchema, "body"), (0, catchAsync_1.catchAsync)(offer_1.getFoodsWithoutOffer));
// ==========================================
// 3. Store / Create Offer
// ==========================================
router.post("/", (0, validation_1.validate)(foodOffer_1.storeFoodOfferSchema), (0, catchAsync_1.catchAsync)(offer_1.storeOffer));
// ==========================================
// 4. Update Offer
// ==========================================
router.put("/:foodId", (0, validation_1.validate)(foodOffer_1.updateFoodOfferSchema), (0, catchAsync_1.catchAsync)(offer_1.updateOffer));
router.put("/", (0, validation_1.validate)(foodOffer_1.updateFoodOfferSchema), (0, catchAsync_1.catchAsync)(offer_1.updateOffer));
// ==========================================
// 5. Delete Offer (Reset offer columns to null)
// ==========================================
router.delete("/:foodId", (0, catchAsync_1.catchAsync)(offer_1.deleteOffer));
router.delete("/", (0, catchAsync_1.catchAsync)(offer_1.deleteOffer));
// ==========================================
// 6. Filter by ID (Offer Details)
// ==========================================
router.get("/:foodId", (0, catchAsync_1.catchAsync)(offer_1.getOfferByFoodId));
router.post("/filter-by-id", (0, catchAsync_1.catchAsync)(offer_1.getOfferByFoodId));
router.post("/:foodId/details", (0, catchAsync_1.catchAsync)(offer_1.getOfferByFoodId));
exports.default = router;
