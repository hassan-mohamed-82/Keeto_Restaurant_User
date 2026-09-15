import { Router } from "express";
import { catchAsync } from "../../../utils/catchAsync";
import { validate } from "../../../middlewares/validation";
import {
    createStoreManSchema,
    updateStoreManSchema,
    storeManQuerySchema,
} from "../../../validation/admin/storeMen";
import {
    createStoreMan,
    getAllStoreMen,
    getStoresForStoreMan,
    getStoreManById,
    updateStoreMan,
    deleteStoreMan,
    toggleStoreManStatus,
} from "../../../controllers/admin/pos/storeMan";

const router = Router();

router.post("/", validate(createStoreManSchema), catchAsync(createStoreMan));
router.get("/", validate(storeManQuerySchema, "query"), catchAsync(getAllStoreMen));
router.post("/list", validate(storeManQuerySchema, "body"), catchAsync(getAllStoreMen));

// Stores selection endpoint for StoreMan assignment
router.get("/stores", catchAsync(getStoresForStoreMan));
router.post("/stores", catchAsync(getStoresForStoreMan));

router.get("/:id", catchAsync(getStoreManById));
router.put("/:id", validate(updateStoreManSchema), catchAsync(updateStoreMan));
router.patch("/:id/toggle-status", catchAsync(toggleStoreManStatus));
router.delete("/:id", catchAsync(deleteStoreMan));

export default router;
