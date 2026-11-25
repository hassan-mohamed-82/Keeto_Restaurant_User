import { z } from "zod";

export const TAX_SOURCES = ["keeto", "restaurant"] as const;
export const TAX_TYPES = ["include", "exclude"] as const; // include = inside price, exclude = added to total
export const TAX_MODULE_TYPES = ["pos", "online", "all"] as const; // stored in `modules`
export const TAX_PLATFORM_TYPES = ["web", "app", "all"] as const; // stored in `moduleType`
export const AMOUNT_TYPES = ["percentage", "value"] as const;
export type AmountType = (typeof AMOUNT_TYPES)[number];
export const SUPPORTED_LANGUAGES = ["en", "ar", "fr"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const subcategoryFilterSchema = z.object({
    lang: z.enum(SUPPORTED_LANGUAGES).optional().default("en"),
});

export const foodFilterSchema = z.object({
    lang: z.enum(SUPPORTED_LANGUAGES).optional().default("en"),
    subcategoryId: z.string().optional(),
});

const numericAmount = z.preprocess(
    (val) => (typeof val === "string" && val.trim() !== "" ? Number(val) : val),
    z
        .number({ required_error: "Amount is required", invalid_type_error: "Amount must be numeric" })
        .min(0, "Amount must be 0 or greater")
);

const refineAmount = (d: { amountType?: string; amount?: number }) =>
    !(d.amountType === "percentage" && d.amount !== undefined && d.amount > 100);

// ==========================================
// Restaurant Taxes Validation Schemas
// source is always "restaurant" (set by the server)
// ==========================================

export const createTaxSchema = z
    .object({
        name: z.string({ required_error: "Name is required" }).min(1, "Name cannot be empty").max(255),
        nameAr: z.string().max(255).optional().nullable(),
        nameFr: z.string().max(255).optional().nullable(),
        amount: numericAmount,
        amountType: z.enum(AMOUNT_TYPES).default("percentage"),
        // default include → price already contains the tax, only returned for display
        taxType: z.enum(TAX_TYPES, {
            invalid_type_error: "taxType must be either 'include' or 'exclude'",
        }).default("include"),
        modules: z.enum(TAX_MODULE_TYPES, {
            invalid_type_error: "modules must be one of: pos, online, all",
        }).default("all"),
        moduleType: z.enum(TAX_PLATFORM_TYPES, {
            invalid_type_error: "moduleType must be one of: web, app, all",
        }).default("all"),
        // empty array = applies to all branches / all foods
        branchIds: z.array(z.string().min(1, "Branch ID cannot be empty")).default([]),
        foodIds: z.array(z.string().min(1, "Food ID cannot be empty")).default([]),
        status: z.enum(["active", "inactive"]).default("active"),
    })
    .refine(refineAmount, { message: "Percentage amount cannot exceed 100", path: ["amount"] });

export const updateTaxSchema = z
    .object({
        name: z.string().min(1, "Name cannot be empty").max(255).optional(),
        nameAr: z.string().max(255).optional().nullable(),
        nameFr: z.string().max(255).optional().nullable(),
        amount: numericAmount.optional(),
        amountType: z.enum(AMOUNT_TYPES).optional(),
        taxType: z.enum(TAX_TYPES).optional(),
        modules: z.enum(TAX_MODULE_TYPES).optional(),
        moduleType: z.enum(TAX_PLATFORM_TYPES).optional(),
        branchIds: z.array(z.string().min(1, "Branch ID cannot be empty")).optional(),
        foodIds: z.array(z.string().min(1, "Food ID cannot be empty")).optional(),
        status: z.enum(["active", "inactive"]).optional(),
    })
    .refine(refineAmount, { message: "Percentage amount cannot exceed 100", path: ["amount"] });

export type CreateTaxInput = z.infer<typeof createTaxSchema>;
export type UpdateTaxInput = z.infer<typeof updateTaxSchema>;
