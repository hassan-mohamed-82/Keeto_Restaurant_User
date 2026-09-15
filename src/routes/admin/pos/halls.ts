import { Router } from "express";
import { catchAsync } from "../../../utils/catchAsync";
import { validate } from "../../../middlewares/validation";
import {
    createHallSchema,
    updateHallSchema,
    hallQuerySchema,
} from "../../../validation/admin/pos/hall";
import {
    createHall,
    getAllHalls,
    getBranchesForHall,
    getHallById,
    updateHall,
    deleteHall,
    toggleHallStatus,
} from "../../../controllers/admin/pos/hall";

const router = Router();

router.post("/", validate(createHallSchema), catchAsync(createHall));
router.get("/", validate(hallQuerySchema, "query"), catchAsync(getAllHalls));
router.post("/list", validate(hallQuerySchema, "body"), catchAsync(getAllHalls));

// Branches selection endpoint for Hall
router.get("/branches", catchAsync(getBranchesForHall));
router.post("/branches", catchAsync(getBranchesForHall));

router.get("/:id", catchAsync(getHallById));
router.put("/:id", validate(updateHallSchema), catchAsync(updateHall));
router.patch("/:id/toggle-status", catchAsync(toggleHallStatus));
router.delete("/:id", catchAsync(deleteHall));

export default router;
