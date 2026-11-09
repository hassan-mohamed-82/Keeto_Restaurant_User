"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePushedNotificationSchema = exports.createPushedNotificationSchema = void 0;
const zod_1 = require("zod");
// ==========================================
// Create Pushed Notification Schema
// ==========================================
exports.createPushedNotificationSchema = zod_1.z
    .object({
    title: zod_1.z
        .string({ required_error: "Title is required" })
        .min(1, "Title cannot be empty")
        .max(255, "Title must not exceed 255 characters"),
    body: zod_1.z
        .string({ required_error: "Body is required" })
        .min(1, "Body cannot be empty"),
    /**
     * Dispatch mode.
     * Defaults to "pushed_now" so the field is optional.
     */
    mode: zod_1.z
        .enum(["pushed_now", "scheduled"], {
        errorMap: () => ({ message: 'Mode must be "pushed_now" or "scheduled"' }),
    })
        .default("pushed_now"),
    /**
     * ISO-8601 datetime string (e.g. "2025-12-01T09:00:00Z").
     * Required when mode is "scheduled".
     */
    scheduledAt: zod_1.z
        .string()
        .datetime({ message: "scheduledAt must be a valid ISO-8601 datetime" })
        .optional(),
    /**
     * Optional upper bound for the scheduling window.
     * Must be after scheduledAt when provided.
     */
    scheduledEndAt: zod_1.z
        .string()
        .datetime({ message: "scheduledEndAt must be a valid ISO-8601 datetime" })
        .optional(),
})
    // When mode is "scheduled", scheduledAt is required
    .refine((data) => data.mode !== "scheduled" || !!data.scheduledAt, {
    message: "scheduledAt is required when mode is 'scheduled'",
    path: ["scheduledAt"],
})
    // scheduledEndAt must come after scheduledAt
    .refine((data) => {
    if (!data.scheduledAt || !data.scheduledEndAt)
        return true;
    return new Date(data.scheduledEndAt) > new Date(data.scheduledAt);
}, {
    message: "scheduledEndAt must be after scheduledAt",
    path: ["scheduledEndAt"],
});
// ==========================================
// Update Pushed Notification Schema
// ==========================================
exports.updatePushedNotificationSchema = zod_1.z
    .object({
    title: zod_1.z
        .string()
        .min(1, "Title cannot be empty")
        .max(255, "Title must not exceed 255 characters")
        .optional(),
    body: zod_1.z
        .string()
        .min(1, "Body cannot be empty")
        .optional(),
    mode: zod_1.z
        .enum(["pushed_now", "scheduled"], {
        errorMap: () => ({ message: 'Mode must be "pushed_now" or "scheduled"' }),
    })
        .optional(),
    scheduledAt: zod_1.z
        .string()
        .datetime({ message: "scheduledAt must be a valid ISO-8601 datetime" })
        .optional(),
    scheduledEndAt: zod_1.z
        .string()
        .datetime({ message: "scheduledEndAt must be a valid ISO-8601 datetime" })
        .optional(),
})
    .refine((data) => {
    if (!data.scheduledAt || !data.scheduledEndAt)
        return true;
    return new Date(data.scheduledEndAt) > new Date(data.scheduledAt);
}, {
    message: "scheduledEndAt must be after scheduledAt",
    path: ["scheduledEndAt"],
});
