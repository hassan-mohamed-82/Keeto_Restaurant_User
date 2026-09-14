import { Router } from "express";
import { catchAsync } from "../../../utils/catchAsync";
import { validate } from "../../../middlewares/validation";
import {
    createNoteGroupSchema,
    updateNoteGroupSchema,
    assignNoteGroupToFoodSchema,
} from "../../../validation/admin/notes";
import {
    createNoteGroup,
    getAllNoteGroups,
    getNoteGroupById,
    updateNoteGroup,
    deleteNoteGroup,
    toggleNoteGroupStatus,
    assignNoteGroupToFood,
} from "../../../controllers/admin/pos/notes";

const router = Router();

// Assign / unassign note group to food
router.post("/assign-food", validate(assignNoteGroupToFoodSchema), catchAsync(assignNoteGroupToFood));
router.patch("/assign-food", validate(assignNoteGroupToFoodSchema), catchAsync(assignNoteGroupToFood));

// Standard CRUD for Note Groups
router.post("/", validate(createNoteGroupSchema), catchAsync(createNoteGroup));
router.get("/", catchAsync(getAllNoteGroups));
router.post("/list", catchAsync(getAllNoteGroups));
router.get("/:id", catchAsync(getNoteGroupById));
router.put("/:id", validate(updateNoteGroupSchema), catchAsync(updateNoteGroup));
router.patch("/:id/toggle-status", catchAsync(toggleNoteGroupStatus));
router.delete("/:id", catchAsync(deleteNoteGroup));

export default router;
