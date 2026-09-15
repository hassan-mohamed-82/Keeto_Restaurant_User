import { z } from "zod";

const preprocessBoolean = (val: any) => {
    if (val === undefined || val === null) return undefined;
    if (val === true || val === "true" || val === 1 || val === "1") return true;
    if (val === false || val === "false" || val === 0 || val === "0") return false;
    return Boolean(val);
};

const preprocessNumeric = (val: any) => {
    if (val === undefined || val === null || val === "") return undefined;
    const num = Number(val);
    return isNaN(num) ? val : num;
};

const preprocessStringArray = (val: any): string[] => {
    if (val === undefined || val === null) return [];
    if (typeof val === "string") {
        const trimmed = val.trim();
        if ((trimmed.startsWith("[") && trimmed.endsWith("]"))) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
            } catch {
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

const normalizeStoreInput = (obj: any) => {
    if (obj && typeof obj === "object") {
        if (obj.branche_ids === undefined && obj.brancheIds !== undefined) {
            obj.branche_ids = obj.brancheIds;
        } else if (obj.brancheIds === undefined && obj.branche_ids !== undefined) {
            obj.brancheIds = obj.branche_ids;
        }
    }
    return obj;
};

export const createStoreSchema = z.preprocess(
    normalizeStoreInput,
    z.object({
        name: z.string({ required_error: "Store name is required" }).min(1, "Name cannot be empty").max(255),
        nameAr: z.string().max(255).optional().nullable(),
        nameFr: z.string().max(255).optional().nullable(),
        lat: z.preprocess(preprocessNumeric, z.number().optional().nullable()).transform((v) => (v !== undefined && v !== null ? String(v) : null)).optional(),
        lng: z.preprocess(preprocessNumeric, z.number().optional().nullable()).transform((v) => (v !== undefined && v !== null ? String(v) : null)).optional(),
        branche_ids: z.preprocess(preprocessStringArray, z.array(z.string())).optional().default([]),
        brancheIds: z.preprocess(preprocessStringArray, z.array(z.string())).optional(),
        status: z.preprocess(preprocessBoolean, z.boolean().optional().default(true)),
    })
);

export const updateStoreSchema = z.preprocess(
    normalizeStoreInput,
    z.object({
        name: z.string().min(1, "Name cannot be empty").max(255).optional(),
        nameAr: z.string().max(255).optional().nullable(),
        nameFr: z.string().max(255).optional().nullable(),
        lat: z.preprocess(preprocessNumeric, z.number().optional().nullable()).transform((v) => (v !== undefined && v !== null ? String(v) : null)).optional(),
        lng: z.preprocess(preprocessNumeric, z.number().optional().nullable()).transform((v) => (v !== undefined && v !== null ? String(v) : null)).optional(),
        branche_ids: z.preprocess(preprocessStringArray, z.array(z.string())).optional(),
        brancheIds: z.preprocess(preprocessStringArray, z.array(z.string())).optional(),
        status: z.preprocess(preprocessBoolean, z.boolean().optional()),
    })
);

export const storeQuerySchema = z.object({
    page: z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 1), z.number().int().min(1).default(1)).optional(),
    limit: z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 10), z.number().int().min(1).max(100).default(10)).optional(),
    all: z.preprocess((v) => v === "true" || v === true || v === 1 || v === "1", z.boolean().default(false)).optional(),
    search: z.string().optional(),
    status: z.preprocess(preprocessBoolean, z.boolean().optional()),
    lang: z.enum(["en", "ar", "fr"]).optional().default("en"),
});

export type CreateStoreInput = z.infer<typeof createStoreSchema>;
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;
export type StoreQueryInput = z.infer<typeof storeQuerySchema>;
