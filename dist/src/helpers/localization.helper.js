"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLocalizedDescription = exports.getLocalizedName = exports.extractLang = void 0;
exports.parseJsonArray = parseJsonArray;
/**
 * Extracts language from body, query, or accept-language header.
 * Defaults to 'en'.
 */
const extractLang = (req) => {
    const raw = (req.body?.lang || req.query?.lang || req.headers["accept-language"] || "en");
    const lower = String(raw).toLowerCase().trim().slice(0, 2);
    if (lower === "ar")
        return "ar";
    if (lower === "fr")
        return "fr";
    return "en";
};
exports.extractLang = extractLang;
/**
 * Resolves localized name with strict fallback to English (name)
 * if the requested language column is null, undefined, or empty.
 */
const getLocalizedName = (item, lang = "en") => {
    if (!item)
        return "";
    if (lang === "ar" && item.nameAr && item.nameAr.trim() !== "") {
        return item.nameAr;
    }
    if (lang === "fr" && item.nameFr && item.nameFr.trim() !== "") {
        return item.nameFr;
    }
    // Universal Fallback: Show English name if requested language column is null/empty
    return item.name || "";
};
exports.getLocalizedName = getLocalizedName;
/**
 * Resolves localized description with strict fallback to English (description)
 * if the requested language column is null, undefined, or empty.
 */
const getLocalizedDescription = (item, lang = "en") => {
    if (!item)
        return "";
    if (lang === "ar" && item.descriptionAr && item.descriptionAr.trim() !== "") {
        return item.descriptionAr;
    }
    if (lang === "fr" && item.descriptionFr && item.descriptionFr.trim() !== "") {
        return item.descriptionFr;
    }
    // Universal Fallback: Show English description if requested language column is null/empty
    return item.description || "";
};
exports.getLocalizedDescription = getLocalizedDescription;
/**
 * Robustly parses any JSON / array / string representation into a string array.
 * Handles MySQL JSON string column returns, double-stringified JSON, and comma-separated lists.
 */
function parseJsonArray(val) {
    if (!val)
        return [];
    if (Array.isArray(val))
        return val.map(String).filter(Boolean);
    if (typeof val === "string") {
        const trimmed = val.trim();
        if (!trimmed)
            return [];
        try {
            let parsed = JSON.parse(trimmed);
            if (typeof parsed === "string") {
                try {
                    parsed = JSON.parse(parsed);
                }
                catch {
                    // keep parsed as string
                }
            }
            if (Array.isArray(parsed))
                return parsed.map(String).filter(Boolean);
        }
        catch {
            if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
                const inner = trimmed.slice(1, -1).trim();
                if (!inner)
                    return [];
                return inner
                    .split(",")
                    .map((s) => s.replace(/["']/g, "").trim())
                    .filter(Boolean);
            }
            return [trimmed];
        }
    }
    return [];
}
