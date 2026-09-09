"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateOfferSchema = exports.createOfferSchema = exports.SUPPORTED_LANGUAGES = void 0;
const zod_1 = require("zod");
exports.SUPPORTED_LANGUAGES = ["en", "ar", "fr"];
const normalizeBranchIds = (obj) => {
    if (obj && typeof obj === "object") {
        if (obj.branchIds === undefined && obj.branch_ids !== undefined) {
            obj.branchIds = obj.branch_ids;
        }
        else if (obj.branch_ids === undefined && obj.branchIds !== undefined) {
            obj.branch_ids = obj.branchIds;
        }
        if (obj.foodIds === undefined && obj.food_ids !== undefined) {
            obj.foodIds = obj.food_ids;
        }
        else if (obj.food_ids === undefined && obj.foodIds !== undefined) {
            obj.food_ids = obj.foodIds;
        }
        if (obj.startDate === undefined && obj.start_date !== undefined) {
            obj.startDate = obj.start_date;
        }
        if (obj.endDate === undefined && obj.end_date !== undefined) {
            obj.endDate = obj.end_date;
        }
    }
    return obj;
};
// ==========================================
// Offers Validation Schemas
// ==========================================
exports.createOfferSchema = zod_1.z.preprocess(normalizeBranchIds, zod_1.z.object({
    name: zod_1.z.string({ required_error: "Offer name is required" }).min(1, "Offer name is required").max(255, "Name cannot exceed 255 characters"),
    nameAr: zod_1.z.string().max(255, "Arabic name cannot exceed 255 characters").optional().nullable(),
    nameFr: zod_1.z.string().max(255, "French name cannot exceed 255 characters").optional().nullable(),
    image: zod_1.z.string().optional().nullable(),
    startDate: zod_1.z.preprocess((val) => {
        if (typeof val === "string" || val instanceof Date)
            return new Date(val);
        return val;
    }, zod_1.z.date({ required_error: "startDate is required" })),
    endDate: zod_1.z.preprocess((val) => {
        if (typeof val === "string" || val instanceof Date)
            return new Date(val);
        return val;
    }, zod_1.z.date({ required_error: "endDate is required" })),
    price: zod_1.z.preprocess((val) => {
        if (typeof val === "string" && val.trim() !== "") {
            const num = Number(val);
            return isNaN(num) ? val : num;
        }
        return val;
    }, zod_1.z
        .number({
        required_error: "Price is required",
        invalid_type_error: "Price must be numeric",
    })
        .min(0, "Price must be 0 or greater")
        .transform((v) => String(v))),
    foodIds: zod_1.z.array(zod_1.z.string().min(1)).optional().default([]),
    food_ids: zod_1.z.array(zod_1.z.string().min(1)).optional(),
    branchIds: zod_1.z.array(zod_1.z.string().min(1)).optional().default([]),
    branch_ids: zod_1.z.array(zod_1.z.string().min(1)).optional(),
    status: zod_1.z.enum(["active", "inactive"]).optional().default("active"),
}));
exports.updateOfferSchema = zod_1.z.preprocess(normalizeBranchIds, zod_1.z.object({
    name: zod_1.z.string().min(1, "Offer name cannot be empty").max(255, "Name cannot exceed 255 characters").optional(),
    nameAr: zod_1.z.string().max(255, "Arabic name cannot exceed 255 characters").optional().nullable(),
    nameFr: zod_1.z.string().max(255, "French name cannot exceed 255 characters").optional().nullable(),
    image: zod_1.z.string().optional().nullable(),
    startDate: zod_1.z.preprocess((val) => {
        if (typeof val === "string" || val instanceof Date)
            return new Date(val);
        return val;
    }, zod_1.z.date()).optional(),
    endDate: zod_1.z.preprocess((val) => {
        if (typeof val === "string" || val instanceof Date)
            return new Date(val);
        return val;
    }, zod_1.z.date()).optional(),
    price: zod_1.z
        .preprocess((val) => {
        if (typeof val === "string" && val.trim() !== "") {
            const num = Number(val);
            return isNaN(num) ? val : num;
        }
        return val;
    }, zod_1.z
        .number({
        invalid_type_error: "Price must be numeric",
    })
        .min(0, "Price must be 0 or greater")
        .transform((v) => String(v)))
        .optional(),
    foodIds: zod_1.z.array(zod_1.z.string().min(1)).optional(),
    food_ids: zod_1.z.array(zod_1.z.string().min(1)).optional(),
    branchIds: zod_1.z.array(zod_1.z.string().min(1)).optional(),
    branch_ids: zod_1.z.array(zod_1.z.string().min(1)).optional(),
    status: zod_1.z.enum(["active", "inactive"]).optional(),
}));
