import { z } from "zod";

// Regular expression to validate time format: HH:mm or HH:mm:ss
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;

// ==========================================
// Shifts Validation Schema
// ==========================================

export const createShiftSchema = z.object({
    name: z.string().min(1, "Shift name is required").max(255, "Name cannot exceed 255 characters"),
    from: z.string().regex(timeRegex, "Invalid time format for 'from', expected HH:mm or HH:mm:ss"),
    to: z.string().regex(timeRegex, "Invalid time format for 'to', expected HH:mm or HH:mm:ss"),
    status: z.enum(["active", "inactive"]).optional(),
});

export const updateShiftSchema = z.object({
    name: z.string().min(1, "Shift name is required").max(255, "Name cannot exceed 255 characters").optional(),
    from: z.string().regex(timeRegex, "Invalid time format for 'from', expected HH:mm or HH:mm:ss").optional(),
    to: z.string().regex(timeRegex, "Invalid time format for 'to', expected HH:mm or HH:mm:ss").optional(),
    status: z.enum(["active", "inactive"]).optional(),
});

export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;
