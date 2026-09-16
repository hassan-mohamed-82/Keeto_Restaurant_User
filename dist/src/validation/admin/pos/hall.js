"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hallQuerySchema = exports.updateHallSchema = exports.createHallSchema = void 0;
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
const normalizeBranchId = (obj) => {
    if (obj && typeof obj === "object") {
        if (obj.branch_id === undefined) {
            if (obj.branche_id !== undefined)
                obj.branch_id = obj.branche_id;
            else if (obj.branchId !== undefined)
                obj.branch_id = obj.branchId;
        }
        if (obj.branchId === undefined && obj.branch_id !== undefined) {
            obj.branchId = obj.branch_id;
        }
    }
    return obj;
};
exports.createHallSchema = zod_1.z.preprocess(normalizeBranchId, zod_1.z.object({
    name: zod_1.z.string({ required_error: "name is required" }).min(1, "name cannot be empty").max(255),
    nameAr: zod_1.z.string().max(255).optional().nullable(),
    nameFr: zod_1.z.string().max(255).optional().nullable(),
    lat: zod_1.z.string().max(255).optional().nullable(),
    lng: zod_1.z.string().max(255).optional().nullable(),
    branch_id: zod_1.z.string({ required_error: "branch_id is required" }).min(1, "branch_id cannot be empty"),
    branchId: zod_1.z.string().optional(),
    branche_id: zod_1.z.string().optional(),
    status: zod_1.z.preprocess(preprocessBoolean, zod_1.z.boolean().optional().default(true)),
}));
exports.updateHallSchema = zod_1.z.preprocess(normalizeBranchId, zod_1.z.object({
    name: zod_1.z.string().min(1, "name cannot be empty").max(255).optional(),
    nameAr: zod_1.z.string().max(255).optional().nullable(),
    nameFr: zod_1.z.string().max(255).optional().nullable(),
    lat: zod_1.z.string().max(255).optional().nullable(),
    lng: zod_1.z.string().max(255).optional().nullable(),
    branch_id: zod_1.z.string().min(1, "branch_id cannot be empty").optional(),
    branchId: zod_1.z.string().optional(),
    branche_id: zod_1.z.string().optional(),
    status: zod_1.z.preprocess(preprocessBoolean, zod_1.z.boolean().optional()),
}));
exports.hallQuerySchema = zod_1.z.object({
    page: zod_1.z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 1), zod_1.z.number().int().min(1).default(1)).optional(),
    limit: zod_1.z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 10), zod_1.z.number().int().min(1).max(100).default(10)).optional(),
    all: zod_1.z.preprocess((v) => v === "true" || v === true || v === 1 || v === "1", zod_1.z.boolean().default(false)).optional(),
    search: zod_1.z.string().optional(),
    branch_id: zod_1.z.string().optional(),
    branchId: zod_1.z.string().optional(),
    status: zod_1.z.preprocess(preprocessBoolean, zod_1.z.boolean().optional()),
});
