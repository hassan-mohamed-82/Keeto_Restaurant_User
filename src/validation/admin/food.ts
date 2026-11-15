import { z } from "zod";

export const createFoodSchema = z.object({
    name: z.string().min(1, "Name is required").max(255),
    description: z.string().min(1, "Description is required"),
    image: z.string().min(1, "Image is required").max(500),
    startTime: z.string().min(1, "Start time is required").max(255),
    endTime: z.string().min(1, "End time is required").max(255),
    price: z.coerce.string({
        required_error: "Price is required",
        invalid_type_error: "Price must be a valid number",
    }).min(1, "Price cannot be empty"),
    restaurantid: z.string().uuid("Invalid Restaurant ID"),
    categoryid: z.string().uuid("Invalid Category ID"),
    subcategoryid: z.string().uuid("Invalid Subcategory ID"),
    nameAr: z.string().max(255).optional(),
    nameFr: z.string().max(255).optional(),
    descriptionAr: z.string().optional(),
    descriptionFr: z.string().optional(),
    foodtype: z.enum(["veg", "non-veg"]).optional(),
    Nutrition: z.string().optional(),
    allergen_ingredients: z.string().optional(),
    is_Halal: z.boolean().optional(),
    addonsId: z.string().uuid("Invalid Addons ID").optional(),
    search_tags: z.string().max(255).optional(),
    discount_type: z.enum(["percentage", "amount"]).optional(),
    discount_value: z.coerce.string().optional(),
    Maximum_Purchase: z.coerce.number().int().min(1).optional(),
    stock_type: z.enum(["limited", "unlimited", "daily"]).optional(),
    status: z.enum(["active", "inactive"]).optional(),
    sold_by: z.enum(["unit", "weight"]).optional().default("unit"),
    weight_unit: z.enum(["kg", "gm"]).optional().nullable(),
});

export const updateFoodSchema = createFoodSchema.partial();

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

const parseIdArray = (val: any): string[] => {
    if (val === undefined || val === null || val === "") return [];
    val = safeParseJson(val);
    if (typeof val === "string") {
        if (val.includes(",")) return val.split(",").map((s) => s.trim()).filter(Boolean);
        return val.trim() ? [val.trim()] : [];
    }
    if (Array.isArray(val)) {
        return val.map(String).map((s) => s.trim()).filter(Boolean);
    }
    return [];
};

const normalizeBulkDiscountInput = (obj: any) => {
    if (obj && typeof obj === "object") {
        if (obj.discountType === undefined && obj.discount_type !== undefined) {
            obj.discountType = obj.discount_type;
        }
        if (obj.discountValue === undefined && obj.discount_value !== undefined) {
            obj.discountValue = obj.discount_value;
        }
        if (obj.foodIds === undefined) {
            obj.foodIds = parseIdArray(obj.food_ids ?? obj.productIds ?? obj.product_ids ?? obj.products);
        } else {
            obj.foodIds = parseIdArray(obj.foodIds);
        }
        if (obj.subCategoryIds === undefined) {
            obj.subCategoryIds = parseIdArray(obj.subcategoryIds ?? obj.sub_category_ids ?? obj.subcategory_ids ?? obj.subcategories);
        } else {
            obj.subCategoryIds = parseIdArray(obj.subCategoryIds);
        }
        if (obj.categoryIds === undefined) {
            obj.categoryIds = parseIdArray(obj.category_ids ?? obj.categories);
        } else {
            obj.categoryIds = parseIdArray(obj.categoryIds);
        }
    }
    return obj;
};

export const bulkApplyFoodDiscountSchema = z.preprocess(
    normalizeBulkDiscountInput,
    z.object({
        discountType: z.enum(["percentage", "amount"]).optional().default("percentage"),
        discountValue: z.coerce.number().min(0, "discountValue must be non-negative").optional().nullable(),
        foodIds: z.array(z.string().min(1)).optional().default([]),
        subCategoryIds: z.array(z.string().min(1)).optional().default([]),
        categoryIds: z.array(z.string().min(1)).optional().default([]),
    }).refine(
        (data) => {
            const type = data.discountType || "percentage";
            const val = data.discountValue || 0;
            if (type === "percentage" && val > 100) {
                return false;
            }
            return true;
        },
        {
            message: "Discount percentage cannot exceed 100%",
            path: ["discountValue"],
        }
    )
);
