"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deliveryManNotificationQuerySchema = void 0;
const zod_1 = require("zod");
exports.deliveryManNotificationQuerySchema = zod_1.z.object({
    page: zod_1.z.preprocess((val) => (val ? Number(val) : 1), zod_1.z.number().int().min(1).default(1)),
    limit: zod_1.z.preprocess((val) => (val ? Number(val) : 20), zod_1.z.number().int().min(1).max(100).default(20)),
    unreadOnly: zod_1.z.preprocess((val) => val === "true" || val === true, zod_1.z.boolean().optional()),
    isRead: zod_1.z.preprocess((val) => val === "true" || val === true ? true : (val === "false" || val === false ? false : undefined), zod_1.z.boolean().optional()),
});
