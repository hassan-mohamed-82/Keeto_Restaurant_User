import { Router } from "express";
import { catchAsync } from "../../../utils/catchAsync";
import { validate } from "../../../middlewares/validation";
import {
    createSupplierSchema,
    updateSupplierSchema,
    supplierQuerySchema,
} from "../../../validation/admin/suppliers";
import {
    createSupplier,
    getAllSuppliers,
    getSupplierById,
    updateSupplier,
    deleteSupplier,
    toggleSupplierStatus,
} from "../../../controllers/admin/pos/supplier";

const router = Router();

router.post("/", validate(createSupplierSchema), catchAsync(createSupplier));
router.get("/", validate(supplierQuerySchema, "query"), catchAsync(getAllSuppliers));
router.post("/list", validate(supplierQuerySchema, "body"), catchAsync(getAllSuppliers));
router.get("/:id", catchAsync(getSupplierById));
router.put("/:id", validate(updateSupplierSchema), catchAsync(updateSupplier));
router.patch("/:id/toggle-status", catchAsync(toggleSupplierStatus));
router.delete("/:id", catchAsync(deleteSupplier));

export default router;
