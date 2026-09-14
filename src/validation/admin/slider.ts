import { z } from "zod";
import { LINK_TYPES } from "../../types/constant";

const normalizeSliderPayload = (obj: any) => {
    if (obj && typeof obj === "object") {
        if (obj.link_type !== undefined && obj.linkType === undefined) {
            obj.linkType = obj.link_type;
        }
        if (obj.linkType === "category") {
            obj.linkType = "subcategory";
        }
        if (obj.subcategory_id !== undefined && obj.subcategoryId === undefined) {
            obj.subcategoryId = obj.subcategory_id;
        }
        if (obj.subCategoryId !== undefined && obj.subcategoryId === undefined) {
            obj.subcategoryId = obj.subCategoryId;
        }
        if (obj.category_id !== undefined && obj.subcategoryId === undefined) {
            obj.subcategoryId = obj.category_id;
        }
        if (obj.categoryId !== undefined && obj.subcategoryId === undefined) {
            obj.subcategoryId = obj.categoryId;
        }
        if (obj.food_id !== undefined && obj.foodId === undefined) {
            obj.foodId = obj.food_id;
        }
        if (obj.product_id !== undefined && obj.productId === undefined) {
            obj.productId = obj.product_id;
        }
        if (obj.productId !== undefined && obj.foodId === undefined) {
            obj.foodId = obj.productId;
        } else if (obj.foodId !== undefined && obj.productId === undefined) {
            obj.productId = obj.foodId;
        }
        if (obj.discount_id !== undefined && obj.discountId === undefined) {
            obj.discountId = obj.discount_id;
        }
        if (obj.url !== undefined && obj.link === undefined) {
            obj.link = obj.url;
        } else if (obj.text !== undefined && obj.link === undefined) {
            obj.link = obj.text;
        }
        if (obj.priority !== undefined && obj.periorty === undefined) {
            obj.periorty = obj.priority;
        }
    }
    return obj;
};

export const createSliderSchema = z.preprocess(
    normalizeSliderPayload,
    z.object({
        img: z.string({ required_error: "Image is required" }).min(1, "Image is required"),
        periorty: z.preprocess((val) => {
            if (val === undefined || val === null || val === "") return 0;
            const num = Number(val);
            return isNaN(num) ? val : num;
        }, z.number().int().optional().default(0)),
        linkType: z.enum(LINK_TYPES).optional().default("link"),
        link: z.string().max(500).optional().nullable(),
        subcategoryId: z.string().min(1).optional().nullable(),
        foodId: z.string().min(1).optional().nullable(),
        productId: z.string().min(1).optional().nullable(),
        discountId: z.string().min(1).optional().nullable(),
    }).superRefine((data, ctx) => {
        if (data.linkType === "subcategory") {
            if (!data.subcategoryId || data.subcategoryId.trim() === "") {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Subcategory ID is required when linkType is 'subcategory'",
                    path: ["subcategoryId"],
                });
            }
        } else if (data.linkType === "product") {
            const foodId = data.foodId || data.productId;
            if (!foodId || foodId.trim() === "") {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Product/Food ID is required when linkType is 'product'",
                    path: ["productId"],
                });
            }
        } else if (data.linkType === "discount") {
            if (!data.discountId || data.discountId.trim() === "") {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Discount ID is required when linkType is 'discount'",
                    path: ["discountId"],
                });
            }
        }
    })
);

export const updateSliderSchema = z.preprocess(
    normalizeSliderPayload,
    z.object({
        img: z.string().optional(),
        periorty: z.preprocess((val) => {
            if (val === undefined || val === null || val === "") return undefined;
            const num = Number(val);
            return isNaN(num) ? val : num;
        }, z.number().int().optional()),
        linkType: z.enum(LINK_TYPES).optional(),
        link: z.string().max(500).optional().nullable(),
        subcategoryId: z.string().optional().nullable(),
        foodId: z.string().optional().nullable(),
        productId: z.string().optional().nullable(),
        discountId: z.string().optional().nullable(),
    }).superRefine((data, ctx) => {
        if (data.linkType === "subcategory") {
            if (data.subcategoryId !== undefined && (!data.subcategoryId || data.subcategoryId.trim() === "")) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Subcategory ID cannot be empty when linkType is 'subcategory'",
                    path: ["subcategoryId"],
                });
            }
        } else if (data.linkType === "product") {
            const foodId = data.foodId || data.productId;
            if (foodId !== undefined && (!foodId || foodId.trim() === "")) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Product/Food ID cannot be empty when linkType is 'product'",
                    path: ["productId"],
                });
            }
        } else if (data.linkType === "discount") {
            if (data.discountId !== undefined && (!data.discountId || data.discountId.trim() === "")) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Discount ID cannot be empty when linkType is 'discount'",
                    path: ["discountId"],
                });
            }
        }
    })
);

export type CreateSliderInput = z.infer<typeof createSliderSchema>;
export type UpdateSliderInput = z.infer<typeof updateSliderSchema>;
