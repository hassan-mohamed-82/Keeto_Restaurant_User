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

export const createSupplierSchema = z.object({
    name: z.string({ required_error: "Supplier name is required" }).min(1, "Name cannot be empty").max(255),
    email: z.string().email("Invalid email format").max(255).optional().nullable().or(z.literal("")),
    phone: z.string({ required_error: "Phone number is required" }).min(1, "Phone cannot be empty").max(50),
    balance: z.preprocess(
        preprocessNumeric,
        z.number({ invalid_type_error: "Balance must be a valid number" })
    ).optional().default(0).transform((v) => String(v)),
    status: z.preprocess(
        preprocessBoolean,
        z.boolean().optional().default(true)
    ),
});

export const updateSupplierSchema = z.object({
    name: z.string().min(1, "Name cannot be empty").max(255).optional(),
    email: z.string().email("Invalid email format").max(255).optional().nullable().or(z.literal("")),
    phone: z.string().min(1, "Phone cannot be empty").max(50).optional(),
    status: z.preprocess(
        preprocessBoolean,
        z.boolean().optional()
    ),
});

export const supplierQuerySchema = z.object({
    page: z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 1), z.number().int().min(1).default(1)).optional(),
    limit: z.preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 10), z.number().int().min(1).max(100).default(10)).optional(),
    all: z.preprocess((v) => v === "true" || v === true || v === 1 || v === "1", z.boolean().default(false)).optional(),
    search: z.string().optional(),
    status: z.preprocess(preprocessBoolean, z.boolean().optional()),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type SupplierQueryInput = z.infer<typeof supplierQuerySchema>;
