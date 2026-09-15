import { Router } from "express";
import { catchAsync } from "../../../utils/catchAsync";
import { validate } from "../../../middlewares/validation";
import {
    createStoreSchema,
    updateStoreSchema,
    storeQuerySchema,
} from "../../../validation/admin/stores";
import {
    createStore,
    getAllStores,
    getBranchForSelection,
    getStoreById,
    updateStore,
    deleteStore,
    toggleStoreStatus,
} from "../../../controllers/admin/pos/store";

const router = Router();

router.post("/", validate(createStoreSchema), catchAsync(createStore));
router.get("/", validate(storeQuerySchema, "query"), catchAsync(getAllStores));
router.post("/list", validate(storeQuerySchema, "body"), catchAsync(getAllStores));

// Dropdown selection endpoint
router.get("/selection", catchAsync(getBranchForSelection));
router.post("/selection", catchAsync(getBranchForSelection));

router.get("/:id", catchAsync(getStoreById));
router.put("/:id", validate(updateStoreSchema), catchAsync(updateStore));
router.patch("/:id/toggle-status", catchAsync(toggleStoreStatus));
router.delete("/:id", catchAsync(deleteStore));

export default router;
