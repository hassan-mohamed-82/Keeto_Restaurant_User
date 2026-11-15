import { z } from "zod";

// ==========================================
// 1. Food Variations Validation
// ==========================================
export const createFoodVariationSchema = z.object({
    foodId: z.string().uuid("Invalid Food ID"),
    name: z.string().min(1, "Variation name is required").max(255),
    nameAr: z.string().max(255).optional(),
    nameFr: z.string().max(255).optional(),
    isRequired: z.boolean().optional(),
    selectionType: z.enum(["single", "multiple"]).optional(),
    min: z.coerce.number().int().min(0, "Min cannot be negative").optional(),
    max: z.coerce.number().int().min(1, "Max must be at least 1").optional(),
    status: z.boolean().optional(),
});

export const updateFoodVariationSchema = createFoodVariationSchema.partial();

// ==========================================
// 2. Variation Options Validation
// ==========================================
export const createVariationOptionSchema = z.object({
    variationId: z.string().uuid("Invalid Variation ID"),
    optionName: z.string().min(1, "Option name is required").max(255),
    optionNameAr: z.string().max(255).optional(),
    optionNameFr: z.string().max(255).optional(),
    additionalPrice: z.string().max(255).optional(),
    priceMode: z.enum(["fixed", "per_weight"]).optional().default("fixed"),
    isDefault: z.boolean().optional(),
    status: z.boolean().optional(),
});

export const updateVariationOptionSchema = createVariationOptionSchema.partial();
