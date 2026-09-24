import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { validate } from "../../middlewares/validation";
import {
    createPrinterSchema,
    updatePrinterSchema,
    printerQuerySchema,
} from "../../validation/admin/printer";
import {
    createPrinter,
    getAllPrinters,
    getPrinterById,
    updatePrinter,
    deletePrinter,
} from "../../controllers/admin/printer";

const router = Router();

// Create
router.post("/", validate(createPrinterSchema), catchAsync(createPrinter));

// Get all (GET with query params or POST with body for complex filters)
router.get("/", validate(printerQuerySchema, "query"), catchAsync(getAllPrinters));

// Single record
router.get("/:id", catchAsync(getPrinterById));

// Update
router.put("/:id", validate(updatePrinterSchema), catchAsync(updatePrinter));

// Delete
router.delete("/:id", catchAsync(deletePrinter));

export default router;
