"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateOrderDelayAlertGroupSchema = exports.createOrderDelayAlertGroupSchema = void 0;
const zod_1 = require("zod");
// Helper to normalize email or emails array
const normalizeEmails = (val) => {
    if (typeof val === "string") {
        // If comma separated or single string
        if (val.includes(",")) {
            return val.split(",").map(e => e.trim()).filter(Boolean);
        }
        const trimmed = val.trim();
        return trimmed ? [trimmed] : [];
    }
    if (Array.isArray(val)) {
        return val.map(e => typeof e === "string" ? e.trim() : e).filter(Boolean);
    }
    return val;
};
// Helper to normalize branchIds
const normalizeBranchIds = (val) => {
    if (typeof val === "string") {
        if (val.includes(",")) {
            return val.split(",").map(b => b.trim()).filter(Boolean);
        }
        const trimmed = val.trim();
        return trimmed ? [trimmed] : [];
    }
    if (Array.isArray(val)) {
        return val.map(b => typeof b === "string" ? b.trim() : b).filter(Boolean);
    }
    return val;
};
// Helper to normalize orderStatus
const normalizeOrderStatus = (val) => {
    if (val === undefined || val === null)
        return ["pending"];
    if (typeof val === "string") {
        if (val.includes(",")) {
            return val.split(",").map(s => s.trim()).filter(Boolean);
        }
        const trimmed = val.trim();
        return trimmed ? [trimmed] : ["pending"];
    }
    if (Array.isArray(val)) {
        const filtered = val.map(s => typeof s === "string" ? s.trim() : s).filter(Boolean);
        return filtered.length > 0 ? filtered : ["pending"];
    }
    return val;
};
exports.createOrderDelayAlertGroupSchema = zod_1.z.object({
    name: zod_1.z
        .string({ required_error: "اسم المجموعة مطلوب" })
        .min(1, "اسم المجموعة لا يمكن أن يكون فارغاً")
        .max(255, "اسم المجموعة طويل جداً"),
    emails: zod_1.z.preprocess(normalizeEmails, zod_1.z
        .array(zod_1.z.string().email("البريد الإلكتروني غير صالح"))
        .min(1, "يجب إدخال بريد إلكتروني واحد على الأقل")),
    allBranches: zod_1.z
        .boolean()
        .optional()
        .default(true),
    branchIds: zod_1.z.preprocess(normalizeBranchIds, zod_1.z.array(zod_1.z.string().min(1)).optional().default([])),
    maxDelayMinutes: zod_1.z
        .coerce
        .number({ required_error: "أقصى وقت لتأخير الأوردر مطلوب" })
        .int("مدة التأخير يجب أن تكون رقماً صحيحاً")
        .min(1, "مدة التأخير يجب أن تكون دقيقة واحدة على الأقل"),
    orderStatus: zod_1.z.preprocess(normalizeOrderStatus, zod_1.z.array(zod_1.z.enum(["pending", "accepted", "preparing", "out_for_delivery"])).optional().default(["pending"])),
    isActive: zod_1.z
        .boolean()
        .optional()
        .default(true),
}).refine((data) => {
    // If allBranches is false, branchIds must have at least one branch
    if (data.allBranches === false) {
        return Array.isArray(data.branchIds) && data.branchIds.length > 0;
    }
    return true;
}, {
    message: "يجب اختيار فرع واحد على الأقل عند إلغاء تحديد 'كل الفروع'",
    path: ["branchIds"],
});
exports.updateOrderDelayAlertGroupSchema = zod_1.z.object({
    name: zod_1.z
        .string()
        .min(1, "اسم المجموعة لا يمكن أن يكون فارغاً")
        .max(255, "اسم المجموعة طويل جداً")
        .optional(),
    emails: zod_1.z.preprocess(normalizeEmails, zod_1.z
        .array(zod_1.z.string().email("البريد الإلكتروني غير صالح"))
        .min(1, "يجب إدخال بريد إلكتروني واحد على الأقل")).optional(),
    allBranches: zod_1.z
        .boolean()
        .optional(),
    branchIds: zod_1.z.preprocess(normalizeBranchIds, zod_1.z.array(zod_1.z.string().min(1))).optional(),
    maxDelayMinutes: zod_1.z
        .coerce
        .number()
        .int("مدة التأخير يجب أن تكون رقماً صحيحاً")
        .min(1, "مدة التأخير يجب أن تكون دقيقة واحدة على الأقل")
        .optional(),
    orderStatus: zod_1.z.preprocess(normalizeOrderStatus, zod_1.z.array(zod_1.z.enum(["pending", "accepted", "preparing", "out_for_delivery"]))).optional(),
    isActive: zod_1.z
        .boolean()
        .optional(),
});
