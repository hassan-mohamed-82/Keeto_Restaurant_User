import { z } from "zod";

// Helper to normalize email or emails array
const normalizeEmails = (val: unknown): unknown => {
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
const normalizeBranchIds = (val: unknown): unknown => {
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
const normalizeOrderStatus = (val: unknown): unknown => {
    if (val === undefined || val === null) return ["pending"];
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

export const createOrderDelayAlertGroupSchema = z.object({
    name: z
        .string({ required_error: "اسم المجموعة مطلوب" })
        .min(1, "اسم المجموعة لا يمكن أن يكون فارغاً")
        .max(255, "اسم المجموعة طويل جداً"),

    emails: z.preprocess(
        normalizeEmails,
        z
            .array(z.string().email("البريد الإلكتروني غير صالح"))
            .min(1, "يجب إدخال بريد إلكتروني واحد على الأقل")
    ),

    allBranches: z
        .boolean()
        .optional()
        .default(true),

    branchIds: z.preprocess(
        normalizeBranchIds,
        z.array(z.string().min(1)).optional().default([])
    ),

    maxDelayMinutes: z
        .coerce
        .number({ required_error: "أقصى وقت لتأخير الأوردر مطلوب" })
        .int("مدة التأخير يجب أن تكون رقماً صحيحاً")
        .min(1, "مدة التأخير يجب أن تكون دقيقة واحدة على الأقل"),

    orderStatus: z.preprocess(
        normalizeOrderStatus,
        z.array(z.enum(["pending", "accepted", "preparing", "out_for_delivery"])).optional().default(["pending"])
    ),

    isActive: z
        .boolean()
        .optional()
        .default(true),
}).refine(
    (data) => {
        // If allBranches is false, branchIds must have at least one branch
        if (data.allBranches === false) {
            return Array.isArray(data.branchIds) && data.branchIds.length > 0;
        }
        return true;
    },
    {
        message: "يجب اختيار فرع واحد على الأقل عند إلغاء تحديد 'كل الفروع'",
        path: ["branchIds"],
    }
);

export const updateOrderDelayAlertGroupSchema = z.object({
    name: z
        .string()
        .min(1, "اسم المجموعة لا يمكن أن يكون فارغاً")
        .max(255, "اسم المجموعة طويل جداً")
        .optional(),

    emails: z.preprocess(
        normalizeEmails,
        z
            .array(z.string().email("البريد الإلكتروني غير صالح"))
            .min(1, "يجب إدخال بريد إلكتروني واحد على الأقل")
    ).optional(),

    allBranches: z
        .boolean()
        .optional(),

    branchIds: z.preprocess(
        normalizeBranchIds,
        z.array(z.string().min(1))
    ).optional(),

    maxDelayMinutes: z
        .coerce
        .number()
        .int("مدة التأخير يجب أن تكون رقماً صحيحاً")
        .min(1, "مدة التأخير يجب أن تكون دقيقة واحدة على الأقل")
        .optional(),

    orderStatus: z.preprocess(
        normalizeOrderStatus,
        z.array(z.enum(["pending", "accepted", "preparing", "out_for_delivery"]))
    ).optional(),

    isActive: z
        .boolean()
        .optional(),
});
