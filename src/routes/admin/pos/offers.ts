import { Router } from "express";
import { catchAsync } from "../../../utils/catchAsync";
import { validate } from "../../../middlewares/validation";
import {
    storeFoodOfferSchema,
    updateFoodOfferSchema,
    getFoodOfferQuerySchema,
} from "../../../validation/admin/foodOffer";
import {
    getOffers,
    getFoodsWithoutOffer,
    getOfferByFoodId,
    storeOffer,
    updateOffer,
    deleteOffer,
} from "../../../controllers/admin/pos/offer";

const router = Router();

// ==========================================
// 1. View Offers List (where offer_price IS NOT NULL)
// ==========================================
router.get("/", validate(getFoodOfferQuerySchema, "query"), catchAsync(getOffers));
router.post("/list", validate(getFoodOfferQuerySchema, "body"), catchAsync(getOffers));

// ==========================================
// 2. Available Foods List (where offer_price IS NULL)
// ==========================================
router.get("/available-foods", validate(getFoodOfferQuerySchema, "query"), catchAsync(getFoodsWithoutOffer));
router.post("/available-foods", validate(getFoodOfferQuerySchema, "body"), catchAsync(getFoodsWithoutOffer));

// ==========================================
// 3. Store / Create Offer
// ==========================================
router.post("/", validate(storeFoodOfferSchema), catchAsync(storeOffer));

// ==========================================
// 4. Update Offer
// ==========================================
router.put("/:foodId", validate(updateFoodOfferSchema), catchAsync(updateOffer));
router.put("/", validate(updateFoodOfferSchema), catchAsync(updateOffer));

// ==========================================
// 5. Delete Offer (Reset offer columns to null)
// ==========================================
router.delete("/:foodId", catchAsync(deleteOffer));
router.delete("/", catchAsync(deleteOffer));

// ==========================================
// 6. Filter by ID (Offer Details)
// ==========================================
router.get("/:foodId", catchAsync(getOfferByFoodId));
router.post("/filter-by-id", catchAsync(getOfferByFoodId));
router.post("/:foodId/details", catchAsync(getOfferByFoodId));

export default router;
