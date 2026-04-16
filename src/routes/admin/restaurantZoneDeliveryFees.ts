import { Router } from "express";
import { createDeliveryFee,
     getDeliveryFees,
      getDeliveryFeeById,
       updateDeliveryFee,
        deleteDeliveryFee,
        select
    } from "../../controllers/admin/restaurantZoneDeliveryFees";
        import { catchAsync } from "../../utils/catchAsync";
const router = Router();

router.get("/select", catchAsync(select));
router.post("/", catchAsync(createDeliveryFee));
router.get("/", catchAsync(getDeliveryFees));
router.get("/:id", catchAsync(getDeliveryFeeById));
router.put("/:id", catchAsync(updateDeliveryFee));
router.delete("/:id", catchAsync(deleteDeliveryFee));

export default router;