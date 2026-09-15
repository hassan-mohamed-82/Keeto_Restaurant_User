import { Router } from "express";
import { catchAsync } from "../../../utils/catchAsync";
import { validate } from "../../../middlewares/validation";
import {
    createCaptainOrderSchema,
    updateCaptainOrderSchema,
    captainOrderQuerySchema,
} from "../../../validation/admin/pos/captainOrder";
import {
    createCaptainOrder,
    getAllCaptainOrders,
    getBranchesForCaptain,
    getCaptainOrderById,
    updateCaptainOrder,
    deleteCaptainOrder,
    toggleCaptainOrderStatus,
} from "../../../controllers/admin/pos/captainOrder";

const router = Router();

router.post("/", validate(createCaptainOrderSchema), catchAsync(createCaptainOrder));
router.get("/", validate(captainOrderQuerySchema, "query"), catchAsync(getAllCaptainOrders));
router.post("/list", validate(captainOrderQuerySchema, "body"), catchAsync(getAllCaptainOrders));

// Branches selection endpoint for Captain
router.get("/branches", catchAsync(getBranchesForCaptain));
router.post("/branches", catchAsync(getBranchesForCaptain));

router.get("/:id", catchAsync(getCaptainOrderById));
router.put("/:id", validate(updateCaptainOrderSchema), catchAsync(updateCaptainOrder));
router.patch("/:id/toggle-status", catchAsync(toggleCaptainOrderStatus));
router.delete("/:id", catchAsync(deleteCaptainOrder));

export default router;
