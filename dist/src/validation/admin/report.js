"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.foodReportQuerySchema = exports.deliveryManReportQuerySchema = exports.reportVisaQuerySchema = void 0;
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
exports.deliveryManReportQuerySchema = zod_1.z.object({
    deliveryManId: zod_1.z.string().optional(),
    branchId: zod_1.z.string().optional(),
    startDate: zod_1.z.string().optional(),
    endDate: zod_1.z.string().optional(),
    status: zod_1.z.string().optional(),
    paymentMethod: zod_1.z.string().optional(),
    search: zod_1.z.string().optional(),
    page: zod_1.z.string().optional(),
    limit: zod_1.z.string().optional(),
}).passthrough();
exports.foodReportQuerySchema = zod_1.z.object({
    startDate: zod_1.z.string().optional(),
    endDate: zod_1.z.string().optional(),
    branchId: zod_1.z.string().optional(),
    status: zod_1.z.string().optional(),
    search: zod_1.z.string().optional(),
    categoryId: zod_1.z.string().optional(),
    arrangedType: zod_1.z.string().optional(),
    sortOrder: zod_1.z.string().optional(),
    sort: zod_1.z.string().optional(),
    sortBy: zod_1.z.string().optional(),
    onlySold: zod_1.z.string().optional(),
    page: zod_1.z.string().optional(),
    limit: zod_1.z.string().optional(),
}).passthrough();
