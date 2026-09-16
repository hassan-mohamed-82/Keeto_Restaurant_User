import { Router } from "express";
import { catchAsync } from "../../../utils/catchAsync";
import { validate } from "../../../middlewares/validation";
import {
    createHallTableSchema,
    updateHallTableSchema,
    hallTableQuerySchema,
} from "../../../validation/admin/pos/hallTable";
import {
    createHallTable,
    getAllHallTables,
    getHallsForTable,
    getHallTableById,
    updateHallTable,
    deleteHallTable,
    toggleHallTableStatus,
    toggleHallTableOccupied,
} from "../../../controllers/admin/pos/hallTable";

const router = Router();

router.post("/", validate(createHallTableSchema), catchAsync(createHallTable));
router.get("/", validate(hallTableQuerySchema, "query"), catchAsync(getAllHallTables));
router.post("/list", validate(hallTableQuerySchema, "body"), catchAsync(getAllHallTables));

// Halls dropdown selection endpoint for Table
router.get("/halls", catchAsync(getHallsForTable));
router.post("/halls", catchAsync(getHallsForTable));

router.get("/:id", catchAsync(getHallTableById));
router.put("/:id", validate(updateHallTableSchema), catchAsync(updateHallTable));
router.patch("/:id/toggle-status", catchAsync(toggleHallTableStatus));
router.patch("/:id/toggle-occupied", catchAsync(toggleHallTableOccupied));
router.delete("/:id", catchAsync(deleteHallTable));

export default router;
