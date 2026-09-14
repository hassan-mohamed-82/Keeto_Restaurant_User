"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateImageSchema = exports.createImageSchema = void 0;
const zod_1 = require("zod");
const constant_1 = require("../../types/constant");
const normalizeImagePayload = (obj) => {
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
        if (obj.priority !== undefined && obj.periorty === undefined) {
            obj.periorty = obj.priority;
        }
    }
    return obj;
};
exports.createImageSchema = zod_1.z.preprocess(normalizeImagePayload, zod_1.z.object({
    img: zod_1.z.string({ required_error: "Image is required" }).min(1, "Image is required"),
    periorty: zod_1.z.preprocess((val) => {
        if (val === undefined || val === null || val === "")
            return 0;
        const num = Number(val);
        return isNaN(num) ? val : num;
    }, zod_1.z.number().int().optional().default(0)),
    linkType: zod_1.z.enum(constant_1.LINK_TYPES).optional().default("link"),
    link: zod_1.z.string().max(500).optional().nullable(),
    subcategoryId: zod_1.z.string().min(1).optional().nullable(),
    foodId: zod_1.z.string().min(1).optional().nullable(),
    productId: zod_1.z.string().min(1).optional().nullable(),
    discountId: zod_1.z.string().min(1).optional().nullable(),
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
exports.updateImageSchema = zod_1.z.preprocess(normalizeImagePayload, zod_1.z.object({
    img: zod_1.z.string().optional(),
    periorty: zod_1.z.preprocess((val) => {
        if (val === undefined || val === null || val === "")
            return undefined;
        const num = Number(val);
        return isNaN(num) ? val : num;
    }, zod_1.z.number().int().optional()),
    linkType: zod_1.z.enum(constant_1.LINK_TYPES).optional(),
    link: zod_1.z.string().max(500).optional().nullable(),
    subcategoryId: zod_1.z.string().optional().nullable(),
    foodId: zod_1.z.string().optional().nullable(),
    productId: zod_1.z.string().optional().nullable(),
    discountId: zod_1.z.string().optional().nullable(),
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
