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
 * Prepares Arabic text for PDFKit rendering with Cairo OpenType font.
 * Cairo font's OpenType GSUB tables and FontKit natively handle contextual shaping,
 * ligatures, RTL word flow, and bracket/parenthesis mirroring.
 * Pre-reversing words or brackets corrupts the natural reading order and flips brackets.
 */
export function fixArabicText(text: string | null | undefined): string {
    if (!text) return "";
    return convertArabicDigitsToWestern(String(text));
}
