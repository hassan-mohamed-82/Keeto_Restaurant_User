import { z } from "zod";

export const SUPPORTED_LANGUAGES = ["en", "ar", "fr"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function safeParseJson(val: any): any {
    if (typeof val === "string") {
        const trimmed = val.trim();
        if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
            try {
                return JSON.parse(trimmed);
            } catch {
                return val;
            }
        }
    }
    return val;
}

const normalizeOfferInput = (obj: any) => {
    if (obj && typeof obj === "object") {
        // Normalize branchIds
        if (obj.branchIds === undefined && obj.branch_ids !== undefined) {
            obj.branchIds = safeParseJson(obj.branch_ids);
        } else if (obj.branch_ids === undefined && obj.branchIds !== undefined) {
            obj.branch_ids = safeParseJson(obj.branchIds);
        } else if (obj.branchIds !== undefined) {
            obj.branchIds = safeParseJson(obj.branchIds);
        }

        // Normalize dates
        if (obj.startDate === undefined && obj.start_date !== undefined) {
            obj.startDate = obj.start_date;
        }
        if (obj.endDate === undefined && obj.end_date !== undefined) {
            obj.endDate = obj.end_date;
        }

        // Normalize foods / products / items
        let incomingFoods = obj.foods !== undefined ? obj.foods : (obj.products !== undefined ? obj.products : obj.items);
        incomingFoods = safeParseJson(incomingFoods);

        if (Array.isArray(incomingFoods)) {
            obj.foods = incomingFoods.map((item: any) => {
                if (typeof item === "string") {
                    return { foodId: item, quantity: 1, variations: [] };
                }
                if (item && typeof item === "object") {
                    const foodId = item.foodId || item.food_id || item.id;
                    const quantity = item.quantity !== undefined ? item.quantity : 1;

                    let variations = item.variations;
                    variations = safeParseJson(variations);

                    const directOptions = safeParseJson(
                        item.options || item.optionIds || item.optionsIds || item.option_ids || item.options_ids
                    );

                    let normalizedVariations: any[] = [];
                    if (Array.isArray(variations)) {
                        normalizedVariations = variations.map((v: any) => {
                            if (typeof v === "string") {
                                return { variationId: null, options: [v] };
                            }
                            const vId = v.variationId || v.variation_id || null;
                            const vOpts = safeParseJson(v.options || v.optionIds || v.optionsIds || v.option_ids || []);
                            return {
                                variationId: vId,
                                options: Array.isArray(vOpts) ? vOpts.map(String) : [],
                            };
                        });
                    }

                    if (Array.isArray(directOptions) && directOptions.length > 0) {
                        normalizedVariations.push({
                            variationId: null,
                            options: directOptions.map(String),
                        });
                    }

                    return {
                        foodId,
                        quantity,
                        variations: normalizedVariations,
                    };
                }
                return item;
            });
        } else {
            // Check if legacy foodIds or food_ids were passed
            let legacyFoodIds = obj.foodIds !== undefined ? obj.foodIds : obj.food_ids;
            legacyFoodIds = safeParseJson(legacyFoodIds);
            if (Array.isArray(legacyFoodIds)) {
                obj.foods = legacyFoodIds.map((id: any) => ({
                    foodId: String(id),
                    quantity: 1,
                    variations: [],
                }));
            }
        }

        // Also ensure foodIds is populated for backward compatibility
        if (Array.isArray(obj.foods)) {
            obj.foodIds = Array.from(new Set(obj.foods.map((f: any) => f?.foodId).filter(Boolean)));
            obj.food_ids = obj.foodIds;
        }
    }
    return obj;
};

// ==========================================
// Offers Validation Schemas
// ==========================================

export const offerVariationSchema = z.object({
    variationId: z.string().optional().nullable(),
    variation_id: z.string().optional().nullable(),
    options: z.array(z.string().min(1)).optional().default([]),
    optionIds: z.array(z.string().min(1)).optional(),
    optionsIds: z.array(z.string().min(1)).optional(),
    option_ids: z.array(z.string().min(1)).optional(),
}).transform((val) => {
    const rawOptions = val.options.length > 0
        ? val.options
        : (val.optionIds || val.optionsIds || val.option_ids || []);
    return {
        variationId: val.variationId || val.variation_id || null,
        options: Array.from(new Set(rawOptions.map(String).filter(Boolean))),
    };
});

export const offerFoodItemSchema = z.object({
    foodId: z.string({ required_error: "foodId is required" }).min(1, "foodId cannot be empty"),
    quantity: z.preprocess(
        (v) => (v === undefined || v === null ? 1 : Number(v)),
        z.number({ invalid_type_error: "quantity must be a number" }).int().min(1, "quantity must be at least 1")
    ).default(1),
    variations: z.array(offerVariationSchema).optional().default([]),
});

export const createOfferSchema = z.preprocess(
    normalizeOfferInput,
    z.object({
        name: z.string({ required_error: "Offer name is required" }).min(1, "Offer name is required").max(255, "Name cannot exceed 255 characters"),
        nameAr: z.string().max(255, "Arabic name cannot exceed 255 characters").optional().nullable(),
        nameFr: z.string().max(255, "French name cannot exceed 255 characters").optional().nullable(),
        image: z.string().optional().nullable(),
        startDate: z.preprocess((val) => {
            if (typeof val === "string" || val instanceof Date) return new Date(val);
            return val;
        }, z.date({ required_error: "startDate is required" })),
        endDate: z.preprocess((val) => {
            if (typeof val === "string" || val instanceof Date) return new Date(val);
            return val;
        }, z.date({ required_error: "endDate is required" })),
        price: z.preprocess(
            (val) => {
                if (typeof val === "string" && val.trim() !== "") {
                    const num = Number(val);
                    return isNaN(num) ? val : num;
                }
                return val;
            },
            z
                .number({
                    required_error: "Price is required",
                    invalid_type_error: "Price must be numeric",
                })
                .min(0, "Price must be 0 or greater")
                .transform((v) => String(v))
        ),
        foods: z.array(offerFoodItemSchema).optional().default([]),
        foodIds: z.array(z.string().min(1)).optional().default([]),
        food_ids: z.array(z.string().min(1)).optional(),
        branchIds: z.array(z.string().min(1)).optional().default([]),
        branch_ids: z.array(z.string().min(1)).optional(),
        status: z.enum(["active", "inactive"]).optional().default("active"),
    })
);

export const updateOfferSchema = z.preprocess(
    normalizeOfferInput,
    z.object({
        name: z.string().min(1, "Offer name cannot be empty").max(255, "Name cannot exceed 255 characters").optional(),
        nameAr: z.string().max(255, "Arabic name cannot exceed 255 characters").optional().nullable(),
        nameFr: z.string().max(255, "French name cannot exceed 255 characters").optional().nullable(),
        image: z.string().optional().nullable(),
        startDate: z.preprocess((val) => {
            if (typeof val === "string" || val instanceof Date) return new Date(val);
            return val;
        }, z.date()).optional(),
        endDate: z.preprocess((val) => {
            if (typeof val === "string" || val instanceof Date) return new Date(val);
            return val;
        }, z.date()).optional(),
        price: z
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
                        invalid_type_error: "Price must be numeric",
                    })
                    .min(0, "Price must be 0 or greater")
                    .transform((v) => String(v))
            )
            .optional(),
        foods: z.array(offerFoodItemSchema).optional(),
        foodIds: z.array(z.string().min(1)).optional(),
        food_ids: z.array(z.string().min(1)).optional(),
        branchIds: z.array(z.string().min(1)).optional(),
        branch_ids: z.array(z.string().min(1)).optional(),
        status: z.enum(["active", "inactive"]).optional(),
    })
);

export type CreateOfferInput = z.infer<typeof createOfferSchema>;
export type UpdateOfferInput = z.infer<typeof updateOfferSchema>;
export type OfferFoodItemInput = z.infer<typeof offerFoodItemSchema>;
export type OfferVariationInput = z.infer<typeof offerVariationSchema>;
