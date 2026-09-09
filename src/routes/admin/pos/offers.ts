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
} from "../../../controllers/admin/pos/offers";

const router = Router();

router.post("/", validate(createOfferSchema), catchAsync(createOffer));
router.get("/", catchAsync(getAllOffers));
router.get("/branches", catchAsync(getBranches));
router.post("/branches", catchAsync(getBranches));
router.get("/:id", catchAsync(getOfferById));
router.put("/:id", validate(updateOfferSchema), catchAsync(updateOffer));
router.patch("/:id/toggle-status", catchAsync(toggleOfferStatus));
router.delete("/:id", catchAsync(deleteOffer));

export default router;
