import { Router } from "express";
import { catchAsync } from "../../../utils/catchAsync";
import { validate } from "../../../middlewares/validation";
import {
    createServiceFeeSchema,
    updateServiceFeeSchema,
} from "../../../validation/admin/serviceFees";
import {
    createServiceFee,
    getAllServiceFees,
    getServiceFeeById,
    updateServiceFee,
    deleteServiceFee,
    toggleServiceFeeStatus,
    getServiceFeeListOptions,
    getSubcategories,
    getFoods,
} from "../../../controllers/admin/pos/serviceFees";

const router = Router();

router.post("/", validate(createServiceFeeSchema), catchAsync(createServiceFee));
router.get("/", catchAsync(getAllServiceFees));
router.get("/options", catchAsync(getServiceFeeListOptions));
router.get("/select-data", catchAsync(getServiceFeeListOptions));
router.get("/list", catchAsync(getServiceFeeListOptions));
router.get("/subcategories", catchAsync(getSubcategories));
router.post("/subcategories", catchAsync(getSubcategories));
router.get("/foods", catchAsync(getFoods));
router.post("/foods", catchAsync(getFoods));
router.get("/:id", catchAsync(getServiceFeeById));
router.put("/:id", validate(updateServiceFeeSchema), catchAsync(updateServiceFee));
router.patch("/:id/toggle-status", catchAsync(toggleServiceFeeStatus));
router.delete("/:id", catchAsync(deleteServiceFee));

export default router;
