"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hallTableQuerySchema = exports.updateHallTableSchema = exports.createHallTableSchema = void 0;
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
const normalizeHallId = (obj) => {
    if (obj && typeof obj === "object") {
        if (obj.hall_id === undefined && obj.hallId !== undefined) {
            obj.hall_id = obj.hallId;
        }
        else if (obj.hallId === undefined && obj.hall_id !== undefined) {
            obj.hallId = obj.hall_id;
        }
    }
    return obj;
};
exports.createHallTableSchema = zod_1.z.preprocess(normalizeHallId, zod_1.z.object({
    tbl_number: zod_1.z.preprocess((v) => (v !== undefined && v !== null ? String(v) : v), zod_1.z.string({ required_error: "tbl_number is required" }).min(1, "tbl_number cannot be empty").max(50)),
    tblNumber: zod_1.z.preprocess((v) => (v !== undefined && v !== null ? String(v) : v), zod_1.z.string().max(50).optional()),
    capacity: zod_1.z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 1), zod_1.z.number().int().min(1).default(1)),
    hall_id: zod_1.z.string({ required_error: "hall_id is required" }).min(1, "hall_id cannot be empty"),
    hallId: zod_1.z.string().optional(),
    status: zod_1.z.preprocess(preprocessBoolean, zod_1.z.boolean().optional().default(true)),
}));
exports.updateHallTableSchema = zod_1.z.preprocess(normalizeHallId, zod_1.z.object({
    tbl_number: zod_1.z.preprocess((v) => (v !== undefined && v !== null ? String(v) : undefined), zod_1.z.string().min(1, "tbl_number cannot be empty").max(50).optional()),
    tblNumber: zod_1.z.preprocess((v) => (v !== undefined && v !== null ? String(v) : undefined), zod_1.z.string().max(50).optional()),
    capacity: zod_1.z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : undefined), zod_1.z.number().int().min(1).optional()),
    hall_id: zod_1.z.string().min(1, "hall_id cannot be empty").optional(),
    hallId: zod_1.z.string().optional(),
    status: zod_1.z.preprocess(preprocessBoolean, zod_1.z.boolean().optional()),
}));
exports.hallTableQuerySchema = zod_1.z.object({
    page: zod_1.z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 1), zod_1.z.number().int().min(1).default(1)).optional(),
    limit: zod_1.z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 10), zod_1.z.number().int().min(1).max(100).default(10)).optional(),
    all: zod_1.z.preprocess((v) => v === "true" || v === true || v === 1 || v === "1", zod_1.z.boolean().default(false)).optional(),
    search: zod_1.z.string().optional(),
    hall_id: zod_1.z.string().optional(),
    hallId: zod_1.z.string().optional(),
    status: zod_1.z.preprocess(preprocessBoolean, zod_1.z.boolean().optional()),
    occupied: zod_1.z.preprocess(preprocessBoolean, zod_1.z.boolean().optional()),
});
