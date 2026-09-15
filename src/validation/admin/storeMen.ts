import { z } from "zod";

const preprocessBoolean = (val: any) => {
    if (val === undefined || val === null) return undefined;
    if (val === true || val === "true" || val === 1 || val === "1") return true;
    if (val === false || val === "false" || val === 0 || val === "0") return false;
    return Boolean(val);
};

const normalizeStoreManInput = (obj: any) => {
    if (obj && typeof obj === "object") {
        if (obj.store_id === undefined && obj.storeId !== undefined) {
            obj.store_id = obj.storeId;
        } else if (obj.storeId === undefined && obj.store_id !== undefined) {
            obj.storeId = obj.store_id;
        }
    }
    return obj;
};

export const createStoreManSchema = z.preprocess(
    normalizeStoreManInput,
    z.object({
        name: z.string({ required_error: "Name is required" }).min(1, "Name cannot be empty").max(255),
        phone: z.string({ required_error: "Phone number is required" }).min(1, "Phone cannot be empty").max(50),
        password: z.string({ required_error: "Password is required" }).min(4, "Password must be at least 4 characters").max(255),
        store_id: z.string({ required_error: "store_id is required" }).min(1, "store_id cannot be empty"),
        storeId: z.string().optional(),
        image: z.string().optional().nullable().or(z.literal("")),
        status: z.preprocess(preprocessBoolean, z.boolean().optional().default(true)),
    })
);

export const updateStoreManSchema = z.preprocess(
    normalizeStoreManInput,
    z.object({
        name: z.string().min(1, "Name cannot be empty").max(255).optional(),
        phone: z.string().min(1, "Phone cannot be empty").max(50).optional(),
        password: z.string().min(4, "Password must be at least 4 characters").max(255).optional().or(z.literal("")),
        store_id: z.string().min(1, "store_id cannot be empty").optional(),
        storeId: z.string().optional(),
        image: z.string().optional().nullable().or(z.literal("")),
        status: z.preprocess(preprocessBoolean, z.boolean().optional()),
    })
);

export const storeManQuerySchema = z.object({
    page: z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 1), z.number().int().min(1).default(1)).optional(),
    limit: z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 10), z.number().int().min(1).max(100).default(10)).optional(),
    all: z.preprocess((v) => v === "true" || v === true || v === 1 || v === "1", z.boolean().default(false)).optional(),
    search: z.string().optional(),
    status: z.preprocess(preprocessBoolean, z.boolean().optional()),
    store_id: z.string().optional(),
    storeId: z.string().optional(),
});

export type CreateStoreManInput = z.infer<typeof createStoreManSchema>;
export type UpdateStoreManInput = z.infer<typeof updateStoreManSchema>;
export type StoreManQueryInput = z.infer<typeof storeManQuerySchema>;
