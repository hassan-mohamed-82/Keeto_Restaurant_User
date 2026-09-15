"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFoodOfferQuerySchema = exports.updateFoodOfferSchema = exports.storeFoodOfferSchema = exports.parseDaysArray = exports.STANDARD_DAYS_OF_WEEK = void 0;
exports.safeParseJson = safeParseJson;
const zod_1 = require("zod");
exports.STANDARD_DAYS_OF_WEEK = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
];
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
const normalizeDay = (day) => {
    if (day === undefined || day === null)
        return null;
    const str = String(day).trim().toLowerCase();
    // Support numeric day (0 = sunday, ..., 6 = saturday)
    if (/^[0-6]$/.test(str)) {
        return exports.STANDARD_DAYS_OF_WEEK[parseInt(str, 10)];
    }
    const dayMap = {
        sun: "sunday",
        sunday: "sunday",
        mon: "monday",
        monday: "monday",
        tue: "tuesday",
        tues: "tuesday",
        tuesday: "tuesday",
        wed: "wednesday",
        wednesday: "wednesday",
        thu: "thursday",
        thur: "thursday",
        thurs: "thursday",
        thursday: "thursday",
        fri: "friday",
        friday: "friday",
        sat: "saturday",
        saturday: "saturday",
    };
    return dayMap[str] || null;
};
const parseDaysArray = (val) => {
    if (val === undefined || val === null)
        return [];
    val = safeParseJson(val);
    let rawList = [];
    if (typeof val === "string") {
        rawList = val.includes(",") ? val.split(",") : [val];
    }
    else if (Array.isArray(val)) {
        rawList = val;
    }
    const normalizedDays = [];
    for (const item of rawList) {
        const normalized = normalizeDay(item);
        if (normalized && !normalizedDays.includes(normalized)) {
            normalizedDays.push(normalized);
        }
    }
    return normalizedDays;
};
exports.parseDaysArray = parseDaysArray;
const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
const timeSchema = zod_1.z
    .string({ required_error: "Time is required" })
    .trim()
    .regex(timeRegex, "Invalid time format (must be HH:mm or HH:mm:ss)")
    .transform((val) => {
    const parts = val.split(":");
    const h = parts[0].padStart(2, "0");
    const m = parts[1];
    const s = parts[2] ? `:${parts[2]}` : "";
    return `${h}:${m}${s}`;
});
const offerPriceSchema = zod_1.z.preprocess((val) => {
    if (typeof val === "string" && val.trim() !== "") {
        const num = Number(val);
        return isNaN(num) ? val : num;
    }
    return val;
}, zod_1.z
    .number({
    required_error: "offer_price is required",
    invalid_type_error: "offer_price must be numeric",
})
    .min(0, "offer_price must be greater than or equal to 0")
    .transform((v) => String(v)));
const offerDaysSchema = zod_1.z.preprocess((val) => (0, exports.parseDaysArray)(val), zod_1.z
    .array(zod_1.z.enum(exports.STANDARD_DAYS_OF_WEEK), {
    required_error: "offer_days is required",
    invalid_type_error: "offer_days must be an array of standard weekdays",
})
    .min(1, "offer_days must contain at least one valid day"));
// ==========================================
// Store Food Offer Schema
// ==========================================
exports.storeFoodOfferSchema = zod_1.z.object({
    foodId: zod_1.z
        .string({ required_error: "foodId is required" })
        .min(1, "foodId cannot be empty"),
    offer_price: offerPriceSchema,
    offer_days: offerDaysSchema,
    offer_start: timeSchema,
    offer_end: timeSchema,
});
// ==========================================
// Update Food Offer Schema
// ==========================================
exports.updateFoodOfferSchema = zod_1.z.object({
    foodId: zod_1.z
        .string()
        .min(1, "foodId cannot be empty")
        .optional(), // Can come from params or body
    offer_price: offerPriceSchema,
    offer_days: offerDaysSchema,
    offer_start: timeSchema,
    offer_end: timeSchema,
});
// ==========================================
// Query / Filter Schemas
// ==========================================
exports.getFoodOfferQuerySchema = zod_1.z.object({
    page: zod_1.z
        .preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 1), zod_1.z.number().int().min(1).default(1))
        .optional(),
    limit: zod_1.z
        .preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 10), zod_1.z.number().int().min(1).max(100).default(10))
        .optional(),
    all: zod_1.z
        .preprocess((v) => v === "true" || v === true, zod_1.z.boolean().default(false))
        .optional(),
    search: zod_1.z.string().optional(),
    lang: zod_1.z.enum(["en", "ar", "fr"]).optional(),
});
