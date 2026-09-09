"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateShiftSchema = exports.createShiftSchema = exports.SUPPORTED_LANGUAGES = void 0;
const zod_1 = require("zod");
// Regular expression to validate time format: HH:mm or HH:mm:ss
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;
exports.SUPPORTED_LANGUAGES = ["en", "ar", "fr"];
const normalizeBranchId = (obj) => {
    if (obj && typeof obj === "object") {
        if (obj.branchId === undefined && obj.branch_id !== undefined) {
            obj.branchId = obj.branch_id;
        }
        else if (obj.branch_id === undefined && obj.branchId !== undefined) {
            obj.branch_id = obj.branchId;
        }
    }
    return obj;
};
// ==========================================
// Shifts Validation Schema
// ==========================================
exports.createShiftSchema = zod_1.z.preprocess(normalizeBranchId, zod_1.z.object({
    name: zod_1.z.string({ required_error: "Shift name is required" }).min(1, "Shift name is required").max(255, "Name cannot exceed 255 characters"),
    nameAr: zod_1.z.string().max(255, "Arabic name cannot exceed 255 characters").optional().nullable(),
    nameFr: zod_1.z.string().max(255, "French name cannot exceed 255 characters").optional().nullable(),
    branchId: zod_1.z.string({ required_error: "branch_id is required" }).min(1, "branch_id is required"),
    branch_id: zod_1.z.string().optional(),
    from: zod_1.z.string({ required_error: "from is required" }).regex(timeRegex, "Invalid time format for 'from', expected HH:mm or HH:mm:ss"),
    to: zod_1.z.string({ required_error: "to is required" }).regex(timeRegex, "Invalid time format for 'to', expected HH:mm or HH:mm:ss"),
    status: zod_1.z.enum(["active", "inactive"]).optional().default("active"),
}));
exports.updateShiftSchema = zod_1.z.preprocess(normalizeBranchId, zod_1.z.object({
    name: zod_1.z.string().min(1, "Shift name cannot be empty").max(255, "Name cannot exceed 255 characters").optional(),
    nameAr: zod_1.z.string().max(255, "Arabic name cannot exceed 255 characters").optional().nullable(),
    nameFr: zod_1.z.string().max(255, "French name cannot exceed 255 characters").optional().nullable(),
    branchId: zod_1.z.string().min(1, "branch_id cannot be empty").optional(),
    branch_id: zod_1.z.string().optional(),
    from: zod_1.z.string().regex(timeRegex, "Invalid time format for 'from', expected HH:mm or HH:mm:ss").optional(),
    to: zod_1.z.string().regex(timeRegex, "Invalid time format for 'to', expected HH:mm or HH:mm:ss").optional(),
    status: zod_1.z.enum(["active", "inactive"]).optional(),
}));
