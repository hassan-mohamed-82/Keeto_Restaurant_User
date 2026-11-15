import { z } from "zod";

export function safeParseJson(val: any): any {
    if (typeof val === "string") {
        const trimmed = val.trim();
        if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
            try {
                return JSON.parse(trimmed);
            } catch {
                return val;
            }
        }
    }
    return val;
}

const normalizeFreeDeliveryInput = (obj: any) => {
    if (obj && typeof obj === "object") {
        if (obj.branchIds === undefined && obj.branch_ids !== undefined) {
            obj.branchIds = safeParseJson(obj.branch_ids);
        } else if (obj.branchIds !== undefined) {
            obj.branchIds = safeParseJson(obj.branchIds);
        }
    }
    return obj;
};

export const upsertFreeDeliveryOfferSchema = z.preprocess(
    normalizeFreeDeliveryInput,
    z.object({
        status: z.enum(["active", "inactive"]).optional(),
        minOrderAmount: z.coerce.number().min(0, "minOrderAmount must be a non-negative number").optional(),
        maxOrdersPerUser: z.coerce.number().int().min(1, "maxOrdersPerUser must be at least 1").nullable().optional(),
        startDate: z.string().datetime({ offset: true }).nullable().optional(),
        endDate: z.string().datetime({ offset: true }).nullable().optional(),
        branchIds: z.preprocess((val) => {
            if (val === undefined || val === null || val === "") return [];
            val = safeParseJson(val);
            if (typeof val === "string") {
                if (val.includes(",")) return val.split(",").map((s) => s.trim()).filter(Boolean);
                return val.trim() ? [val.trim()] : [];
            }
            if (Array.isArray(val)) {
                return val.map(String).filter(Boolean);
            }
            return [];
        }, z.array(z.string()).optional().default([])),
        branch_ids: z.any().optional(),
    })
);
