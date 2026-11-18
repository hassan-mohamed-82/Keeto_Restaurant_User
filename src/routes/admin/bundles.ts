import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { validate } from "../../middlewares/validation";
import {
    createOfferSchema,
    updateOfferSchema,
    getOfferFoodsSchema,
    offerIdParamSchema,
} from "../../validation/admin/offers";
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
} from "../../controllers/admin/bundle";

const router = Router();

router.post("/", validate(createOfferSchema), catchAsync(createOffer));
router.get("/", catchAsync(getAllOffers));
router.post("/list", catchAsync(getAllOffers));

// Options for dropdown selection
router.get("/branches", catchAsync(getBranches));
router.post("/branches", catchAsync(getBranches));
router.get("/foods", validate(getOfferFoodsSchema, "query"), catchAsync(getFoods));
router.post("/foods", validate(getOfferFoodsSchema, "body"), catchAsync(getFoods));

// Specific offer branches & foods
router.get("/:id/branches", validate(offerIdParamSchema, "params"), catchAsync(getOfferBranches));
router.post("/:id/branches", validate(offerIdParamSchema, "params"), catchAsync(getOfferBranches));
router.get("/:id/foods", validate(offerIdParamSchema, "params"), catchAsync(getOfferFoods));
router.post("/:id/foods", validate(offerIdParamSchema, "params"), catchAsync(getOfferFoods));

// Offer CRUD
router.get("/:id", validate(offerIdParamSchema, "params"), catchAsync(getOfferById));
router.post("/:id/details", validate(offerIdParamSchema, "params"), catchAsync(getOfferById));
router.put("/:id", validate(offerIdParamSchema, "params"), validate(updateOfferSchema), catchAsync(updateOffer));
router.patch("/:id/toggle-status", validate(offerIdParamSchema, "params"), catchAsync(toggleOfferStatus));
router.delete("/:id", validate(offerIdParamSchema, "params"), catchAsync(deleteOffer));

export default router;
