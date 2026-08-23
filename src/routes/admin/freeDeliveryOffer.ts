import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { hasPermission } from "../../middlewares/hasPermission";
import {
    getFreeDeliveryOffer,
    upsertFreeDeliveryOffer,
    deleteFreeDeliveryOffer,
} from "../../controllers/admin/freeDeliveryOffer";

const router = Router();

// ✅ Get current free delivery offer for restaurant
router.get("/", hasPermission("orders", "read"), catchAsync(getFreeDeliveryOffer));

// ✅ Create / Update free delivery offer for restaurant
router.post("/", hasPermission("orders", "update"), catchAsync(upsertFreeDeliveryOffer));

// ✅ Delete / Reset free delivery offer
router.delete("/", hasPermission("orders", "delete"), catchAsync(deleteFreeDeliveryOffer));

export default router;
