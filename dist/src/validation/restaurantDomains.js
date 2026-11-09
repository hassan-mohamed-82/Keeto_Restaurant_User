"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveDomainQuerySchema = void 0;
const zod_1 = require("zod");
exports.resolveDomainQuerySchema = zod_1.z.object({
    host: zod_1.z
        .string()
        .min(1)
        .transform((v) => v.trim().toLowerCase().replace(/:\d+$/, "")), // strip port
});
