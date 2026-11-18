"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bulkApplyFoodDiscountSchema = exports.updateFoodSchema = exports.createFoodSchema = void 0;
exports.safeParseJson = safeParseJson;
const zod_1 = require("zod");
exports.createFoodSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, "Name is required").max(255),
    description: zod_1.z.string().min(1, "Description is required"),
    image: zod_1.z.string().min(1, "Image is required").max(500),
    startTime: zod_1.z.string().min(1, "Start time is required").max(255),
    endTime: zod_1.z.string().min(1, "End time is required").max(255),
    price: zod_1.z.coerce.string({
        required_error: "Price is required",
        invalid_type_error: "Price must be a valid number",
    }).min(1, "Price cannot be empty"),
    restaurantid: zod_1.z.string().uuid("Invalid Restaurant ID"),
    categoryid: zod_1.z.string().uuid("Invalid Category ID"),
    subcategoryid: zod_1.z.string().uuid("Invalid Subcategory ID"),
    nameAr: zod_1.z.string().max(255).optional(),
    nameFr: zod_1.z.string().max(255).optional(),
    descriptionAr: zod_1.z.string().optional(),
    descriptionFr: zod_1.z.string().optional(),
    foodtype: zod_1.z.enum(["veg", "non-veg"]).optional(),
    Nutrition: zod_1.z.string().optional(),
    allergen_ingredients: zod_1.z.string().optional(),
    is_Halal: zod_1.z.boolean().optional(),
    addonsId: zod_1.z.string().uuid("Invalid Addons ID").optional(),
    search_tags: zod_1.z.string().max(255).optional(),
    discount_type: zod_1.z.enum(["percentage", "amount"]).optional(),
    discount_value: zod_1.z.coerce.string().optional(),
    Maximum_Purchase: zod_1.z.coerce.number().int().min(1).optional(),
    stock_type: zod_1.z.enum(["limited", "unlimited", "daily"]).optional(),
    status: zod_1.z.enum(["active", "inactive"]).optional(),
    sold_by: zod_1.z.enum(["unit", "weight"]).optional().default("unit"),
    weight_unit: zod_1.z.enum(["kg", "gm"]).optional().nullable(),
});
exports.updateFoodSchema = exports.createFoodSchema.partial();
function safeParseJson(val) {
    if (typeof val === "string") {
        const trimmed = val.trim();
        if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
            try {
                return JSON.parse(trimmed);
            }
            catch {
                return val;
            }
        }
    }
    return val;
}
const parseIdArray = (val) => {
    if (val === undefined || val === null || val === "")
        return [];
    val = safeParseJson(val);
    if (typeof val === "string") {
        if (val.includes(","))
            return val.split(",").map((s) => s.trim()).filter(Boolean);
        return val.trim() ? [val.trim()] : [];
    }
    if (Array.isArray(val)) {
        return val.map(String).map((s) => s.trim()).filter(Boolean);
    }
    return [];
};
const normalizeBulkDiscountInput = (obj) => {
    if (obj && typeof obj === "object") {
        if (obj.discountType === undefined && obj.discount_type !== undefined) {
            obj.discountType = obj.discount_type;
        }
        if (obj.discountValue === undefined && obj.discount_value !== undefined) {
            obj.discountValue = obj.discount_value;
        }
        if (obj.foodIds === undefined) {
            obj.foodIds = parseIdArray(obj.food_ids ?? obj.productIds ?? obj.product_ids ?? obj.products);
        }
        else {
            obj.foodIds = parseIdArray(obj.foodIds);
        }
        if (obj.subCategoryIds === undefined) {
            obj.subCategoryIds = parseIdArray(obj.subcategoryIds ?? obj.sub_category_ids ?? obj.subcategory_ids ?? obj.subcategories);
        }
        else {
            obj.subCategoryIds = parseIdArray(obj.subCategoryIds);
        }
        if (obj.categoryIds === undefined) {
            obj.categoryIds = parseIdArray(obj.category_ids ?? obj.categories);
        }
        else {
            obj.categoryIds = parseIdArray(obj.categoryIds);
        }
    }
    return obj;
};
exports.bulkApplyFoodDiscountSchema = zod_1.z.preprocess(normalizeBulkDiscountInput, zod_1.z.object({
    discountType: zod_1.z.enum(["percentage", "amount"]).optional().default("percentage"),
    discountValue: zod_1.z.coerce.number().min(0, "discountValue must be non-negative").optional().nullable(),
    foodIds: zod_1.z.array(zod_1.z.string().min(1)).optional().default([]),
    subCategoryIds: zod_1.z.array(zod_1.z.string().min(1)).optional().default([]),
    categoryIds: zod_1.z.array(zod_1.z.string().min(1)).optional().default([]),
}).refine((data) => {
    const type = data.discountType || "percentage";
    const val = data.discountValue || 0;
    if (type === "percentage" && val > 100) {
        return false;
    }
    return true;
}, {
    message: "Discount percentage cannot exceed 100%",
    path: ["discountValue"],
}));
