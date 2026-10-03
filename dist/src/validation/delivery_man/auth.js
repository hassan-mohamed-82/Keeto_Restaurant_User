"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deliveryManLogoutSchema = exports.deliveryManLoginSchema = void 0;
const zod_1 = require("zod");
exports.deliveryManLoginSchema = zod_1.z.object({
    identifier: zod_1.z
        .string({ required_error: "Identifier (phone or email) is required" })
        .min(1, "Identifier cannot be empty"),
    password: zod_1.z
        .string({ required_error: "Password is required" })
        .min(1, "Password cannot be empty"),
    fcmToken: zod_1.z.string().optional().nullable(),
});
exports.deliveryManLogoutSchema = zod_1.z.object({
    fcmToken: zod_1.z.string().optional().nullable(),
});
