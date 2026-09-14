import { z } from "zod";
import { LINK_TYPES } from "../../types/constant";

const normalizePopupPayload = (obj: any) => {
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
        if (obj.start_date !== undefined && obj.startDate === undefined) {
            obj.startDate = obj.start_date;
        }
        if (obj.end_date !== undefined && obj.endDate === undefined) {
            obj.endDate = obj.end_date;
        }
    }
    return obj;
};

export const createPopupSchema = z.preprocess(
    normalizePopupPayload,
    z.object({
        Title: z.string({ required_error: "Popup title is required" }).min(1, "Popup title is required").max(255),
        TitleAr: z.string().max(255).optional().nullable(),
        TitleFr: z.string().max(255).optional().nullable(),
        description: z.string().max(500).optional().nullable(),
        descriptionAr: z.string().max(500).optional().nullable(),
        descriptionFr: z.string().max(500).optional().nullable(),
        image: z.string().optional().nullable(),
        imageAr: z.string().optional().nullable(),
        imageFr: z.string().optional().nullable(),
        type: z.enum(["web", "home_web", "home_app", "mykeeto_app"]).optional().default("mykeeto_app"),
        linkType: z.enum(LINK_TYPES).optional().default("link"),
        link: z.string().max(500).optional().nullable(),
        subcategoryId: z.string().min(1).optional().nullable(),
        foodId: z.string().min(1).optional().nullable(),
        productId: z.string().min(1).optional().nullable(),
        discountId: z.string().min(1).optional().nullable(),
        status: z.enum(["active", "inactive"]).optional().default("active"),
        startDate: z.preprocess((val) => {
            if (typeof val === "string" || val instanceof Date) return new Date(val);
            return val;
        }, z.date({ required_error: "Start date is required" })),
        endDate: z.preprocess((val) => {
            if (typeof val === "string" || val instanceof Date) return new Date(val);
            return val;
        }, z.date({ required_error: "End date is required" })),
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

export const updatePopupSchema = z.preprocess(
    normalizePopupPayload,
    z.object({
        Title: z.string().min(1).max(255).optional(),
        TitleAr: z.string().max(255).optional().nullable(),
        TitleFr: z.string().max(255).optional().nullable(),
        description: z.string().max(500).optional().nullable(),
        descriptionAr: z.string().max(500).optional().nullable(),
        descriptionFr: z.string().max(500).optional().nullable(),
        image: z.string().optional().nullable(),
        imageAr: z.string().optional().nullable(),
        imageFr: z.string().optional().nullable(),
        type: z.enum(["web", "home_web", "home_app", "mykeeto_app"]).optional(),
        linkType: z.enum(LINK_TYPES).optional(),
        link: z.string().max(500).optional().nullable(),
        subcategoryId: z.string().optional().nullable(),
        foodId: z.string().optional().nullable(),
        productId: z.string().optional().nullable(),
        discountId: z.string().optional().nullable(),
        status: z.enum(["active", "inactive"]).optional(),
        startDate: z.preprocess((val) => {
            if (typeof val === "string" || val instanceof Date) return new Date(val);
            return val;
        }, z.date()).optional(),
        endDate: z.preprocess((val) => {
            if (typeof val === "string" || val instanceof Date) return new Date(val);
            return val;
        }, z.date()).optional(),
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

export type CreatePopupInput = z.infer<typeof createPopupSchema>;
export type UpdatePopupInput = z.infer<typeof updatePopupSchema>;
