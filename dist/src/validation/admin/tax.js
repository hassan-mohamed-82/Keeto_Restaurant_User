"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTaxSchema = exports.createTaxSchema = exports.foodFilterSchema = exports.subcategoryFilterSchema = exports.SUPPORTED_LANGUAGES = exports.AMOUNT_TYPES = exports.TAX_PLATFORM_TYPES = exports.TAX_MODULE_TYPES = exports.TAX_TYPES = exports.TAX_SOURCES = void 0;
const zod_1 = require("zod");
exports.TAX_SOURCES = ["keeto", "restaurant"];
exports.TAX_TYPES = ["include", "exclude"]; // include = inside price, exclude = added to total
exports.TAX_MODULE_TYPES = ["pos", "online", "all"]; // stored in `modules`
exports.TAX_PLATFORM_TYPES = ["web", "app", "all"]; // stored in `moduleType`
exports.AMOUNT_TYPES = ["percentage", "value"];
exports.SUPPORTED_LANGUAGES = ["en", "ar", "fr"];
exports.subcategoryFilterSchema = zod_1.z.object({
    lang: zod_1.z.enum(exports.SUPPORTED_LANGUAGES).optional().default("en"),
});
exports.foodFilterSchema = zod_1.z.object({
    lang: zod_1.z.enum(exports.SUPPORTED_LANGUAGES).optional().default("en"),
    subcategoryId: zod_1.z.string().optional(),
});
const numericAmount = zod_1.z.preprocess((val) => (typeof val === "string" && val.trim() !== "" ? Number(val) : val), zod_1.z
    .number({ required_error: "Amount is required", invalid_type_error: "Amount must be numeric" })
    .min(0, "Amount must be 0 or greater"));
const refineAmount = (d) => !(d.amountType === "percentage" && d.amount !== undefined && d.amount > 100);
// ==========================================
// Restaurant Taxes Validation Schemas
// source is always "restaurant" (set by the server)
// ==========================================
exports.createTaxSchema = zod_1.z
    .object({
    name: zod_1.z.string({ required_error: "Name is required" }).min(1, "Name cannot be empty").max(255),
    nameAr: zod_1.z.string().max(255).optional().nullable(),
    nameFr: zod_1.z.string().max(255).optional().nullable(),
    amount: numericAmount,
    amountType: zod_1.z.enum(exports.AMOUNT_TYPES).default("percentage"),
    // default include → price already contains the tax, only returned for display
    taxType: zod_1.z.enum(exports.TAX_TYPES, {
        invalid_type_error: "taxType must be either 'include' or 'exclude'",
    }).default("include"),
    modules: zod_1.z.enum(exports.TAX_MODULE_TYPES, {
        invalid_type_error: "modules must be one of: pos, online, all",
    }).default("all"),
    moduleType: zod_1.z.enum(exports.TAX_PLATFORM_TYPES, {
        invalid_type_error: "moduleType must be one of: web, app, all",
    }).default("all"),
    // empty array = applies to all branches / all foods
    branchIds: zod_1.z.array(zod_1.z.string().min(1, "Branch ID cannot be empty")).default([]),
    foodIds: zod_1.z.array(zod_1.z.string().min(1, "Food ID cannot be empty")).default([]),
    status: zod_1.z.enum(["active", "inactive"]).default("active"),
})
    .refine(refineAmount, { message: "Percentage amount cannot exceed 100", path: ["amount"] });
exports.updateTaxSchema = zod_1.z
    .object({
    name: zod_1.z.string().min(1, "Name cannot be empty").max(255).optional(),
    nameAr: zod_1.z.string().max(255).optional().nullable(),
    nameFr: zod_1.z.string().max(255).optional().nullable(),
    amount: numericAmount.optional(),
    amountType: zod_1.z.enum(exports.AMOUNT_TYPES).optional(),
    taxType: zod_1.z.enum(exports.TAX_TYPES).optional(),
    modules: zod_1.z.enum(exports.TAX_MODULE_TYPES).optional(),
    moduleType: zod_1.z.enum(exports.TAX_PLATFORM_TYPES).optional(),
    branchIds: zod_1.z.array(zod_1.z.string().min(1, "Branch ID cannot be empty")).optional(),
    foodIds: zod_1.z.array(zod_1.z.string().min(1, "Food ID cannot be empty")).optional(),
    status: zod_1.z.enum(["active", "inactive"]).optional(),
})
    .refine(refineAmount, { message: "Percentage amount cannot exceed 100", path: ["amount"] });
