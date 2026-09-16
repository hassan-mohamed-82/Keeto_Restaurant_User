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

const normalizeCashierManInput = (obj: any) => {
    if (obj && typeof obj === "object") {
        if (obj.branch_id === undefined && obj.branchId !== undefined) {
            obj.branch_id = obj.branchId;
        } else if (obj.branchId === undefined && obj.branch_id !== undefined) {
            obj.branchId = obj.branch_id;
        }

        if (obj.my_id === undefined && obj.myId !== undefined) {
            obj.my_id = obj.myId;
        } else if (obj.myId === undefined && obj.my_id !== undefined) {
            obj.myId = obj.my_id;
        }
    }
    return obj;
};

export const ALLOWED_REPORT_PERMISSIONS = ["unactive", "financial", "all_reports"] as const;

export const createCashierManSchema = z.preprocess(
    normalizeCashierManInput,
    z.object({
        name: z.string().trim().max(255).optional(),
        user_name: z.string({ required_error: "user_name is required" }).trim().min(1, "user_name cannot be empty").max(255),
        phone: z.string({ required_error: "Phone is required" }).trim().min(1, "Phone cannot be empty").max(50),
        password: z.string({ required_error: "Password is required" }).min(4, "Password must be at least 4 characters").max(255),
        branch_id: z.string({ required_error: "branch_id is required" }).min(1, "branch_id cannot be empty"),
        branchId: z.string().optional(),
        restaurant_id: z.string().optional(),
        restaurantId: z.string().optional(),
        my_id: z.string().trim().max(255).optional().nullable().or(z.literal("")),
        myId: z.string().trim().max(255).optional().nullable().or(z.literal("")),
        image: z.string().optional().nullable().or(z.literal("")),
        roles: z.preprocess(preprocessArray, z.array(z.string()).optional().default([])),
        report_perimission: z.preprocess(
            preprocessArray,
            z.array(z.string()).optional().default([])
        ),
        status: z.preprocess(preprocessBoolean, z.boolean().optional().default(true)),
    })
);

export const updateCashierManSchema = z.preprocess(
    normalizeCashierManInput,
    z.object({
        name: z.string().trim().max(255).optional(),
        user_name: z.string().trim().min(1, "user_name cannot be empty").max(255).optional(),
        phone: z.string().trim().min(1, "Phone cannot be empty").max(50).optional(),
        password: z.string().min(4, "Password must be at least 4 characters").max(255).optional().or(z.literal("")),
        branch_id: z.string().min(1, "branch_id cannot be empty").optional(),
        branchId: z.string().optional(),
        restaurant_id: z.string().optional(),
        restaurantId: z.string().optional(),
        my_id: z.string().trim().max(255).optional().nullable().or(z.literal("")),
        myId: z.string().trim().max(255).optional().nullable().or(z.literal("")),
        image: z.string().optional().nullable().or(z.literal("")),
        roles: z.preprocess(preprocessArray, z.array(z.string()).optional()),
        report_perimission: z.preprocess(
            preprocessArray,
            z.array(z.string()).optional()
        ),
        status: z.preprocess(preprocessBoolean, z.boolean().optional()),
    })
);

export const cashierManQuerySchema = z.object({
    page: z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 1), z.number().int().min(1).default(1)).optional(),
    limit: z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 10), z.number().int().min(1).max(100).default(10)).optional(),
    all: z.preprocess((v) => v === "true" || v === true || v === 1 || v === "1", z.boolean().default(false)).optional(),
    search: z.string().optional(),
    branch_id: z.string().optional(),
    branchId: z.string().optional(),
    my_id: z.string().optional(),
    myId: z.string().optional(),
    status: z.preprocess(preprocessBoolean, z.boolean().optional()),
});

export type CreateCashierManInput = z.infer<typeof createCashierManSchema>;
export type UpdateCashierManInput = z.infer<typeof updateCashierManSchema>;
export type CashierManQueryInput = z.infer<typeof cashierManQuerySchema>;
