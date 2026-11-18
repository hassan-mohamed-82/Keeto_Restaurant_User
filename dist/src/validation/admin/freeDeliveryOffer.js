"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertFreeDeliveryOfferSchema = void 0;
exports.safeParseJson = safeParseJson;
const zod_1 = require("zod");
function safeParseJson(val) {
    if (typeof val === "string") {
        const trimmed = val.trim();
        if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
            try {
                return JSON.parse(trimmed);
            }
            catch {
                return val;
            }
        }
    }
    return val;
}
const normalizeFreeDeliveryInput = (obj) => {
    if (obj && typeof obj === "object") {
        if (obj.branchIds === undefined && obj.branch_ids !== undefined) {
            obj.branchIds = safeParseJson(obj.branch_ids);
        }
        else if (obj.branchIds !== undefined) {
            obj.branchIds = safeParseJson(obj.branchIds);
        }
    }
    return obj;
};
exports.upsertFreeDeliveryOfferSchema = zod_1.z.preprocess(normalizeFreeDeliveryInput, zod_1.z.object({
    status: zod_1.z.enum(["active", "inactive"]).optional(),
    minOrderAmount: zod_1.z.coerce.number().min(0, "minOrderAmount must be a non-negative number").optional(),
    maxOrdersPerUser: zod_1.z.coerce.number().int().min(1, "maxOrdersPerUser must be at least 1").nullable().optional(),
    startDate: zod_1.z.string().datetime({ offset: true }).nullable().optional(),
    endDate: zod_1.z.string().datetime({ offset: true }).nullable().optional(),
    branchIds: zod_1.z.preprocess((val) => {
        if (val === undefined || val === null || val === "")
            return [];
        val = safeParseJson(val);
        if (typeof val === "string") {
            if (val.includes(","))
                return val.split(",").map((s) => s.trim()).filter(Boolean);
            return val.trim() ? [val.trim()] : [];
        }
        if (Array.isArray(val)) {
            return val.map(String).filter(Boolean);
        }
        return [];
    }, zod_1.z.array(zod_1.z.string()).optional().default([])),
    branch_ids: zod_1.z.any().optional(),
}));
