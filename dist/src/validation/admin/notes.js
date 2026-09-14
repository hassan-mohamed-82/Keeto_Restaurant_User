"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignNoteGroupToFoodSchema = exports.updateNoteGroupSchema = exports.createNoteGroupSchema = exports.noteItemNestedSchema = void 0;
const zod_1 = require("zod");
const normalizeNoteGroupInput = (obj) => {
    if (obj && typeof obj === "object") {
        // Map note_items to noteItems if present
        if (obj.note_items !== undefined && obj.noteItems === undefined) {
            obj.noteItems = obj.note_items;
        }
    }
    return obj;
};
const normalizeAssignFoodInput = (obj) => {
    if (obj && typeof obj === "object") {
        if (obj.foodId !== undefined && obj.food_id === undefined) {
            obj.food_id = obj.foodId;
        }
        else if (obj.food_id !== undefined && obj.foodId === undefined) {
            obj.foodId = obj.food_id;
        }
        const groupIdVal = obj.note_group_id ?? obj.noteGroupId ?? obj.group_note_id;
        if (groupIdVal !== undefined) {
            obj.note_group_id = groupIdVal;
            obj.noteGroupId = groupIdVal;
            obj.group_note_id = groupIdVal;
        }
    }
    return obj;
};
exports.noteItemNestedSchema = zod_1.z.object({
    id: zod_1.z.string().optional(),
    name: zod_1.z.string({ required_error: "Item name is required" }).min(1, "Item name cannot be empty").max(255),
    nameAr: zod_1.z.string().max(255).optional().nullable(),
    nameFr: zod_1.z.string().max(255).optional().nullable(),
    status: zod_1.z.enum(["active", "inactive"]).optional().default("active"),
});
exports.createNoteGroupSchema = zod_1.z.preprocess(normalizeNoteGroupInput, zod_1.z.object({
    name: zod_1.z.string({ required_error: "Note group name is required" }).min(1, "Name cannot be empty").max(255),
    nameAr: zod_1.z.string().max(255).optional().nullable(),
    nameFr: zod_1.z.string().max(255).optional().nullable(),
    status: zod_1.z.enum(["active", "inactive"]).optional().default("active"),
    noteItems: zod_1.z.array(exports.noteItemNestedSchema).optional(),
}));
exports.updateNoteGroupSchema = zod_1.z.preprocess(normalizeNoteGroupInput, zod_1.z.object({
    name: zod_1.z.string().min(1, "Name cannot be empty").max(255).optional(),
    nameAr: zod_1.z.string().max(255).optional().nullable(),
    nameFr: zod_1.z.string().max(255).optional().nullable(),
    status: zod_1.z.enum(["active", "inactive"]).optional(),
    noteItems: zod_1.z.array(exports.noteItemNestedSchema).optional(),
}));
exports.assignNoteGroupToFoodSchema = zod_1.z.preprocess(normalizeAssignFoodInput, zod_1.z.object({
    food_id: zod_1.z.string({ required_error: "food_id is required" }).min(1, "food_id cannot be empty"),
    foodId: zod_1.z.string().optional(),
    note_group_id: zod_1.z.string().nullable().optional(),
    noteGroupId: zod_1.z.string().nullable().optional(),
    group_note_id: zod_1.z.string().nullable().optional(),
}));
