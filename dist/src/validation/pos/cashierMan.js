"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cashierManQuerySchema = exports.updateCashierManSchema = exports.createCashierManSchema = exports.ALLOWED_REPORT_PERMISSIONS = void 0;
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
const preprocessArray = (val) => {
    if (val === undefined || val === null)
        return undefined;
    if (Array.isArray(val))
        return val;
    if (typeof val === "string") {
        try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed))
                return parsed;
        }
        catch {
            return val.split(",").map((s) => s.trim()).filter(Boolean);
        }
    }
    return [val];
};
const normalizeCashierManInput = (obj) => {
    if (obj && typeof obj === "object") {
        if (obj.branch_id === undefined && obj.branchId !== undefined) {
            obj.branch_id = obj.branchId;
        }
        else if (obj.branchId === undefined && obj.branch_id !== undefined) {
            obj.branchId = obj.branch_id;
        }
        if (obj.my_id === undefined && obj.myId !== undefined) {
            obj.my_id = obj.myId;
        }
        else if (obj.myId === undefined && obj.my_id !== undefined) {
            obj.myId = obj.my_id;
        }
    }
    return obj;
};
exports.ALLOWED_REPORT_PERMISSIONS = ["unactive", "financial", "all_reports"];
exports.createCashierManSchema = zod_1.z.preprocess(normalizeCashierManInput, zod_1.z.object({
    name: zod_1.z.string().trim().max(255).optional(),
    user_name: zod_1.z.string({ required_error: "user_name is required" }).trim().min(1, "user_name cannot be empty").max(255),
    phone: zod_1.z.string({ required_error: "Phone is required" }).trim().min(1, "Phone cannot be empty").max(50),
    password: zod_1.z.string({ required_error: "Password is required" }).min(4, "Password must be at least 4 characters").max(255),
    branch_id: zod_1.z.string({ required_error: "branch_id is required" }).min(1, "branch_id cannot be empty"),
    branchId: zod_1.z.string().optional(),
    restaurant_id: zod_1.z.string().optional(),
    restaurantId: zod_1.z.string().optional(),
    my_id: zod_1.z.string().trim().max(255).optional().nullable().or(zod_1.z.literal("")),
    myId: zod_1.z.string().trim().max(255).optional().nullable().or(zod_1.z.literal("")),
    image: zod_1.z.string().optional().nullable().or(zod_1.z.literal("")),
    roles: zod_1.z.preprocess(preprocessArray, zod_1.z.array(zod_1.z.string()).optional().default([])),
    report_perimission: zod_1.z.preprocess(preprocessArray, zod_1.z.array(zod_1.z.string()).optional().default([])),
    status: zod_1.z.preprocess(preprocessBoolean, zod_1.z.boolean().optional().default(true)),
}));
exports.updateCashierManSchema = zod_1.z.preprocess(normalizeCashierManInput, zod_1.z.object({
    name: zod_1.z.string().trim().max(255).optional(),
    user_name: zod_1.z.string().trim().min(1, "user_name cannot be empty").max(255).optional(),
    phone: zod_1.z.string().trim().min(1, "Phone cannot be empty").max(50).optional(),
    password: zod_1.z.string().min(4, "Password must be at least 4 characters").max(255).optional().or(zod_1.z.literal("")),
    branch_id: zod_1.z.string().min(1, "branch_id cannot be empty").optional(),
    branchId: zod_1.z.string().optional(),
    restaurant_id: zod_1.z.string().optional(),
    restaurantId: zod_1.z.string().optional(),
    my_id: zod_1.z.string().trim().max(255).optional().nullable().or(zod_1.z.literal("")),
    myId: zod_1.z.string().trim().max(255).optional().nullable().or(zod_1.z.literal("")),
    image: zod_1.z.string().optional().nullable().or(zod_1.z.literal("")),
    roles: zod_1.z.preprocess(preprocessArray, zod_1.z.array(zod_1.z.string()).optional()),
    report_perimission: zod_1.z.preprocess(preprocessArray, zod_1.z.array(zod_1.z.string()).optional()),
    status: zod_1.z.preprocess(preprocessBoolean, zod_1.z.boolean().optional()),
}));
exports.cashierManQuerySchema = zod_1.z.object({
    page: zod_1.z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 1), zod_1.z.number().int().min(1).default(1)).optional(),
    limit: zod_1.z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 10), zod_1.z.number().int().min(1).max(100).default(10)).optional(),
    all: zod_1.z.preprocess((v) => v === "true" || v === true || v === 1 || v === "1", zod_1.z.boolean().default(false)).optional(),
    search: zod_1.z.string().optional(),
    branch_id: zod_1.z.string().optional(),
    branchId: zod_1.z.string().optional(),
    my_id: zod_1.z.string().optional(),
    myId: zod_1.z.string().optional(),
    status: zod_1.z.preprocess(preprocessBoolean, zod_1.z.boolean().optional()),
});
