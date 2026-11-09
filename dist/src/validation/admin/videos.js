"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVideosQuerySchema = exports.videoIdParamSchema = void 0;
const zod_1 = require("zod");
exports.videoIdParamSchema = zod_1.z.object({
    id: zod_1.z.string().uuid("Invalid video ID"),
});
exports.getVideosQuerySchema = zod_1.z.object({
    search: zod_1.z.string().trim().optional(),
    status: zod_1.z.enum(["active", "inactive", "all"]).optional().default("all"),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
});
