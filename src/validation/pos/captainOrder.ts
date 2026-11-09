import { z } from "zod";

const preprocessBoolean = (val: any) => {
    if (val === undefined || val === null) return undefined;
    if (val === true || val === "true" || val === 1 || val === "1") return true;
    if (val === false || val === "false" || val === 0 || val === "0") return false;
    return Boolean(val);
};

const preprocessArray = (val: any) => {
    if (val === undefined || val === null) return undefined;
    if (Array.isArray(val)) return val;
    if (typeof val === "string") {
        try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) return parsed;
        } catch {
            return val.split(",").map((s) => s.trim()).filter(Boolean);
        }
    }
    return [val];
};

const normalizeCaptainOrderInput = (obj: any) => {
    if (obj && typeof obj === "object") {
        if (obj.branch_id === undefined && obj.branchId !== undefined) {
            obj.branch_id = obj.branchId;
        } else if (obj.branchId === undefined && obj.branch_id !== undefined) {
            obj.branchId = obj.branch_id;
        }
        if (obj.hall_ids === undefined && obj.hallIds !== undefined) {
            obj.hall_ids = obj.hallIds;
        } else if (obj.hallIds === undefined && obj.hall_ids !== undefined) {
            obj.hallIds = obj.hall_ids;
        }
    }
    return obj;
};

export const createCaptainOrderSchema = z.preprocess(
    normalizeCaptainOrderInput,
    z.object({
        name: z.string({ required_error: "Name is required" }).trim().min(1, "Name cannot be empty").max(255),
        user_name: z.string({ required_error: "user_name is required" }).trim().min(1, "user_name cannot be empty").max(255),
        phone: z.string({ required_error: "Phone is required" }).trim().min(1, "Phone cannot be empty").max(50),
        password: z.string({ required_error: "Password is required" }).min(4, "Password must be at least 4 characters").max(255),
        branch_id: z.string({ required_error: "branch_id is required" }).min(1, "branch_id cannot be empty"),
        branchId: z.string().optional(),
        hall_ids: z.preprocess(
            preprocessArray,
            z.array(z.string().min(1, "Hall ID cannot be empty"), {
                required_error: "hall_ids is required",
                invalid_type_error: "hall_ids must be an array of hall IDs",
            }).min(1, "At least one hall must be selected")
        ),
        hallIds: z.preprocess(preprocessArray, z.array(z.string())).optional(),
        restaurant_id: z.string().optional(),
        restaurantId: z.string().optional(),
        image: z.string().optional().nullable().or(z.literal("")),
        status: z.preprocess(preprocessBoolean, z.boolean().optional().default(true)),
    })
);

export const updateCaptainOrderSchema = z.preprocess(
    normalizeCaptainOrderInput,
    z.object({
        name: z.string().trim().min(1, "Name cannot be empty").max(255).optional(),
        user_name: z.string().trim().min(1, "user_name cannot be empty").max(255).optional(),
        phone: z.string().trim().min(1, "Phone cannot be empty").max(50).optional(),
        password: z.string().min(4, "Password must be at least 4 characters").max(255).optional().or(z.literal("")),
        branch_id: z.string().min(1, "branch_id cannot be empty").optional(),
        branchId: z.string().optional(),
        hall_ids: z.preprocess(
            preprocessArray,
            z.array(z.string().min(1, "Hall ID cannot be empty")).min(1, "At least one hall must be selected")
        ).optional(),
        hallIds: z.preprocess(preprocessArray, z.array(z.string())).optional(),
        restaurant_id: z.string().optional(),
        restaurantId: z.string().optional(),
        image: z.string().optional().nullable().or(z.literal("")),
        status: z.preprocess(preprocessBoolean, z.boolean().optional()),
    })
);

export const captainOrderQuerySchema = z.object({
    page: z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 1), z.number().int().min(1).default(1)).optional(),
    limit: z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 10), z.number().int().min(1).max(100).default(10)).optional(),
    all: z.preprocess((v) => v === "true" || v === true || v === 1 || v === "1", z.boolean().default(false)).optional(),
    search: z.string().optional(),
    branch_id: z.string().optional(),
    branchId: z.string().optional(),
    status: z.preprocess(preprocessBoolean, z.boolean().optional()),
});

export type CreateCaptainOrderInput = z.infer<typeof createCaptainOrderSchema>;
export type UpdateCaptainOrderInput = z.infer<typeof updateCaptainOrderSchema>;
export type CaptainOrderQueryInput = z.infer<typeof captainOrderQuerySchema>;
