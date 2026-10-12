import { z } from "zod";

export const updateBusyStatusSchema = z.object({
    isBusy: z.boolean().optional(),
    busy: z.boolean().optional(),
    status: z.enum(["busy", "available"]).optional(),
}).refine(
    (data) => data.isBusy !== undefined || data.busy !== undefined || data.status !== undefined,
    {
        message: "You must provide either 'isBusy' (boolean), 'busy' (boolean), or 'status' ('busy' | 'available')",
    }
);

// ✅ Zod schema for updating general restaurant settings
// Enforces: cashEnabled and enableOnlinePayment cannot both be false at the same time
export const updateSettingsSchema = z.object({
    settings: z.object({
        cashEnabled: z.boolean().optional(),
        enableOnlinePayment: z.boolean().optional(),
    }).passthrough().optional(),
    schedules: z.array(z.any()).optional(),
}).superRefine((data, ctx) => {
    const s = data.settings;
    if (!s) return;

    // Both-off guard: if the request is disabling one, make sure the other isn't already disabled
    // We check the values being sent in this request only; the controller will merge with DB values
    const cashDisabled = s.cashEnabled === false;
    const onlineDisabled = s.enableOnlinePayment === false;

    if (cashDisabled && onlineDisabled) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["settings", "cashEnabled"],
            message: "At least one payment method must be active. You cannot disable both cash and online payment.",
        });
    }
});
