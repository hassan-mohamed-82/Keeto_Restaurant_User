import { Router } from "express";
import { hasPermission } from "../../middlewares/hasPermission";
import { 
    createDeliveryMan, 
    getDeliveryMen, 
    getDeliveryManById, 
    updateDeliveryMan, 
    deleteDeliveryMan,
    getPendingOrders,
    assignOrdersToDeliveryMan,
    getDeliveryMenWithOrders,
    getDeliveryOrders,
    getDeliveryCashOrders,
    collectDeliveryCash,
} from "../../controllers/admin/delivery_man";
import { catchAsync } from "../../utils/catchAsync";
import { validate } from "../../middlewares/validation";
import { 
    assignOrdersSchema, 
    getDeliveryOrdersQuerySchema,
    collectDeliveryCashSchema,
    getDeliveryCashOrdersQuerySchema,
} from "../../validation/admin/delivery_man";

const router = Router();

// ✅ Get assignable orders (pending / accepted / preparing)
router.get("/pending-orders", hasPermission("delivery_man", "read"), catchAsync(getPendingOrders));

// ✅ Assign orders to a delivery man
router.post("/assign-orders", hasPermission("delivery_man", "update"), validate(assignOrdersSchema), catchAsync(assignOrdersToDeliveryMan));

// ✅ Get all delivery men with their assigned orders + totals
router.get("/assigned-orders", hasPermission("delivery_man", "read"), catchAsync(getDeliveryMenWithOrders));

// ✅ Get delivery orders (out_for_delivery / delivered) with cash-on-hand & financial stats
router.get("/delivery-orders", hasPermission("delivery_man", "read"), validate(getDeliveryOrdersQuerySchema, "query"), catchAsync(getDeliveryOrders));

// ✅ Get cash delivery orders for cash settlement (filter by deliveryManId, view uncollected vs collected)
router.get("/collect-cash", hasPermission("delivery_man", "read"), validate(getDeliveryCashOrdersQuerySchema, "query"), catchAsync(getDeliveryCashOrders));

// ✅ Collect delivery cash from delivery man (mark orders as cash collected by admin)
router.post("/collect-cash", hasPermission("delivery_man", "update"), validate(collectDeliveryCashSchema, "body"), catchAsync(collectDeliveryCash));

// ✅ Create delivery man
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
