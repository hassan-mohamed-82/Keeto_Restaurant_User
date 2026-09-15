"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supplierQuerySchema = exports.updateSupplierSchema = exports.createSupplierSchema = void 0;
const zod_1 = require("zod");
const preprocessBoolean = (val) => {
    if (val === undefined || val === null)
        return undefined;
    if (val === true || val === "true" || val === 1 || val === "1")
        return true;
    if (val === false || val === "false" || val === 0 || val === "0")
        return false;
    return Boolean(val);
};
const preprocessNumeric = (val) => {
    if (val === undefined || val === null || val === "")
        return undefined;
    const num = Number(val);
    return isNaN(num) ? val : num;
};
exports.createSupplierSchema = zod_1.z.object({
    name: zod_1.z.string({ required_error: "Supplier name is required" }).min(1, "Name cannot be empty").max(255),
    email: zod_1.z.string().email("Invalid email format").max(255).optional().nullable().or(zod_1.z.literal("")),
    phone: zod_1.z.string({ required_error: "Phone number is required" }).min(1, "Phone cannot be empty").max(50),
    balance: zod_1.z.preprocess(preprocessNumeric, zod_1.z.number({ invalid_type_error: "Balance must be a valid number" })).optional().default(0).transform((v) => String(v)),
    status: zod_1.z.preprocess(preprocessBoolean, zod_1.z.boolean().optional().default(true)),
});
exports.updateSupplierSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, "Name cannot be empty").max(255).optional(),
    email: zod_1.z.string().email("Invalid email format").max(255).optional().nullable().or(zod_1.z.literal("")),
    phone: zod_1.z.string().min(1, "Phone cannot be empty").max(50).optional(),
    status: zod_1.z.preprocess(preprocessBoolean, zod_1.z.boolean().optional()),
});
exports.supplierQuerySchema = zod_1.z.object({
    page: zod_1.z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 1), zod_1.z.number().int().min(1).default(1)).optional(),
    limit: zod_1.z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 10), zod_1.z.number().int().min(1).max(100).default(10)).optional(),
    all: zod_1.z.preprocess((v) => v === "true" || v === true || v === 1 || v === "1", zod_1.z.boolean().default(false)).optional(),
    search: zod_1.z.string().optional(),
    status: zod_1.z.preprocess(preprocessBoolean, zod_1.z.boolean().optional()),
});
