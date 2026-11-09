import { z } from "zod";

const preprocessBoolean = (val: any) => {
    if (val === undefined || val === null) return undefined;
    if (val === true || val === "true" || val === 1 || val === "1") return true;
    if (val === false || val === "false" || val === 0 || val === "0") return false;
    return Boolean(val);
};

const normalizeHallId = (obj: any) => {
    if (obj && typeof obj === "object") {
        if (obj.hall_id === undefined && obj.hallId !== undefined) {
            obj.hall_id = obj.hallId;
        } else if (obj.hallId === undefined && obj.hall_id !== undefined) {
            obj.hallId = obj.hall_id;
        }
    }
    return obj;
};

export const createHallTableSchema = z.preprocess(
    normalizeHallId,
    z.object({
        tbl_number: z.preprocess((v) => (v !== undefined && v !== null ? String(v) : v), z.string({ required_error: "tbl_number is required" }).min(1, "tbl_number cannot be empty").max(50)),
        tblNumber: z.preprocess((v) => (v !== undefined && v !== null ? String(v) : v), z.string().max(50).optional()),
        capacity: z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 1), z.number().int().min(1).default(1)),
        hall_id: z.string({ required_error: "hall_id is required" }).min(1, "hall_id cannot be empty"),
        hallId: z.string().optional(),
        status: z.preprocess(preprocessBoolean, z.boolean().optional().default(true)),
    })
);

export const updateHallTableSchema = z.preprocess(
    normalizeHallId,
    z.object({
        tbl_number: z.preprocess((v) => (v !== undefined && v !== null ? String(v) : undefined), z.string().min(1, "tbl_number cannot be empty").max(50).optional()),
        tblNumber: z.preprocess((v) => (v !== undefined && v !== null ? String(v) : undefined), z.string().max(50).optional()),
        capacity: z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : undefined), z.number().int().min(1).optional()),
        hall_id: z.string().min(1, "hall_id cannot be empty").optional(),
        hallId: z.string().optional(),
        status: z.preprocess(preprocessBoolean, z.boolean().optional()),
    })
);

export const hallTableQuerySchema = z.object({
    page: z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 1), z.number().int().min(1).default(1)).optional(),
    limit: z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 10), z.number().int().min(1).max(100).default(10)).optional(),
    all: z.preprocess((v) => v === "true" || v === true || v === 1 || v === "1", z.boolean().default(false)).optional(),
    search: z.string().optional(),
    hall_id: z.string().optional(),
    hallId: z.string().optional(),
    status: z.preprocess(preprocessBoolean, z.boolean().optional()),
    occupied: z.preprocess(preprocessBoolean, z.boolean().optional()),
});

export type CreateHallTableInput = z.infer<typeof createHallTableSchema>;
export type UpdateHallTableInput = z.infer<typeof updateHallTableSchema>;
export type HallTableQueryInput = z.infer<typeof hallTableQuerySchema>;
