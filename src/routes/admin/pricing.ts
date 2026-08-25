import { Router } from "express";
import {
    upsertFoodWithPricing,
    getMenuWithDynamicPricing,
    getFoodForPricing,
    upsertProductChannelPricing,
    upsertVariantChannelPricing,
} from "../../controllers/admin/pricing.controller";

const router = Router();

// Endpoint 1: Upsert food item along with branch overrides & channel pricing
router.post("/upsert-food", upsertFoodWithPricing);

// Endpoint 2: Get dynamic menu with COALESCE pricing hierarchy for a specific branch & service module
router.get("/dynamic-menu", getMenuWithDynamicPricing);

// Endpoint 3: Get food list (with variations & options) for the pricing UI
router.get("/food-for-pricing", getFoodForPricing);

// Endpoint 4: Upsert product (food) channel pricing — accepts a single object or an array
router.post("/product-channel", upsertProductChannelPricing);

// Endpoint 5: Upsert variant channel pricing — accepts a single object or an array
router.post("/variant-channel", upsertVariantChannelPricing);

export default router;
