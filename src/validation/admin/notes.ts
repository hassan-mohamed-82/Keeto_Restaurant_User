import { z } from "zod";

const normalizeNoteGroupInput = (obj: any) => {
    if (obj && typeof obj === "object") {
        // Map note_items to noteItems if present
        if (obj.note_items !== undefined && obj.noteItems === undefined) {
            obj.noteItems = obj.note_items;
        }
    }
    return obj;
};

const normalizeAssignFoodInput = (obj: any) => {
    if (obj && typeof obj === "object") {
        if (obj.foodId !== undefined && obj.food_id === undefined) {
            obj.food_id = obj.foodId;
        } else if (obj.food_id !== undefined && obj.foodId === undefined) {
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

export const noteItemNestedSchema = z.object({
    id: z.string().optional(),
    name: z.string({ required_error: "Item name is required" }).min(1, "Item name cannot be empty").max(255),
    nameAr: z.string().max(255).optional().nullable(),
    nameFr: z.string().max(255).optional().nullable(),
    status: z.enum(["active", "inactive"]).optional().default("active"),
});

export const createNoteGroupSchema = z.preprocess(
    normalizeNoteGroupInput,
    z.object({
        name: z.string({ required_error: "Note group name is required" }).min(1, "Name cannot be empty").max(255),
        nameAr: z.string().max(255).optional().nullable(),
        nameFr: z.string().max(255).optional().nullable(),
        status: z.enum(["active", "inactive"]).optional().default("active"),
        noteItems: z.array(noteItemNestedSchema).optional(),
    })
);

export const updateNoteGroupSchema = z.preprocess(
    normalizeNoteGroupInput,
    z.object({
        name: z.string().min(1, "Name cannot be empty").max(255).optional(),
        nameAr: z.string().max(255).optional().nullable(),
        nameFr: z.string().max(255).optional().nullable(),
        status: z.enum(["active", "inactive"]).optional(),
        noteItems: z.array(noteItemNestedSchema).optional(),
    })
);

export const assignNoteGroupToFoodSchema = z.preprocess(
    normalizeAssignFoodInput,
    z.object({
        food_id: z.string({ required_error: "food_id is required" }).min(1, "food_id cannot be empty"),
        foodId: z.string().optional(),
        note_group_id: z.string().nullable().optional(),
        noteGroupId: z.string().nullable().optional(),
        group_note_id: z.string().nullable().optional(),
    })
);

export type CreateNoteGroupInput = z.infer<typeof createNoteGroupSchema>;
export type UpdateNoteGroupInput = z.infer<typeof updateNoteGroupSchema>;
export type AssignNoteGroupToFoodInput = z.infer<typeof assignNoteGroupToFoodSchema>;
