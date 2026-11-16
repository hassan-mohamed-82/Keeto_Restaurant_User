import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { hasPermission } from "../../middlewares/hasPermission";
import { validate } from "../../middlewares/validation";
import {
    getWeightRequests,
    getWeightRequestById,
    patchCustomerItemWeight,
    replaceRestaurantItems,
    confirmWeightRequest,
    rejectWeightRequest,
} from "../../controllers/admin/weightRequests";
import { getActiveInStockFoods } from "../../controllers/admin/food";
import {
    getWeightRequestsQuerySchema,
    getWeightRequestParamSchema,
    patchWeightItemParamSchema,
    patchWeightItemBodySchema,
    replaceRestaurantItemsSchema,
    rejectWeightRequestSchema,
    confirmWeightRequestSchema,
} from "../../validation/admin/weightRequests";

const router = Router();

// 1. Paginated list of weight requests
router.get(
    "/",
    hasPermission("order", "read", true),
    validate(getWeightRequestsQuerySchema, "query"),
    catchAsync(getWeightRequests)
);

// 1.5 Get active and in-stock foods with variations and addons for staff selection
router.get(
    "/available-foods",
    hasPermission("order", "read", true),
    catchAsync(getActiveInStockFoods)
);

// 2. Details of a single weight request
router.get(
    "/:id",
    hasPermission("order", "read", true),
    validate(getWeightRequestParamSchema, "params"),
    catchAsync(getWeightRequestById)
);

// 3. PUT weight or unavailable for customer item
router.put(
    "/:id/items/:cartItemId",
    hasPermission("order", "update", true),
    validate(patchWeightItemParamSchema, "params"),
    validate(patchWeightItemBodySchema, "body"),
    catchAsync(patchCustomerItemWeight)
);

// 4. PUT replace restaurant items
router.put(
    "/:id/items",
    hasPermission("order", "update", true),
    validate(getWeightRequestParamSchema, "params"),
    validate(replaceRestaurantItemsSchema, "body"),
    catchAsync(replaceRestaurantItems)
);

// 5. Confirm weight request (sends to customer)
router.post(
    "/:id/confirm",
    hasPermission("order", "update", true),
    validate(getWeightRequestParamSchema, "params"),
    validate(confirmWeightRequestSchema, "body"),
    catchAsync(confirmWeightRequest)
);

// 6. Reject weight request
router.post(
    "/:id/reject",
    hasPermission("order", "update", true),
    validate(getWeightRequestParamSchema, "params"),
    validate(rejectWeightRequestSchema, "body"),
    catchAsync(rejectWeightRequest)
);

export default router;
