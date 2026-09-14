import { Router } from "express";
import { catchAsync } from "../../../utils/catchAsync";
import { validate } from "../../../middlewares/validation";
import {
    createNoteItemSchema,
    updateNoteItemSchema,
    getNoteItemsQuerySchema,
} from "../../../validation/admin/notesItems";
import {
    createNoteItem,
    getAllNoteItems,
    getNoteItemById,
    updateNoteItem,
    deleteNoteItem,
    toggleNoteItemStatus,
} from "../../../controllers/admin/pos/notes_items";

const router = Router();

router.post("/", validate(createNoteItemSchema), catchAsync(createNoteItem));
router.get("/", validate(getNoteItemsQuerySchema, "query"), catchAsync(getAllNoteItems));
router.post("/list", catchAsync(getAllNoteItems));
router.get("/group/:group_id", catchAsync(getAllNoteItems));
router.get("/:id", catchAsync(getNoteItemById));
router.put("/:id", validate(updateNoteItemSchema), catchAsync(updateNoteItem));
router.patch("/:id/toggle-status", catchAsync(toggleNoteItemStatus));
router.delete("/:id", catchAsync(deleteNoteItem));

export default router;
