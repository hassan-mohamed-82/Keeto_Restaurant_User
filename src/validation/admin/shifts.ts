import { z } from "zod";

// Regular expression to validate time format: HH:mm or HH:mm:ss
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;

export const SUPPORTED_LANGUAGES = ["en", "ar", "fr"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const normalizeBranchId = (obj: any) => {
    if (obj && typeof obj === "object") {
        if (obj.branchId === undefined && obj.branch_id !== undefined) {
            obj.branchId = obj.branch_id;
        } else if (obj.branch_id === undefined && obj.branchId !== undefined) {
            obj.branch_id = obj.branchId;
        }
    }
    return obj;
};

// ==========================================
// Shifts Validation Schema
// ==========================================

export const createShiftSchema = z.preprocess(
    normalizeBranchId,
    z.object({
        name: z.string({ required_error: "Shift name is required" }).min(1, "Shift name is required").max(255, "Name cannot exceed 255 characters"),
        nameAr: z.string().max(255, "Arabic name cannot exceed 255 characters").optional().nullable(),
        nameFr: z.string().max(255, "French name cannot exceed 255 characters").optional().nullable(),
        branchId: z.string({ required_error: "branch_id is required" }).min(1, "branch_id is required"),
        branch_id: z.string().optional(),
        from: z.string({ required_error: "from is required" }).regex(timeRegex, "Invalid time format for 'from', expected HH:mm or HH:mm:ss"),
        to: z.string({ required_error: "to is required" }).regex(timeRegex, "Invalid time format for 'to', expected HH:mm or HH:mm:ss"),
        status: z.enum(["active", "inactive"]).optional().default("active"),
    })
);

export const updateShiftSchema = z.preprocess(
    normalizeBranchId,
    z.object({
        name: z.string().min(1, "Shift name cannot be empty").max(255, "Name cannot exceed 255 characters").optional(),
        nameAr: z.string().max(255, "Arabic name cannot exceed 255 characters").optional().nullable(),
        nameFr: z.string().max(255, "French name cannot exceed 255 characters").optional().nullable(),
        branchId: z.string().min(1, "branch_id cannot be empty").optional(),
        branch_id: z.string().optional(),
        from: z.string().regex(timeRegex, "Invalid time format for 'from', expected HH:mm or HH:mm:ss").optional(),
        to: z.string().regex(timeRegex, "Invalid time format for 'to', expected HH:mm or HH:mm:ss").optional(),
        status: z.enum(["active", "inactive"]).optional(),
    })
);

export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;
