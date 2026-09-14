"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNoteItemsQuerySchema = exports.updateNoteItemSchema = exports.createNoteItemSchema = void 0;
const zod_1 = require("zod");
const normalizeNoteItemInput = (obj) => {
    if (obj && typeof obj === "object") {
        const groupId = obj.group_note_id ?? obj.note_group_id ?? obj.groupNoteId ?? obj.groupId;
        if (groupId !== undefined) {
            obj.group_note_id = groupId;
            obj.groupNoteId = groupId;
            obj.note_group_id = groupId;
        }
    }
    return obj;
};
exports.createNoteItemSchema = zod_1.z.preprocess(normalizeNoteItemInput, zod_1.z.object({
    group_note_id: zod_1.z.string({ required_error: "group_note_id is required" }).min(1, "group_note_id cannot be empty"),
    groupNoteId: zod_1.z.string().optional(),
    note_group_id: zod_1.z.string().optional(),
    name: zod_1.z.string({ required_error: "Item name is required" }).min(1, "Item name cannot be empty").max(255),
    nameAr: zod_1.z.string().max(255).optional().nullable(),
    nameFr: zod_1.z.string().max(255).optional().nullable(),
    status: zod_1.z.enum(["active", "inactive"]).optional().default("active"),
}));
exports.updateNoteItemSchema = zod_1.z.preprocess(normalizeNoteItemInput, zod_1.z.object({
    group_note_id: zod_1.z.string().min(1).optional(),
    groupNoteId: zod_1.z.string().optional(),
    note_group_id: zod_1.z.string().optional(),
    name: zod_1.z.string().min(1, "Item name cannot be empty").max(255).optional(),
    nameAr: zod_1.z.string().max(255).optional().nullable(),
    nameFr: zod_1.z.string().max(255).optional().nullable(),
    status: zod_1.z.enum(["active", "inactive"]).optional(),
}));
exports.getNoteItemsQuerySchema = zod_1.z.preprocess(normalizeNoteItemInput, zod_1.z.object({
    group_note_id: zod_1.z.string().optional(),
    groupNoteId: zod_1.z.string().optional(),
    note_group_id: zod_1.z.string().optional(),
    search: zod_1.z.string().optional(),
    status: zod_1.z.enum(["active", "inactive", "all"]).optional(),
    lang: zod_1.z.enum(["en", "ar", "fr"]).optional().default("en"),
    page: zod_1.z.coerce.number().int().positive().optional().default(1),
    limit: zod_1.z.coerce.number().int().positive().optional().default(20),
}));
