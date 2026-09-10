"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertTaxTypeSchema = exports.TAX_TYPE_ENUM = void 0;
const zod_1 = require("zod");
exports.TAX_TYPE_ENUM = ["include", "exclude"];
exports.upsertTaxTypeSchema = zod_1.z.object({
    type: zod_1.z.enum(exports.TAX_TYPE_ENUM, {
        required_error: "Type is required and must be either 'include' or 'exclude'",
        invalid_type_error: "Type must be either 'include' or 'exclude'",
    }),
    // Optional - if provided, controller strictly ensures it matches req.user.restaurantId
    restrauntid: zod_1.z.string().optional(),
    restaurantId: zod_1.z.string().optional(),
});
