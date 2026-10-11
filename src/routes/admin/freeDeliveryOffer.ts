import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { hasPermission } from "../../middlewares/hasPermission";
import { validate } from "../../middlewares/validation";
import { upsertFreeDeliveryOfferSchema } from "../../validation/admin/freeDeliveryOffer";
import {
    getFreeDeliveryOffer,
    upsertFreeDeliveryOffer,
    deleteFreeDeliveryOffer,
} from "../../controllers/admin/freeDeliveryOffer";

const router = Router();

// ✅ Get current free delivery offer for restaurant
router.get("/", hasPermission("order", "read"), catchAsync(getFreeDeliveryOffer));

// ✅ Create / Update free delivery offer for restaurant
router.post("/", hasPermission("order", "update"), validate(upsertFreeDeliveryOfferSchema), catchAsync(upsertFreeDeliveryOffer));

// ✅ Delete / Reset free delivery offer
router.delete("/", hasPermission("order", "delete"), catchAsync(deleteFreeDeliveryOffer));

export default router;
