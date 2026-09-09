import { Request } from "express";

export type Language = "en" | "ar" | "fr";

/**
 * Extracts language from body, query, or accept-language header.
 * Defaults to 'en'.
 */
export const extractLang = (req: Request): Language => {
    const raw = (req.body?.lang || req.query?.lang || req.headers["accept-language"] || "en") as string;
    const lower = String(raw).toLowerCase().trim().slice(0, 2);
    if (lower === "ar") return "ar";
    if (lower === "fr") return "fr";
    return "en";
};

/**
 * Resolves localized name with strict fallback to English (name)
 * if the requested language column is null, undefined, or empty.
 */
export const getLocalizedName = (
    item: { name: string; nameAr?: string | null; nameFr?: string | null },
    lang: Language = "en"
): string => {
    if (!item) return "";
    if (lang === "ar" && item.nameAr && item.nameAr.trim() !== "") {
        return item.nameAr;
    }
    if (lang === "fr" && item.nameFr && item.nameFr.trim() !== "") {
        return item.nameFr;
    }
    // Universal Fallback: Show English name if requested language column is null/empty
    return item.name || "";
};

/**
 * Resolves localized description with strict fallback to English (description)
 * if the requested language column is null, undefined, or empty.
 */
export const getLocalizedDescription = (
    item: { description?: string | null; descriptionAr?: string | null; descriptionFr?: string | null },
    lang: Language = "en"
): string => {
    if (!item) return "";
    if (lang === "ar" && item.descriptionAr && item.descriptionAr.trim() !== "") {
        return item.descriptionAr;
    }
    if (lang === "fr" && item.descriptionFr && item.descriptionFr.trim() !== "") {
        return item.descriptionFr;
    }
    // Universal Fallback: Show English description if requested language column is null/empty
    return item.description || "";
};
