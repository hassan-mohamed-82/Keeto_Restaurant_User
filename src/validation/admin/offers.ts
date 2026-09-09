import { z } from "zod";

export const SUPPORTED_LANGUAGES = ["en", "ar", "fr"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const normalizeBranchIds = (obj: any) => {
    if (obj && typeof obj === "object") {
        if (obj.branchIds === undefined && obj.branch_ids !== undefined) {
            obj.branchIds = obj.branch_ids;
        } else if (obj.branch_ids === undefined && obj.branchIds !== undefined) {
            obj.branch_ids = obj.branchIds;
        }
        if (obj.foodIds === undefined && obj.food_ids !== undefined) {
            obj.foodIds = obj.food_ids;
        } else if (obj.food_ids === undefined && obj.foodIds !== undefined) {
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

export const createOfferSchema = z.preprocess(
    normalizeBranchIds,
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
        foodIds: z.array(z.string().min(1)).optional().default([]),
        food_ids: z.array(z.string().min(1)).optional(),
        branchIds: z.array(z.string().min(1)).optional().default([]),
        branch_ids: z.array(z.string().min(1)).optional(),
        status: z.enum(["active", "inactive"]).optional().default("active"),
    })
);

export const updateOfferSchema = z.preprocess(
    normalizeBranchIds,
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
        foodIds: z.array(z.string().min(1)).optional(),
        food_ids: z.array(z.string().min(1)).optional(),
        branchIds: z.array(z.string().min(1)).optional(),
        branch_ids: z.array(z.string().min(1)).optional(),
        status: z.enum(["active", "inactive"]).optional(),
    })
);

export type CreateOfferInput = z.infer<typeof createOfferSchema>;
export type UpdateOfferInput = z.infer<typeof updateOfferSchema>;
