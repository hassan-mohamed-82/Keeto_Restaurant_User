"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePopupSchema = exports.createPopupSchema = void 0;
const zod_1 = require("zod");
const constant_1 = require("../../types/constant");
const normalizePopupPayload = (obj) => {
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
        }
        else if (obj.foodId !== undefined && obj.productId === undefined) {
            obj.productId = obj.foodId;
        }
        if (obj.discount_id !== undefined && obj.discountId === undefined) {
            obj.discountId = obj.discount_id;
        }
        if (obj.url !== undefined && obj.link === undefined) {
            obj.link = obj.url;
        }
        else if (obj.text !== undefined && obj.link === undefined) {
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
exports.createPopupSchema = zod_1.z.preprocess(normalizePopupPayload, zod_1.z.object({
    Title: zod_1.z.string({ required_error: "Popup title is required" }).min(1, "Popup title is required").max(255),
    TitleAr: zod_1.z.string().max(255).optional().nullable(),
    TitleFr: zod_1.z.string().max(255).optional().nullable(),
    description: zod_1.z.string().max(500).optional().nullable(),
    descriptionAr: zod_1.z.string().max(500).optional().nullable(),
    descriptionFr: zod_1.z.string().max(500).optional().nullable(),
    image: zod_1.z.string().optional().nullable(),
    imageAr: zod_1.z.string().optional().nullable(),
    imageFr: zod_1.z.string().optional().nullable(),
    type: zod_1.z.enum(["web", "home_web", "home_app", "mykeeto_app"]).optional().default("mykeeto_app"),
    linkType: zod_1.z.enum(constant_1.LINK_TYPES).optional().default("link"),
    link: zod_1.z.string().max(500).optional().nullable(),
    subcategoryId: zod_1.z.string().min(1).optional().nullable(),
    foodId: zod_1.z.string().min(1).optional().nullable(),
    productId: zod_1.z.string().min(1).optional().nullable(),
    discountId: zod_1.z.string().min(1).optional().nullable(),
    status: zod_1.z.enum(["active", "inactive"]).optional().default("active"),
    startDate: zod_1.z.preprocess((val) => {
        if (typeof val === "string" || val instanceof Date)
            return new Date(val);
        return val;
    }, zod_1.z.date({ required_error: "Start date is required" })),
    endDate: zod_1.z.preprocess((val) => {
        if (typeof val === "string" || val instanceof Date)
            return new Date(val);
        return val;
    }, zod_1.z.date({ required_error: "End date is required" })),
}).superRefine((data, ctx) => {
    if (data.linkType === "subcategory") {
        if (!data.subcategoryId || data.subcategoryId.trim() === "") {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: "Subcategory ID is required when linkType is 'subcategory'",
                path: ["subcategoryId"],
            });
        }
    }
    else if (data.linkType === "product") {
        const foodId = data.foodId || data.productId;
        if (!foodId || foodId.trim() === "") {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: "Product/Food ID is required when linkType is 'product'",
                path: ["productId"],
            });
        }
    }
    else if (data.linkType === "discount") {
        if (!data.discountId || data.discountId.trim() === "") {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: "Discount ID is required when linkType is 'discount'",
                path: ["discountId"],
            });
        }
    }
}));
exports.updatePopupSchema = zod_1.z.preprocess(normalizePopupPayload, zod_1.z.object({
    Title: zod_1.z.string().min(1).max(255).optional(),
    TitleAr: zod_1.z.string().max(255).optional().nullable(),
    TitleFr: zod_1.z.string().max(255).optional().nullable(),
    description: zod_1.z.string().max(500).optional().nullable(),
    descriptionAr: zod_1.z.string().max(500).optional().nullable(),
    descriptionFr: zod_1.z.string().max(500).optional().nullable(),
    image: zod_1.z.string().optional().nullable(),
    imageAr: zod_1.z.string().optional().nullable(),
    imageFr: zod_1.z.string().optional().nullable(),
    type: zod_1.z.enum(["web", "home_web", "home_app", "mykeeto_app"]).optional(),
    linkType: zod_1.z.enum(constant_1.LINK_TYPES).optional(),
    link: zod_1.z.string().max(500).optional().nullable(),
    subcategoryId: zod_1.z.string().optional().nullable(),
    foodId: zod_1.z.string().optional().nullable(),
    productId: zod_1.z.string().optional().nullable(),
    discountId: zod_1.z.string().optional().nullable(),
    status: zod_1.z.enum(["active", "inactive"]).optional(),
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
}).superRefine((data, ctx) => {
    if (data.linkType === "subcategory") {
        if (data.subcategoryId !== undefined && (!data.subcategoryId || data.subcategoryId.trim() === "")) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: "Subcategory ID cannot be empty when linkType is 'subcategory'",
                path: ["subcategoryId"],
            });
        }
    }
    else if (data.linkType === "product") {
        const foodId = data.foodId || data.productId;
        if (foodId !== undefined && (!foodId || foodId.trim() === "")) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: "Product/Food ID cannot be empty when linkType is 'product'",
                path: ["productId"],
            });
        }
    }
    else if (data.linkType === "discount") {
        if (data.discountId !== undefined && (!data.discountId || data.discountId.trim() === "")) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: "Discount ID cannot be empty when linkType is 'discount'",
                path: ["discountId"],
            });
        }
    }
}));
