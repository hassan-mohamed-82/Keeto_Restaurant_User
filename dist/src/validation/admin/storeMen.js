"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeManQuerySchema = exports.updateStoreManSchema = exports.createStoreManSchema = void 0;
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
const normalizeStoreManInput = (obj) => {
    if (obj && typeof obj === "object") {
        if (obj.store_id === undefined && obj.storeId !== undefined) {
            obj.store_id = obj.storeId;
        }
        else if (obj.storeId === undefined && obj.store_id !== undefined) {
            obj.storeId = obj.store_id;
        }
    }
    return obj;
};
exports.createStoreManSchema = zod_1.z.preprocess(normalizeStoreManInput, zod_1.z.object({
    name: zod_1.z.string({ required_error: "Name is required" }).trim().min(1, "Name cannot be empty").max(255),
    phone: zod_1.z.string({ required_error: "Phone number is required" }).trim().min(1, "Phone cannot be empty").max(50),
    password: zod_1.z.string({ required_error: "Password is required" }).min(4, "Password must be at least 4 characters").max(255),
    store_id: zod_1.z.string({ required_error: "store_id is required" }).min(1, "store_id cannot be empty"),
    storeId: zod_1.z.string().optional(),
    restaurant_id: zod_1.z.string().optional(),
    restaurantId: zod_1.z.string().optional(),
    image: zod_1.z.string().optional().nullable().or(zod_1.z.literal("")),
    status: zod_1.z.preprocess(preprocessBoolean, zod_1.z.boolean().optional().default(true)),
}));
exports.updateStoreManSchema = zod_1.z.preprocess(normalizeStoreManInput, zod_1.z.object({
    name: zod_1.z.string().trim().min(1, "Name cannot be empty").max(255).optional(),
    phone: zod_1.z.string().trim().min(1, "Phone cannot be empty").max(50).optional(),
    password: zod_1.z.string().min(4, "Password must be at least 4 characters").max(255).optional().or(zod_1.z.literal("")),
    store_id: zod_1.z.string().min(1, "store_id cannot be empty").optional(),
    storeId: zod_1.z.string().optional(),
    restaurant_id: zod_1.z.string().optional(),
    restaurantId: zod_1.z.string().optional(),
    image: zod_1.z.string().optional().nullable().or(zod_1.z.literal("")),
    status: zod_1.z.preprocess(preprocessBoolean, zod_1.z.boolean().optional()),
}));
exports.storeManQuerySchema = zod_1.z.object({
    page: zod_1.z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 1), zod_1.z.number().int().min(1).default(1)).optional(),
    limit: zod_1.z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 10), zod_1.z.number().int().min(1).max(100).default(10)).optional(),
    all: zod_1.z.preprocess((v) => v === "true" || v === true || v === 1 || v === "1", zod_1.z.boolean().default(false)).optional(),
    search: zod_1.z.string().optional(),
    status: zod_1.z.preprocess(preprocessBoolean, zod_1.z.boolean().optional()),
    store_id: zod_1.z.string().optional(),
    storeId: zod_1.z.string().optional(),
});
