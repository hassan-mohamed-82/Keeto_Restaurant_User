import { z } from "zod";

const preprocessInt = (val: any) => {
    if (val === undefined || val === null || val === "") return undefined;
    const n = Number(val);
    return isNaN(n) ? undefined : Math.floor(n);
};

const normalizePrinterFields = (obj: any) => {
    if (obj && typeof obj === "object") {
        // Normalize branch_id -> branchId
        if (obj.branchId === undefined && obj.branch_id !== undefined) {
            obj.branchId = obj.branch_id;
        }
        if (obj.branch_id === undefined && obj.branchId !== undefined) {
            obj.branch_id = obj.branchId;
        }
        // Normalize restaurant_id -> restaurantId
        if (obj.restaurantId === undefined && obj.restaurant_id !== undefined) {
            obj.restaurantId = obj.restaurant_id;
        }
    }
    return obj;
};

export const createPrinterSchema = z.preprocess(
    normalizePrinterFields,
    z.object({
        name: z.string({ required_error: "name is required" }).min(1, "name cannot be empty").max(255),
        ip: z.string().max(100).optional().nullable(),
        port: z.preprocess(preprocessInt, z.number().int().min(1).max(65535).optional().nullable()),
        type: z.enum(["usb", "network"], {
            required_error: "type is required",
            invalid_type_error: "type must be 'usb' or 'network'",
        }),
        branchId: z.string().uuid("branchId must be a valid UUID").optional().nullable(),
        branch_id: z.string().optional(),
    })
);

export const updatePrinterSchema = z.preprocess(
    normalizePrinterFields,
    z.object({
        name: z.string().min(1, "name cannot be empty").max(255).optional(),
        ip: z.string().max(100).optional().nullable(),
        port: z.preprocess(preprocessInt, z.number().int().min(1).max(65535).optional().nullable()),
        type: z.enum(["usb", "network"]).optional(),
        branchId: z.string().uuid("branchId must be a valid UUID").optional().nullable(),
        branch_id: z.string().optional(),
    })
);

export const printerQuerySchema = z.object({
    page: z.preprocess(
        (v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 1),
        z.number().int().min(1).default(1)
    ).optional(),
    limit: z.preprocess(
        (v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 10),
        z.number().int().min(1).max(100).default(10)
    ).optional(),
    all: z.preprocess(
        (v) => v === "true" || v === true || v === 1 || v === "1",
        z.boolean().default(false)
    ).optional(),
    search: z.string().optional(),
    branch_id: z.string().optional(),
    branchId: z.string().optional(),
    type: z.enum(["usb", "network"]).optional(),
});

export type CreatePrinterInput = z.infer<typeof createPrinterSchema>;
export type UpdatePrinterInput = z.infer<typeof updatePrinterSchema>;
export type PrinterQueryInput = z.infer<typeof printerQuerySchema>;
