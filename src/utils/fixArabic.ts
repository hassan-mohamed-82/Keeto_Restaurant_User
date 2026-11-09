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

const swapBrackets = (s: string) =>
    s.replace(/[()\[\]{}<>]/g, c => ({ "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<" }[c]!));

/**
 * fontkit already reverses the letters inside each Arabic word,
 * so we only need to reverse the WORD ORDER of the line.
 * LTR chunks (numbers, latin, currency) keep their internal order.
 */
export function fixArabicText(text: string | null | undefined): string {
    if (!text) return "";
    const str = convertArabicDigitsToWestern(String(text));
    if (!hasArabic(str)) return str;

    // Group consecutive tokens: Arabic tokens together, non-Arabic tokens together
    const groups: { ltr: boolean; tokens: string[] }[] = [];
    for (const token of str.split(" ")) {
        if (token === "") continue;
        const ltr = !hasArabic(token);
        const last = groups[groups.length - 1];
        if (last && last.ltr === ltr) last.tokens.push(token);
        else groups.push({ ltr, tokens: [token] });
    }

    return groups
        .reverse()
        .map(g =>
            g.ltr
                ? g.tokens.join(" ")                                  // keep numbers/latin order
                : g.tokens.reverse().map(swapBrackets).join(" ")      // reverse Arabic word order
        )
        .join(" ");
}