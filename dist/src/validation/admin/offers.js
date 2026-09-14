"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOfferFoodsSchema = exports.updateOfferSchema = exports.createOfferSchema = exports.offerFoodItemSchema = exports.offerVariationSchema = exports.parseStringOrArray = exports.SUPPORTED_LANGUAGES = void 0;
exports.safeParseJson = safeParseJson;
const zod_1 = require("zod");
exports.SUPPORTED_LANGUAGES = ["en", "ar", "fr"];
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
const parseStringOrArray = (val) => {
    if (val === undefined || val === null)
        return [];
    val = safeParseJson(val);
    if (typeof val === "string") {
        if (val.includes(","))
            return val.split(",").map((s) => s.trim()).filter(Boolean);
        return val.trim() ? [val.trim()] : [];
    }
    if (Array.isArray(val)) {
        return val.map(String).filter(Boolean);
    }
    return [];
};
exports.parseStringOrArray = parseStringOrArray;
const normalizeOfferInput = (obj) => {
    if (obj && typeof obj === "object") {
        // Normalize branchIds
        if (obj.branchIds === undefined && obj.branch_ids !== undefined) {
            obj.branchIds = safeParseJson(obj.branch_ids);
        }
        else if (obj.branch_ids === undefined && obj.branchIds !== undefined) {
            obj.branch_ids = safeParseJson(obj.branchIds);
        }
        else if (obj.branchIds !== undefined) {
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
        if (incomingFoods && typeof incomingFoods === "object" && !Array.isArray(incomingFoods)) {
            if (incomingFoods.foodId || incomingFoods.food_id || incomingFoods.id) {
                incomingFoods = [incomingFoods];
            }
            else {
                incomingFoods = Object.values(incomingFoods);
            }
        }
        if (Array.isArray(incomingFoods)) {
            const rawParsedItems = incomingFoods.map((item) => {
                if (typeof item === "string") {
                    return { foodId: item, quantity: 1, variations: [] };
                }
                if (item && typeof item === "object") {
                    const foodId = String(item.foodId || item.food_id || item.id || "");
                    const quantity = item.quantity !== undefined ? item.quantity : 1;
                    let variations = item.variations;
                    variations = safeParseJson(variations);
                    if (variations && typeof variations === "object" && !Array.isArray(variations)) {
                        if (variations.variationId || variations.variation_id || variations.options || variations.optionIds || variations.optionId || variations.option_id) {
                            variations = [variations];
                        }
                        else {
                            const vals = Object.values(variations);
                            if (vals.length > 0 && typeof vals[0] === "object") {
                                variations = vals;
                            }
                            else {
                                variations = Object.entries(variations).map(([k, v]) => ({
                                    variationId: k,
                                    options: v,
                                }));
                            }
                        }
                    }
                    const directOptions = (0, exports.parseStringOrArray)(item.options || item.optionIds || item.optionsIds || item.option_ids || item.options_ids || item.optionId || item.option_id);
                    const directVarId = item.variationId || item.variation_id || null;
                    let normalizedVariations = [];
                    if (Array.isArray(variations)) {
                        normalizedVariations = variations.map((v) => {
                            if (typeof v === "string") {
                                return { variationId: null, options: [v] };
                            }
                            const vId = v.variationId || v.variation_id || null;
                            const vOpts = (0, exports.parseStringOrArray)(v.options || v.optionIds || v.optionsIds || v.option_ids || v.optionId || v.option_id);
                            return {
                                variationId: vId,
                                options: vOpts,
                            };
                        });
                    }
                    if (directOptions.length > 0) {
                        normalizedVariations.push({
                            variationId: directVarId,
                            options: directOptions,
                        });
                    }
                    return {
                        foodId,
                        quantity,
                        variations: normalizedVariations,
                    };
                }
                return item;
            }).filter((item) => item && item.foodId);
            // Group and merge by foodId
            const mergedFoodMap = new Map();
            for (const item of rawParsedItems) {
                const fid = item.foodId;
                if (!mergedFoodMap.has(fid)) {
                    mergedFoodMap.set(fid, {
                        foodId: fid,
                        quantity: item.quantity,
                        variations: [...item.variations],
                    });
                }
                else {
                    const existing = mergedFoodMap.get(fid);
                    existing.quantity = Math.max(existing.quantity, item.quantity);
                    existing.variations.push(...item.variations);
                }
            }
            // Consolidate variations with the same variationId under each food
            obj.foods = Array.from(mergedFoodMap.values()).map((f) => {
                const vMap = new Map();
                for (const v of f.variations) {
                    const vKey = v.variationId ? String(v.variationId) : `auto_${Math.random()}`;
                    const vOpts = Array.isArray(v.options) ? v.options.map(String) : [];
                    if (!vMap.has(vKey)) {
                        vMap.set(vKey, {
                            variationId: v.variationId || null,
                            options: [...vOpts],
                        });
                    }
                    else {
                        const ex = vMap.get(vKey);
                        ex.options = Array.from(new Set([...ex.options, ...vOpts]));
                    }
                }
                return {
                    foodId: f.foodId,
                    quantity: f.quantity,
                    variations: Array.from(vMap.values()),
                };
            });
        }
        else {
            // Check if legacy foodIds or food_ids were passed
            let legacyFoodIds = obj.foodIds !== undefined ? obj.foodIds : obj.food_ids;
            legacyFoodIds = safeParseJson(legacyFoodIds);
            if (Array.isArray(legacyFoodIds)) {
                obj.foods = legacyFoodIds.map((id) => ({
                    foodId: String(id),
                    quantity: 1,
                    variations: [],
                }));
            }
        }
        // Also ensure foodIds is populated for backward compatibility
        if (Array.isArray(obj.foods)) {
            obj.foodIds = Array.from(new Set(obj.foods.map((f) => f?.foodId).filter(Boolean)));
            obj.food_ids = obj.foodIds;
        }
    }
    return obj;
};
// ==========================================
// Offers Validation Schemas
// ==========================================
const stringOrArraySchema = zod_1.z.preprocess((val) => {
    return (0, exports.parseStringOrArray)(val);
}, zod_1.z.array(zod_1.z.string()).default([]));
exports.offerVariationSchema = zod_1.z.preprocess((raw) => {
    if (typeof raw === "string") {
        const parsed = safeParseJson(raw);
        if (typeof parsed === "object" && parsed !== null)
            return parsed;
        return { variationId: null, options: [raw] };
    }
    return raw;
}, zod_1.z.object({
    variationId: zod_1.z.string().optional().nullable(),
    variation_id: zod_1.z.string().optional().nullable(),
    options: stringOrArraySchema.optional().default([]),
    optionIds: stringOrArraySchema.optional(),
    optionsIds: stringOrArraySchema.optional(),
    option_ids: stringOrArraySchema.optional(),
    optionId: stringOrArraySchema.optional(),
    option_id: stringOrArraySchema.optional(),
}).transform((val) => {
    const rawOptions = [
        ...(val.options || []),
        ...(val.optionIds || []),
        ...(val.optionsIds || []),
        ...(val.option_ids || []),
        ...(val.optionId || []),
        ...(val.option_id || []),
    ];
    return {
        variationId: val.variationId || val.variation_id || null,
        options: Array.from(new Set(rawOptions.map(String).filter(Boolean))),
    };
}));
exports.offerFoodItemSchema = zod_1.z.preprocess((raw) => {
    if (typeof raw === "string") {
        return { foodId: raw, quantity: 1, variations: [] };
    }
    return raw;
}, zod_1.z.object({
    foodId: zod_1.z.string({ required_error: "foodId is required" }).min(1, "foodId cannot be empty"),
    quantity: zod_1.z.preprocess((v) => (v === undefined || v === null ? 1 : Number(v)), zod_1.z.number({ invalid_type_error: "quantity must be a number" }).int().min(1, "quantity must be at least 1")).default(1),
    variations: zod_1.z.preprocess((val) => {
        if (val === undefined || val === null)
            return [];
        val = safeParseJson(val);
        if (Array.isArray(val))
            return val;
        if (typeof val === "object" && val !== null) {
            const objVal = val;
            if (objVal.variationId || objVal.variation_id || objVal.options || objVal.optionIds || objVal.optionId || objVal.option_id) {
                return [objVal];
            }
            const values = Object.values(objVal);
            if (values.length > 0 && typeof values[0] === "object") {
                return values;
            }
            return Object.entries(objVal).map(([varId, opts]) => ({
                variationId: varId,
                options: opts,
            }));
        }
        return [];
    }, zod_1.z.array(exports.offerVariationSchema)).optional().default([]),
}));
exports.createOfferSchema = zod_1.z.preprocess(normalizeOfferInput, zod_1.z.object({
    name: zod_1.z.string({ required_error: "Offer name is required" }).min(1, "Offer name is required").max(255, "Name cannot exceed 255 characters"),
    nameAr: zod_1.z.string().max(255, "Arabic name cannot exceed 255 characters").optional().nullable(),
    nameFr: zod_1.z.string().max(255, "French name cannot exceed 255 characters").optional().nullable(),
    image: zod_1.z.string().optional().nullable(),
    startDate: zod_1.z.preprocess((val) => {
        if (typeof val === "string" || val instanceof Date)
            return new Date(val);
        return val;
    }, zod_1.z.date({ required_error: "startDate is required" })),
    endDate: zod_1.z.preprocess((val) => {
        if (typeof val === "string" || val instanceof Date)
            return new Date(val);
        return val;
    }, zod_1.z.date({ required_error: "endDate is required" })),
    price: zod_1.z.preprocess((val) => {
        if (typeof val === "string" && val.trim() !== "") {
            const num = Number(val);
            return isNaN(num) ? val : num;
        }
        return val;
    }, zod_1.z
        .number({
        required_error: "Price is required",
        invalid_type_error: "Price must be numeric",
    })
        .min(0, "Price must be 0 or greater")
        .transform((v) => String(v))),
    foods: zod_1.z.array(exports.offerFoodItemSchema).optional().default([]),
    foodIds: zod_1.z.array(zod_1.z.string().min(1)).optional().default([]),
    food_ids: zod_1.z.array(zod_1.z.string().min(1)).optional(),
    branchIds: zod_1.z.array(zod_1.z.string().min(1)).optional().default([]),
    branch_ids: zod_1.z.array(zod_1.z.string().min(1)).optional(),
    status: zod_1.z.enum(["active", "inactive"]).optional().default("active"),
}));
exports.updateOfferSchema = zod_1.z.preprocess(normalizeOfferInput, zod_1.z.object({
    name: zod_1.z.string().min(1, "Offer name cannot be empty").max(255, "Name cannot exceed 255 characters").optional(),
    nameAr: zod_1.z.string().max(255, "Arabic name cannot exceed 255 characters").optional().nullable(),
    nameFr: zod_1.z.string().max(255, "French name cannot exceed 255 characters").optional().nullable(),
    image: zod_1.z.string().optional().nullable(),
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
    price: zod_1.z
        .preprocess((val) => {
        if (typeof val === "string" && val.trim() !== "") {
            const num = Number(val);
            return isNaN(num) ? val : num;
        }
        return val;
    }, zod_1.z
        .number({
        invalid_type_error: "Price must be numeric",
    })
        .min(0, "Price must be 0 or greater")
        .transform((v) => String(v)))
        .optional(),
    foods: zod_1.z.array(exports.offerFoodItemSchema).optional(),
    foodIds: zod_1.z.array(zod_1.z.string().min(1)).optional(),
    food_ids: zod_1.z.array(zod_1.z.string().min(1)).optional(),
    branchIds: zod_1.z.array(zod_1.z.string().min(1)).optional(),
    branch_ids: zod_1.z.array(zod_1.z.string().min(1)).optional(),
    status: zod_1.z.enum(["active", "inactive"]).optional(),
}));
exports.getOfferFoodsSchema = zod_1.z.object({
    page: zod_1.z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 1), zod_1.z.number().int().min(1).default(1)).optional(),
    limit: zod_1.z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 10), zod_1.z.number().int().min(1).max(100).default(10)).optional(),
    all: zod_1.z.preprocess((v) => (v === "true" || v === true), zod_1.z.boolean().default(false)).optional(),
    search: zod_1.z.string().optional(),
    name: zod_1.z.string().optional(),
    nameAr: zod_1.z.string().optional(),
    nameFr: zod_1.z.string().optional(),
    subcategory_id: zod_1.z.string().optional(),
    status: zod_1.z.enum(["active", "inactive", "all"]).optional(),
});
