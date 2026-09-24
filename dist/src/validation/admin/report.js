"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportVisaQuerySchema = void 0;
const zod_1 = require("zod");
exports.reportVisaQuerySchema = zod_1.z.object({
    status: zod_1.z.string().optional(),
    paymentStatus: zod_1.z.string().optional(),
    payment_status: zod_1.z.string().optional(),
    type: zod_1.z.string().optional(),
    startDate: zod_1.z.string().optional(),
    endDate: zod_1.z.string().optional(),
    branchId: zod_1.z.string().optional(),
    orderNumber: zod_1.z.string().optional(),
    page: zod_1.z.string().optional(),
    limit: zod_1.z.string().optional(),
}).passthrough();
