import { z } from "zod";

// Helper to normalize array or single value
const normalizeToArray = (val: unknown): unknown => {
    if (typeof val === "string") {
        try {
            const parsed = JSON.parse(val);
            return Array.isArray(parsed) ? parsed : [val];
        } catch {
            // Check if comma separated
            if (val.includes(",")) {
                return val.split(",").map((s) => s.trim()).filter(Boolean);
            }
            const trimmed = val.trim();
            return trimmed ? [trimmed] : [];
        }
    }
    if (Array.isArray(val)) {
        return val.map((item) => typeof item === "string" ? item.trim() : item).filter(Boolean);
    }
    return val;
};

// Helper to normalize orderStatus
const normalizeOrderStatus = (val: unknown): unknown => {
    if (val === undefined || val === null) return ["pending"];
    const arr = normalizeToArray(val);
    if (Array.isArray(arr)) {
        const filtered = arr.filter(Boolean);
        return filtered.length > 0 ? filtered : ["pending"];
    }
    return ["pending"];
};

export const createOrderDelayAlertGroupSchema = z.object({
    restaurantId: z
        .string()
        .optional()
        .nullable(),

    isSuperAdmin: z
        .boolean()
        .optional()
        .default(false),

    allRestaurants: z
        .boolean()
        .optional()
        .default(true),

    restaurantIds: z.preprocess(
        normalizeToArray,
        z.array(z.string().min(1)).optional().default([])
    ),

    name: z
        .string({ required_error: "اسم المجموعة مطلوب" })
        .min(1, "اسم المجموعة لا يمكن أن يكون فارغاً")
        .max(255, "اسم المجموعة طويل جداً"),

    emails: z.preprocess(
        normalizeToArray,
        z
            .array(z.string().email("البريد الإلكتروني غير صالح"))
            .min(1, "يجب إدخال بريد إلكتروني واحد على الأقل")
    ),

    allBranches: z
        .boolean()
        .optional()
        .default(true),

    branchIds: z.preprocess(
        normalizeToArray,
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
        // If allBranches is explicitly false, branchIds must contain at least one branch
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
    restaurantId: z
        .string()
        .optional()
        .nullable(),

    isSuperAdmin: z
        .boolean()
        .optional(),

    name: z
        .string()
        .min(1, "اسم المجموعة لا يمكن أن يكون فارغاً")
        .max(255, "اسم المجموعة طويل جداً")
        .optional(),

    emails: z.preprocess(
        normalizeToArray,
        z
            .array(z.string().email("البريد الإلكتروني غير صالح"))
            .min(1, "يجب إدخال بريد إلكتروني واحد على الأقل")
    ).optional(),

    allBranches: z
        .boolean()
        .optional(),

    branchIds: z.preprocess(
        normalizeToArray,
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
