import { z } from "zod";

const normalizeNoteItemInput = (obj: any) => {
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

export const createNoteItemSchema = z.preprocess(
    normalizeNoteItemInput,
    z.object({
        group_note_id: z.string({ required_error: "group_note_id is required" }).min(1, "group_note_id cannot be empty"),
        groupNoteId: z.string().optional(),
        note_group_id: z.string().optional(),
        name: z.string({ required_error: "Item name is required" }).min(1, "Item name cannot be empty").max(255),
        nameAr: z.string().max(255).optional().nullable(),
        nameFr: z.string().max(255).optional().nullable(),
        status: z.enum(["active", "inactive"]).optional().default("active"),
    })
);

export const updateNoteItemSchema = z.preprocess(
    normalizeNoteItemInput,
    z.object({
        group_note_id: z.string().min(1).optional(),
        groupNoteId: z.string().optional(),
        note_group_id: z.string().optional(),
        name: z.string().min(1, "Item name cannot be empty").max(255).optional(),
        nameAr: z.string().max(255).optional().nullable(),
        nameFr: z.string().max(255).optional().nullable(),
        status: z.enum(["active", "inactive"]).optional(),
    })
);

export const getNoteItemsQuerySchema = z.preprocess(
    normalizeNoteItemInput,
    z.object({
        group_note_id: z.string().optional(),
        groupNoteId: z.string().optional(),
        note_group_id: z.string().optional(),
        search: z.string().optional(),
        status: z.enum(["active", "inactive", "all"]).optional(),
        lang: z.enum(["en", "ar", "fr"]).optional().default("en"),
        page: z.coerce.number().int().positive().optional().default(1),
        limit: z.coerce.number().int().positive().optional().default(20),
    })
);

export type CreateNoteItemInput = z.infer<typeof createNoteItemSchema>;
export type UpdateNoteItemInput = z.infer<typeof updateNoteItemSchema>;
export type GetNoteItemsQueryInput = z.infer<typeof getNoteItemsQuerySchema>;
