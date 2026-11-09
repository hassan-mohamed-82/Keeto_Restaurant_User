import { z } from "zod";

const preprocessBoolean = (val: any) => {
    if (val === undefined || val === null) return undefined;
    if (val === true || val === "true" || val === 1 || val === "1") return true;
    if (val === false || val === "false" || val === 0 || val === "0") return false;
    return Boolean(val);
};

const normalizeBranchId = (obj: any) => {
    if (obj && typeof obj === "object") {
        if (obj.branch_id === undefined) {
            if (obj.branche_id !== undefined) obj.branch_id = obj.branche_id;
            else if (obj.branchId !== undefined) obj.branch_id = obj.branchId;
        }
        if (obj.branchId === undefined && obj.branch_id !== undefined) {
            obj.branchId = obj.branch_id;
        }
    }
    return obj;
};

export const createHallSchema = z.preprocess(
    normalizeBranchId,
    z.object({
        name: z.string({ required_error: "name is required" }).min(1, "name cannot be empty").max(255),
        nameAr: z.string().max(255).optional().nullable(),
        nameFr: z.string().max(255).optional().nullable(),
        lat: z.string().max(255).optional().nullable(),
        lng: z.string().max(255).optional().nullable(),
        branch_id: z.string({ required_error: "branch_id is required" }).min(1, "branch_id cannot be empty"),
        branchId: z.string().optional(),
        branche_id: z.string().optional(),
        status: z.preprocess(preprocessBoolean, z.boolean().optional().default(true)),
    })
);

export const updateHallSchema = z.preprocess(
    normalizeBranchId,
    z.object({
        name: z.string().min(1, "name cannot be empty").max(255).optional(),
        nameAr: z.string().max(255).optional().nullable(),
        nameFr: z.string().max(255).optional().nullable(),
        lat: z.string().max(255).optional().nullable(),
        lng: z.string().max(255).optional().nullable(),
        branch_id: z.string().min(1, "branch_id cannot be empty").optional(),
        branchId: z.string().optional(),
        branche_id: z.string().optional(),
        status: z.preprocess(preprocessBoolean, z.boolean().optional()),
    })
);

export const hallQuerySchema = z.object({
    page: z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 1), z.number().int().min(1).default(1)).optional(),
    limit: z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 10), z.number().int().min(1).max(100).default(10)).optional(),
    all: z.preprocess((v) => v === "true" || v === true || v === 1 || v === "1", z.boolean().default(false)).optional(),
    search: z.string().optional(),
    branch_id: z.string().optional(),
    branchId: z.string().optional(),
    status: z.preprocess(preprocessBoolean, z.boolean().optional()),
});

export type CreateHallInput = z.infer<typeof createHallSchema>;
export type UpdateHallInput = z.infer<typeof updateHallSchema>;
export type HallQueryInput = z.infer<typeof hallQuerySchema>;
