import { ArabicShaper } from "arabic-persian-reshaper";
import bidiFactory from "bidi-js";

const bidi = bidiFactory();

// Check if string contains any Arabic characters
export function hasArabic(str: string): boolean {
    return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(str);
}

// Convert Eastern Arabic numerals to Western digits if needed
const ARABIC_DIGITS_MAP: Record<string, string> = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

export function convertArabicDigitsToWestern(str: string): string {
    return str.replace(/[٠-٩]/g, d => ARABIC_DIGITS_MAP[d] || d);
}

/**
 * Main export: Prepares Arabic text for printing with PDFKit.
 * 1. Reshapes Arabic letters to their contextual visual presentation forms.
 * 2. Applies the Unicode Bidirectional Algorithm (UBA) with RTL base direction.
 */
export function fixArabicText(text: string | null | undefined): string {
    if (!text) return "";
    const textStr = String(text);

    if (!hasArabic(textStr)) {
        return textStr;
    }

    return textStr
        .split("\n")
        .map(line => {
            if (!hasArabic(line)) return line;
            try {
                const reshaped = ArabicShaper.convertArabic(line);
                const levels = bidi.getEmbeddingLevels(reshaped, "rtl");
                return bidi.getReorderedString(reshaped, levels);
            } catch (err) {
                console.error("Error reshaping Arabic text for PDF:", err);
                return line;
            }
        })
        .join("\n");
}
