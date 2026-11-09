import bidiFactory from "bidi-js";

const bidi = bidiFactory();

// Check if string contains any Arabic characters
export function hasArabic(str: string): boolean {
    return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(str);
}

const ARABIC_DIGITS_MAP: Record<string, string> = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

export function convertArabicDigitsToWestern(str: string): string {
    return str.replace(/[٠-٩]/g, d => ARABIC_DIGITS_MAP[d] || d);
}

/**
 * Reorders a (logical-order) string into visual order for PDFKit,
 * which doesn't implement the Unicode Bidi algorithm.
 */
export function fixArabicText(text: string | null | undefined): string {
    if (!text) return "";
    const str = convertArabicDigitsToWestern(String(text));
    if (!hasArabic(str)) return str;

    const embeddingLevels = bidi.getEmbeddingLevels(str, "rtl");
    const flips = bidi.getReorderSegments(str, embeddingLevels);

    const chars = str.split("");
    for (const [start, end] of flips) {
        const slice = chars.slice(start, end + 1).reverse();
        chars.splice(start, slice.length, ...slice);
    }

    // Mirror brackets/parentheses inside RTL runs
    const mirrored = bidi.getMirroredCharactersMap(str, embeddingLevels);
    mirrored.forEach((replacement: string, index: number) => {
        chars[index] = replacement;
    });

    return chars.join("");
}