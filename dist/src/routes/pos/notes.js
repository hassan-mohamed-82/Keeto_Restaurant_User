"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../../utils/catchAsync");
const validation_1 = require("../../../middlewares/validation");
const notes_1 = require("../../../validation/admin/notes");
const notes_2 = require("../../../controllers/admin/pos/notes");
const router = (0, express_1.Router)();
// Assign / unassign note group to food
router.post("/assign-food", (0, validation_1.validate)(notes_1.assignNoteGroupToFoodSchema), (0, catchAsync_1.catchAsync)(notes_2.assignNoteGroupToFood));
router.patch("/assign-food", (0, validation_1.validate)(notes_1.assignNoteGroupToFoodSchema), (0, catchAsync_1.catchAsync)(notes_2.assignNoteGroupToFood));
// Standard CRUD for Note Groups
router.post("/", (0, validation_1.validate)(notes_1.createNoteGroupSchema), (0, catchAsync_1.catchAsync)(notes_2.createNoteGroup));
router.get("/", (0, catchAsync_1.catchAsync)(notes_2.getAllNoteGroups));
router.post("/list", (0, catchAsync_1.catchAsync)(notes_2.getAllNoteGroups));
router.get("/:id", (0, catchAsync_1.catchAsync)(notes_2.getNoteGroupById));
router.put("/:id", (0, validation_1.validate)(notes_1.updateNoteGroupSchema), (0, catchAsync_1.catchAsync)(notes_2.updateNoteGroup));
router.patch("/:id/toggle-status", (0, catchAsync_1.catchAsync)(notes_2.toggleNoteGroupStatus));
router.delete("/:id", (0, catchAsync_1.catchAsync)(notes_2.deleteNoteGroup));
exports.default = router;
