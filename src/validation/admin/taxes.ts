import { z } from "zod";

export const TAX_MODULES = ["take_away", "dine_in", "delivery", "car", "all"] as const;
export const TAX_TYPES = ["web", "app", "all"] as const;
export const TAX_MODULE_TYPES = ["pos", "online", "all"] as const;
export const AMOUNT_TYPES = ["percentage", "value"] as const;
export type AmountType = (typeof AMOUNT_TYPES)[number];
export const SUPPORTED_LANGUAGES = ["en", "ar", "fr"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const subcategoryFilterSchema = z.object({
    lang: z.enum(SUPPORTED_LANGUAGES).optional().default("en"),
});

export const foodFilterSchema = z.object({
    lang: z.enum(SUPPORTED_LANGUAGES).optional().default("en"),
    subcategory_id: z.string().optional(),
    subcategoryId: z.string().optional(),
});

const normalizeTaxInput = (obj: any) => {
    if (obj && typeof obj === "object") {
        if (obj.moduleType === undefined && obj.module_type !== undefined) {
            obj.moduleType = obj.module_type;
        } else if (obj.module_type === undefined && obj.moduleType !== undefined) {
            obj.module_type = obj.moduleType;
        }
        if (obj.amountType === undefined && obj.amount_type !== undefined) {
            obj.amountType = obj.amount_type;
        } else if (obj.amount_type === undefined && obj.amountType !== undefined) {
            obj.amount_type = obj.amountType;
        }
    }
    return obj;
};

// ==========================================
// Taxes Validation Schemas
// ==========================================

export const createTaxSchema = z.preprocess(
    normalizeTaxInput,
    z.object({
        name: z.string({ required_error: "Name is required" }).min(1, "Name cannot be empty").max(255, "Name cannot exceed 255 characters"),
        nameAr: z.string().max(255, "Arabic name cannot exceed 255 characters").optional().nullable(),
        nameFr: z.string().max(255, "French name cannot exceed 255 characters").optional().nullable(),
        amount: z.preprocess(
            (val) => {
                if (typeof val === "string" && val.trim() !== "") {
                    const num = Number(val);
                    return isNaN(num) ? val : num;
                }
                return val;
            },
            z
                .number({
                    required_error: "Amount is required",
                    invalid_type_error: "Amount must be numeric",
                })
                .min(0, "Amount must be 0 or greater")
                .transform((v) => String(v))
        ),
        amountType: z.enum(AMOUNT_TYPES, {
            required_error: "amount_type is required and must be either 'percentage' or 'value'",
            invalid_type_error: "amount_type must be either 'percentage' or 'value'",
        }).default("percentage"),
        amount_type: z.enum(AMOUNT_TYPES).optional(),
        type: z.enum(TAX_TYPES, {
            required_error: "Type is required and must be one of: web, app, all",
            invalid_type_error: "Type must be one of: web, app, all",
        }),
        moduleType: z.enum(TAX_MODULE_TYPES, {
            required_error: "module_type is required and must be one of: pos, online, all",
            invalid_type_error: "module_type must be one of: pos, online, all",
        }),
        module_type: z.enum(TAX_MODULE_TYPES).optional(),
        branchIds: z
            .array(z.string().min(1, "Branch ID cannot be empty"), {
                required_error: "branchIds is required and must be an array of branch IDs",
                invalid_type_error: "branchIds must be an array of branch IDs",
            })
            .min(1, "At least one branch ID must be provided"),
        foodIds: z
            .array(z.string().min(1, "Food ID cannot be empty"), {
                required_error: "foodIds is required and must be an array of food IDs",
                invalid_type_error: "foodIds must be an array of food IDs",
            })
            .min(1, "At least one food ID must be provided"),
        modules: z
            .array(
                z.enum(TAX_MODULES, {
                    errorMap: () => ({
                        message: "Module must be one of: take_away, dine_in, delivery, car, all",
                    }),
                }),
                {
                    required_error: "modules is required and must be an array",
                    invalid_type_error: "modules must be an array",
                }
            )
            .min(1, "At least one module must be provided"),
        status: z.enum(["active", "inactive"]).optional().default("active"),
    })
);

export const updateTaxSchema = z.preprocess(
    normalizeTaxInput,
    z.object({
        name: z.string().min(1, "Name cannot be empty").max(255, "Name cannot exceed 255 characters").optional(),
        nameAr: z.string().max(255, "Arabic name cannot exceed 255 characters").optional().nullable(),
        nameFr: z.string().max(255, "French name cannot exceed 255 characters").optional().nullable(),
        amount: z
            .preprocess(
                (val) => {
                    if (typeof val === "string" && val.trim() !== "") {
                        const num = Number(val);
                        return isNaN(num) ? val : num;
                    }
                    return val;
                },
                z
                    .number({
                        invalid_type_error: "Amount must be numeric",
                    })
                    .min(0, "Amount must be 0 or greater")
                    .transform((v) => String(v))
            )
            .optional(),
        amountType: z.enum(AMOUNT_TYPES).optional(),
        amount_type: z.enum(AMOUNT_TYPES).optional(),
        type: z.enum(TAX_TYPES).optional(),
        moduleType: z.enum(TAX_MODULE_TYPES).optional(),
        module_type: z.enum(TAX_MODULE_TYPES).optional(),
        branchIds: z
            .array(z.string().min(1, "Branch ID cannot be empty"))
            .min(1, "At least one branch ID must be provided")
            .optional(),
        foodIds: z
            .array(z.string().min(1, "Food ID cannot be empty"))
            .min(1, "At least one food ID must be provided")
            .optional(),
        modules: z
            .array(
                z.enum(TAX_MODULES, {
                    errorMap: () => ({
                        message: "Module must be one of: take_away, dine_in, delivery, car, all",
                    }),
                })
            )
            .min(1, "At least one module must be provided")
            .optional(),
        status: z.enum(["active", "inactive"]).optional(),
    })
);

export type CreateTaxInput = z.infer<typeof createTaxSchema>;
export type UpdateTaxInput = z.infer<typeof updateTaxSchema>;
