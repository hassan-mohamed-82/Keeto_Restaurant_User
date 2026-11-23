import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { validate } from "../../middlewares/validation";
import { hasPermission } from "../../middlewares/hasPermission";
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

router.post("/", hasPermission("bundles", "create"), validate(createOfferSchema), catchAsync(createOffer));
router.get("/", hasPermission("bundles", "read"), catchAsync(getAllOffers));
router.post("/list", hasPermission("bundles", "read"), catchAsync(getAllOffers));

// Options for dropdown selection
router.get("/branches", hasPermission("bundles", "read"), catchAsync(getBranches));
router.post("/branches", hasPermission("bundles", "read"), catchAsync(getBranches));
router.get("/foods", hasPermission("bundles", "read"), validate(getOfferFoodsSchema, "query"), catchAsync(getFoods));
router.post("/foods", hasPermission("bundles", "read"), validate(getOfferFoodsSchema, "body"), catchAsync(getFoods));

// Specific offer branches & foods
router.get("/:id/branches", hasPermission("bundles", "read"), validate(offerIdParamSchema, "params"), catchAsync(getOfferBranches));
router.post("/:id/branches", hasPermission("bundles", "read"), validate(offerIdParamSchema, "params"), catchAsync(getOfferBranches));
router.get("/:id/foods", hasPermission("bundles", "read"), validate(offerIdParamSchema, "params"), catchAsync(getOfferFoods));
router.post("/:id/foods", hasPermission("bundles", "read"), validate(offerIdParamSchema, "params"), catchAsync(getOfferFoods));

// Offer CRUD
router.get("/:id", hasPermission("bundles", "read"), validate(offerIdParamSchema, "params"), catchAsync(getOfferById));
router.post("/:id/details", hasPermission("bundles", "read"), validate(offerIdParamSchema, "params"), catchAsync(getOfferById));
router.put("/:id", hasPermission("bundles", "update"), validate(offerIdParamSchema, "params"), validate(updateOfferSchema), catchAsync(updateOffer));
router.patch("/:id/toggle-status", hasPermission("bundles", "update"), validate(offerIdParamSchema, "params"), catchAsync(toggleOfferStatus));
router.delete("/:id", hasPermission("bundles", "delete"), validate(offerIdParamSchema, "params"), catchAsync(deleteOffer));

export default router;
