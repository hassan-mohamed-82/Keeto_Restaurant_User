import { Router } from "express";
import { catchAsync } from "../../../utils/catchAsync";
import { validate } from "../../../middlewares/validation";
import { upsertTaxTypeSchema } from "../../../validation/admin/taxType";
import {
    getTaxTypeByRestaurantId,
    upsertTaxType,
} from "../../../controllers/admin/pos/taxType";

const router = Router();

// Show by restaurantId
router.get("/restaurant/:restrauntid", catchAsync(getTaxTypeByRestaurantId));
router.get("/:restrauntid", catchAsync(getTaxTypeByRestaurantId));
router.get("/", catchAsync(getTaxTypeByRestaurantId));

// Create if null, update if exist (Upsert)
router.post("/", validate(upsertTaxTypeSchema), catchAsync(upsertTaxType));
router.put("/", validate(upsertTaxTypeSchema), catchAsync(upsertTaxType));
router.post("/upsert", validate(upsertTaxTypeSchema), catchAsync(upsertTaxType));
router.put("/:restrauntid", validate(upsertTaxTypeSchema), catchAsync(upsertTaxType));
router.post("/:restrauntid", validate(upsertTaxTypeSchema), catchAsync(upsertTaxType));

export default router;
