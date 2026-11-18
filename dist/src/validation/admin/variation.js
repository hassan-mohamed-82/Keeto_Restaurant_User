"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateVariationOptionSchema = exports.createVariationOptionSchema = exports.updateFoodVariationSchema = exports.createFoodVariationSchema = void 0;
const zod_1 = require("zod");
// ==========================================
// 1. Food Variations Validation
// ==========================================
exports.createFoodVariationSchema = zod_1.z.object({
    foodId: zod_1.z.string().uuid("Invalid Food ID"),
    name: zod_1.z.string().min(1, "Variation name is required").max(255),
    nameAr: zod_1.z.string().max(255).optional(),
    nameFr: zod_1.z.string().max(255).optional(),
    isRequired: zod_1.z.boolean().optional(),
    selectionType: zod_1.z.enum(["single", "multiple"]).optional(),
    min: zod_1.z.coerce.number().int().min(0, "Min cannot be negative").optional(),
    max: zod_1.z.coerce.number().int().min(1, "Max must be at least 1").optional(),
    status: zod_1.z.boolean().optional(),
});
exports.updateFoodVariationSchema = exports.createFoodVariationSchema.partial();
// ==========================================
// 2. Variation Options Validation
// ==========================================
exports.createVariationOptionSchema = zod_1.z.object({
    variationId: zod_1.z.string().uuid("Invalid Variation ID"),
    optionName: zod_1.z.string().min(1, "Option name is required").max(255),
    optionNameAr: zod_1.z.string().max(255).optional(),
    optionNameFr: zod_1.z.string().max(255).optional(),
    additionalPrice: zod_1.z.string().max(255).optional(),
    priceMode: zod_1.z.enum(["fixed", "per_weight"]).optional().default("fixed"),
    isDefault: zod_1.z.boolean().optional(),
    status: zod_1.z.boolean().optional(),
});
exports.updateVariationOptionSchema = exports.createVariationOptionSchema.partial();
