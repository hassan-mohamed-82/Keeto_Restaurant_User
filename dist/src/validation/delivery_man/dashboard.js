"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deliveryManDashboardQuerySchema = void 0;
const zod_1 = require("zod");
exports.deliveryManDashboardQuerySchema = zod_1.z.object({
    startDate: zod_1.z.string().optional(),
    endDate: zod_1.z.string().optional(),
    period: zod_1.z.enum(["today", "this_week", "this_month", "all"]).optional(),
});
