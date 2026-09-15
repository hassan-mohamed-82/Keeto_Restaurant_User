import { z } from "zod";

export const STANDARD_DAYS_OF_WEEK = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
] as const;

export type StandardDayOfWeek = (typeof STANDARD_DAYS_OF_WEEK)[number];

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

const normalizeDay = (day: any): string | null => {
    if (day === undefined || day === null) return null;
    const str = String(day).trim().toLowerCase();

    // Support numeric day (0 = sunday, ..., 6 = saturday)
    if (/^[0-6]$/.test(str)) {
        return STANDARD_DAYS_OF_WEEK[parseInt(str, 10)];
    }

    const dayMap: Record<string, StandardDayOfWeek> = {
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

export const parseDaysArray = (val: any): StandardDayOfWeek[] => {
    if (val === undefined || val === null) return [];
    val = safeParseJson(val);

    let rawList: any[] = [];
    if (typeof val === "string") {
        rawList = val.includes(",") ? val.split(",") : [val];
    } else if (Array.isArray(val)) {
        rawList = val;
    }

    const normalizedDays: StandardDayOfWeek[] = [];
    for (const item of rawList) {
        const normalized = normalizeDay(item);
        if (normalized && !normalizedDays.includes(normalized as StandardDayOfWeek)) {
            normalizedDays.push(normalized as StandardDayOfWeek);
        }
    }

    return normalizedDays;
};

const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;

const timeSchema = z
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

const offerPriceSchema = z.preprocess(
    (val) => {
        if (typeof val === "string" && val.trim() !== "") {
            const num = Number(val);
            return isNaN(num) ? val : num;
        }
        return val;
    },
    z
        .number({
            required_error: "offer_price is required",
            invalid_type_error: "offer_price must be numeric",
        })
        .min(0, "offer_price must be greater than or equal to 0")
        .transform((v) => String(v))
);

const offerDaysSchema = z.preprocess(
    (val) => parseDaysArray(val),
    z
        .array(z.enum(STANDARD_DAYS_OF_WEEK), {
            required_error: "offer_days is required",
            invalid_type_error: "offer_days must be an array of standard weekdays",
        })
        .min(1, "offer_days must contain at least one valid day")
);

// ==========================================
// Store Food Offer Schema
// ==========================================
export const storeFoodOfferSchema = z.object({
    foodId: z
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
export const updateFoodOfferSchema = z.object({
    foodId: z
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
export const getFoodOfferQuerySchema = z.object({
    page: z
        .preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 1), z.number().int().min(1).default(1))
        .optional(),
    limit: z
        .preprocess((v) => (v !== undefined && v !== null && v !== "" ? Number(v) : 10), z.number().int().min(1).max(100).default(10))
        .optional(),
    all: z
        .preprocess((v) => v === "true" || v === true, z.boolean().default(false))
        .optional(),
    search: z.string().optional(),
    lang: z.enum(["en", "ar", "fr"]).optional(),
});

export type StoreFoodOfferInput = z.infer<typeof storeFoodOfferSchema>;
export type UpdateFoodOfferInput = z.infer<typeof updateFoodOfferSchema>;
export type GetFoodOfferQueryInput = z.infer<typeof getFoodOfferQuerySchema>;
