import { Router } from "express";
import { hasPermission } from "../../middlewares/hasPermission";
import { 
    createDeliveryMan, 
    getDeliveryMen, 
    getDeliveryManById, 
    updateDeliveryMan, 
    deleteDeliveryMan 
} from "../../controllers/admin/delivery_man";
import { catchAsync } from "../../utils/catchAsync";

const router = Router();

// ✅ Create delivery man - يحتاج صلاحية create (delivery_man module)
router.post("/", hasPermission("delivery_man", "create"), catchAsync(createDeliveryMan));

// ✅ Get all delivery men - يحتاج صلاحية read
router.get("/", hasPermission("delivery_man", "read"), catchAsync(getDeliveryMen));

// ✅ Get delivery man by id - يحتاج صلاحية read
router.get("/:id", hasPermission("delivery_man", "read"), catchAsync(getDeliveryManById));

// ✅ Update delivery man - يحتاج صلاحية update
router.put("/:id", hasPermission("delivery_man", "update"), catchAsync(updateDeliveryMan));

// ✅ Delete delivery man - يحتاج صلاحية delete
router.delete("/:id", hasPermission("delivery_man", "delete"), catchAsync(deleteDeliveryMan));

export default router;
