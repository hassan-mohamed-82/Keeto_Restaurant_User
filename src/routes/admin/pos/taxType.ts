import { Router } from "express";
import { catchAsync } from "../../../utils/catchAsync";
import { validate } from "../../../middlewares/validation";
import { upsertTaxTypeSchema } from "../../../validation/admin/taxType";
import {
    getTaxType,
    upsertTaxType,
} from "../../../controllers/admin/pos/taxType";

const router = Router();

// Show TaxType (automatically scoped to req.user.restaurantId)
router.get("/", catchAsync(getTaxType));
router.get("/:restrauntid", catchAsync(getTaxType));

// Create if null, update if exist (Upsert - strictly uses req.user.restaurantId)
router.post("/", validate(upsertTaxTypeSchema), catchAsync(upsertTaxType));
router.put("/", validate(upsertTaxTypeSchema), catchAsync(upsertTaxType));
router.post("/upsert", validate(upsertTaxTypeSchema), catchAsync(upsertTaxType));
router.post("/:restrauntid", validate(upsertTaxTypeSchema), catchAsync(upsertTaxType));
router.put("/:restrauntid", validate(upsertTaxTypeSchema), catchAsync(upsertTaxType));

export default router;
