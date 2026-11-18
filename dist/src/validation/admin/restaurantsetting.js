"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSettingsSchema = exports.updateOrderNowSettingSchema = exports.orderNowSettingSchema = exports.orderNowSettingFieldsSchema = exports.updateBusyStatusSchema = void 0;
const zod_1 = require("zod");
exports.updateBusyStatusSchema = zod_1.z.object({
    isBusy: zod_1.z.boolean().optional(),
    busy: zod_1.z.boolean().optional(),
    status: zod_1.z.enum(["busy", "available"]).optional(),
}).refine((data) => data.isBusy !== undefined || data.busy !== undefined || data.status !== undefined, {
    message: "You must provide either 'isBusy' (boolean), 'busy' (boolean), or 'status' ('busy' | 'available')",
});
exports.orderNowSettingFieldsSchema = zod_1.z.object({
    hotline: zod_1.z.boolean().optional(),
    branches: zod_1.z.boolean().optional(),
    name: zod_1.z.boolean().optional(),
    orderNow: zod_1.z.boolean().optional(),
    eMenu: zod_1.z.boolean().optional(),
    socialMedia: zod_1.z.boolean().optional(),
    menuPdf: zod_1.z.boolean().optional(),
    iosIcon: zod_1.z.boolean().optional(),
    androidIcon: zod_1.z.boolean().optional(),
});
exports.orderNowSettingSchema = exports.orderNowSettingFieldsSchema.optional();
exports.updateOrderNowSettingSchema = zod_1.z.union([
    zod_1.z.object({
        orderNowSetting: exports.orderNowSettingFieldsSchema.optional(),
    }).passthrough(),
    exports.orderNowSettingFieldsSchema.passthrough(),
]);
// ✅ Zod schema for updating general restaurant settings
// Enforces: cashEnabled and enableOnlinePayment cannot both be false at the same time
exports.updateSettingsSchema = zod_1.z.object({
    settings: zod_1.z.object({
        cashEnabled: zod_1.z.boolean().optional(),
        enableOnlinePayment: zod_1.z.boolean().optional(),
        isTemporarilyClosed: zod_1.z.boolean().optional(),
        orderNowSetting: exports.orderNowSettingSchema,
    }).passthrough().optional(),
    schedules: zod_1.z.array(zod_1.z.any()).optional(),
}).superRefine((data, ctx) => {
    const s = data.settings;
    if (!s)
        return;
    // Both-off guard: if the request is disabling one, make sure the other isn't already disabled
    // We check the values being sent in this request only; the controller will merge with DB values
    const cashDisabled = s.cashEnabled === false;
    const onlineDisabled = s.enableOnlinePayment === false;
    if (cashDisabled && onlineDisabled) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ["settings", "cashEnabled"],
            message: "At least one payment method must be active. You cannot disable both cash and online payment.",
        });
    }
});
