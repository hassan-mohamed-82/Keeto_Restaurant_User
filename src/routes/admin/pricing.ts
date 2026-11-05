import { Router } from "express";
import {
    upsertFoodWithPricing,
    getMenuWithDynamicPricing,
    getFoodForPricing,
    upsertProductChannelPricing,
    upsertVariantChannelPricing,
    getActiveBranchWithServiceModule,
} from "../../controllers/admin/pricing.controller";
import { hasPermission } from "../../middlewares/hasPermission";
import { catchAsync } from "../../utils/catchAsync";

const router = Router();

router.get("/select", hasPermission("pricing", "read"), catchAsync(getActiveBranchWithServiceModule));

// Endpoint 1: Upsert food item along with branch overrides & channel pricing
router.post("/upsert-food", hasPermission("pricing", "update"), catchAsync(upsertFoodWithPricing));

// Endpoint 2: Get dynamic menu with COALESCE pricing hierarchy for a specific branch & service module
router.get("/dynamic-menu", hasPermission("pricing", "read"), catchAsync(getMenuWithDynamicPricing));

// Endpoint 3: Get food list (with variations & options) for the pricing UI
router.get("/food-for-pricing", hasPermission("pricing", "read"), catchAsync(getFoodForPricing));

// Endpoint 4: Upsert product (food) channel pricing — accepts a single object or an array
router.post("/product-channel", hasPermission("pricing", "update"), catchAsync(upsertProductChannelPricing));

// Endpoint 5: Upsert variant channel pricing — accepts a single object or an array
router.post("/variant-channel", hasPermission("pricing", "update"), catchAsync(upsertVariantChannelPricing));

export default router;
