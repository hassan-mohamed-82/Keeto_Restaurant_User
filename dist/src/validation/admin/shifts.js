"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateShiftSchema = exports.createShiftSchema = void 0;
const zod_1 = require("zod");
// Regular expression to validate time format: HH:mm or HH:mm:ss
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;
// ==========================================
// Shifts Validation Schema
// ==========================================
exports.createShiftSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, "Shift name is required").max(255, "Name cannot exceed 255 characters"),
    from: zod_1.z.string().regex(timeRegex, "Invalid time format for 'from', expected HH:mm or HH:mm:ss"),
    to: zod_1.z.string().regex(timeRegex, "Invalid time format for 'to', expected HH:mm or HH:mm:ss"),
    status: zod_1.z.enum(["active", "inactive"]).optional(),
});
exports.updateShiftSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, "Shift name is required").max(255, "Name cannot exceed 255 characters").optional(),
    from: zod_1.z.string().regex(timeRegex, "Invalid time format for 'from', expected HH:mm or HH:mm:ss").optional(),
    to: zod_1.z.string().regex(timeRegex, "Invalid time format for 'to', expected HH:mm or HH:mm:ss").optional(),
    status: zod_1.z.enum(["active", "inactive"]).optional(),
});
