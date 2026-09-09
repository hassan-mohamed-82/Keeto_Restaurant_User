import { Router } from "express";
import { catchAsync } from "../../../utils/catchAsync";
import { validate } from "../../../middlewares/validation";
import { createOfferSchema, updateOfferSchema } from "../../../validation/admin/offers";
import {
    createOffer,
    getAllOffers,
    getOfferById,
    updateOffer,
    deleteOffer,
    toggleOfferStatus,
    getBranches,
    getFoods,
    getOfferBranches,
    getOfferFoods,
} from "../../../controllers/admin/pos/offers";

const router = Router();

router.post("/", validate(createOfferSchema), catchAsync(createOffer));
router.get("/", catchAsync(getAllOffers));
router.post("/list", catchAsync(getAllOffers));

// Options for dropdown selection
router.get("/branches", catchAsync(getBranches));
router.post("/branches", catchAsync(getBranches));
router.get("/foods", catchAsync(getFoods));
router.post("/foods", catchAsync(getFoods));

// Specific offer branches & foods
router.get("/:id/branches", catchAsync(getOfferBranches));
router.post("/:id/branches", catchAsync(getOfferBranches));
router.get("/:id/foods", catchAsync(getOfferFoods));
router.post("/:id/foods", catchAsync(getOfferFoods));

// Offer CRUD
router.get("/:id", catchAsync(getOfferById));
router.post("/:id/details", catchAsync(getOfferById));
router.put("/:id", validate(updateOfferSchema), catchAsync(updateOffer));
router.patch("/:id/toggle-status", catchAsync(toggleOfferStatus));
router.delete("/:id", catchAsync(deleteOffer));

export default router;
