"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateOrderDelayAlertGroupSchema = exports.createOrderDelayAlertGroupSchema = void 0;
const zod_1 = require("zod");
// Helper to normalize array or single value
const normalizeToArray = (val) => {
    if (typeof val === "string") {
        try {
            const parsed = JSON.parse(val);
            return Array.isArray(parsed) ? parsed : [val];
        }
        catch {
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
const normalizeOrderStatus = (val) => {
    if (val === undefined || val === null)
        return ["pending"];
    const arr = normalizeToArray(val);
    if (Array.isArray(arr)) {
        const filtered = arr.filter(Boolean);
        return filtered.length > 0 ? filtered : ["pending"];
    }
    return ["pending"];
};
exports.createOrderDelayAlertGroupSchema = zod_1.z.object({
    restaurantId: zod_1.z
        .string()
        .optional()
        .nullable(),
    isSuperAdmin: zod_1.z
        .boolean()
        .optional()
        .default(false),
    allRestaurants: zod_1.z
        .boolean()
        .optional()
        .default(true),
    restaurantIds: zod_1.z.preprocess(normalizeToArray, zod_1.z.array(zod_1.z.string().min(1)).optional().default([])),
    name: zod_1.z
        .string({ required_error: "اسم المجموعة مطلوب" })
        .min(1, "اسم المجموعة لا يمكن أن يكون فارغاً")
        .max(255, "اسم المجموعة طويل جداً"),
    emails: zod_1.z.preprocess(normalizeToArray, zod_1.z
        .array(zod_1.z.string().email("البريد الإلكتروني غير صالح"))
        .min(1, "يجب إدخال بريد إلكتروني واحد على الأقل")),
    allBranches: zod_1.z
        .boolean()
        .optional()
        .default(true),
    branchIds: zod_1.z.preprocess(normalizeToArray, zod_1.z.array(zod_1.z.string().min(1)).optional().default([])),
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
    // If allBranches is explicitly false, branchIds must contain at least one branch
    if (data.allBranches === false) {
        return Array.isArray(data.branchIds) && data.branchIds.length > 0;
    }
    return true;
}, {
    message: "يجب اختيار فرع واحد على الأقل عند إلغاء تحديد 'كل الفروع'",
    path: ["branchIds"],
});
exports.updateOrderDelayAlertGroupSchema = zod_1.z.object({
    restaurantId: zod_1.z
        .string()
        .optional()
        .nullable(),
    isSuperAdmin: zod_1.z
        .boolean()
        .optional(),
    name: zod_1.z
        .string()
        .min(1, "اسم المجموعة لا يمكن أن يكون فارغاً")
        .max(255, "اسم المجموعة طويل جداً")
        .optional(),
    emails: zod_1.z.preprocess(normalizeToArray, zod_1.z
        .array(zod_1.z.string().email("البريد الإلكتروني غير صالح"))
        .min(1, "يجب إدخال بريد إلكتروني واحد على الأقل")).optional(),
    allBranches: zod_1.z
        .boolean()
        .optional(),
    branchIds: zod_1.z.preprocess(normalizeToArray, zod_1.z.array(zod_1.z.string().min(1))).optional(),
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
