"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeQuerySchema = exports.updateStoreSchema = exports.createStoreSchema = void 0;
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
const preprocessStringArray = (val) => {
    if (val === undefined || val === null)
        return [];
    if (typeof val === "string") {
        const trimmed = val.trim();
        if ((trimmed.startsWith("[") && trimmed.endsWith("]"))) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed))
                    return parsed.map(String).filter(Boolean);
            }
            catch {
                // fallback
            }
        }
        if (trimmed.includes(",")) {
            return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
        }
        return trimmed ? [trimmed] : [];
    }
    if (Array.isArray(val)) {
        return val.map(String).filter(Boolean);
    }
    return [];
};
const normalizeStoreInput = (obj) => {
    if (obj && typeof obj === "object") {
        if (obj.branche_ids === undefined && obj.brancheIds !== undefined) {
            obj.branche_ids = obj.brancheIds;
        }
        else if (obj.brancheIds === undefined && obj.branche_ids !== undefined) {
            obj.brancheIds = obj.branche_ids;
        }
    }
    return obj;
};
exports.createStoreSchema = zod_1.z.preprocess(normalizeStoreInput, zod_1.z.object({
    name: zod_1.z.string({ required_error: "Store name is required" }).min(1, "Name cannot be empty").max(255),
    nameAr: zod_1.z.string().max(255).optional().nullable(),
    nameFr: zod_1.z.string().max(255).optional().nullable(),
    lat: zod_1.z.preprocess(preprocessNumeric, zod_1.z.number().optional().nullable()).transform((v) => (v !== undefined && v !== null ? String(v) : null)).optional(),
    lng: zod_1.z.preprocess(preprocessNumeric, zod_1.z.number().optional().nullable()).transform((v) => (v !== undefined && v !== null ? String(v) : null)).optional(),
    branche_ids: zod_1.z.preprocess(preprocessStringArray, zod_1.z.array(zod_1.z.string())).optional().default([]),
    brancheIds: zod_1.z.preprocess(preprocessStringArray, zod_1.z.array(zod_1.z.string())).optional(),
    status: zod_1.z.preprocess(preprocessBoolean, zod_1.z.boolean().optional().default(true)),
}));
exports.updateStoreSchema = zod_1.z.preprocess(normalizeStoreInput, zod_1.z.object({
    name: zod_1.z.string().min(1, "Name cannot be empty").max(255).optional(),
    nameAr: zod_1.z.string().max(255).optional().nullable(),
    nameFr: zod_1.z.string().max(255).optional().nullable(),
    lat: zod_1.z.preprocess(preprocessNumeric, zod_1.z.number().optional().nullable()).transform((v) => (v !== undefined && v !== null ? String(v) : null)).optional(),
    lng: zod_1.z.preprocess(preprocessNumeric, zod_1.z.number().optional().nullable()).transform((v) => (v !== undefined && v !== null ? String(v) : null)).optional(),
    branche_ids: zod_1.z.preprocess(preprocessStringArray, zod_1.z.array(zod_1.z.string())).optional(),
    brancheIds: zod_1.z.preprocess(preprocessStringArray, zod_1.z.array(zod_1.z.string())).optional(),
    status: zod_1.z.preprocess(preprocessBoolean, zod_1.z.boolean().optional()),
}));
exports.storeQuerySchema = zod_1.z.object({
    page: zod_1.z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 1), zod_1.z.number().int().min(1).default(1)).optional(),
    limit: zod_1.z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 10), zod_1.z.number().int().min(1).max(100).default(10)).optional(),
    all: zod_1.z.preprocess((v) => v === "true" || v === true || v === 1 || v === "1", zod_1.z.boolean().default(false)).optional(),
    search: zod_1.z.string().optional(),
    status: zod_1.z.preprocess(preprocessBoolean, zod_1.z.boolean().optional()),
    lang: zod_1.z.enum(["en", "ar", "fr"]).optional().default("en"),
});
