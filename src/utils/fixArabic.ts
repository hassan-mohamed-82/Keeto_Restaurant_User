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

const BRACKET_MAP: Record<string, string> = {
    "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{",
};

type Tok = { text: string; kind: "ar" | "ltr" | "neutral" };

function tokenize(str: string): Tok[] {
    // split into: spaces / brackets / punctuation / words
    const parts = str.match(/\s+|[()\[\]{}]|[:،,.؛]|[^\s()\[\]{}:،,.؛]+/g) || [];
    return parts.map(p => {
        if (/^\s+$/.test(p)) return { text: p, kind: "neutral" as const };
        if (BRACKET_MAP[p]) return { text: p, kind: "neutral" as const };
        if (/^[:،,.؛]$/.test(p)) return { text: p, kind: "neutral" as const };
        return { text: p, kind: hasArabic(p) ? ("ar" as const) : ("ltr" as const) };
    });
}

/**
 * Visual reordering for PDFKit + fontkit (fontkit reverses letters inside Arabic words,
 * so we reverse token ORDER, keep LTR chunks (numbers/latin) intact, and mirror brackets).
 */
export function fixArabicText(text: string | null | undefined): string {
    if (!text) return "";
    const str = convertArabicDigitsToWestern(String(text));
    if (!hasArabic(str)) return str;

    const tokens = tokenize(str);

    // Merge consecutive LTR tokens (with neutral spaces/dots between them) into one chunk
    const merged: Tok[] = [];
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.kind === "ltr") {
            let chunk = t.text;
            let j = i + 1;
            while (j < tokens.length) {
                const n = tokens[j];
                const next = tokens[j + 1];
                if (n.kind === "ltr") { chunk += n.text; j++; }
                else if (n.kind === "neutral" && /^[\s.,]$/.test(n.text) && next && next.kind === "ltr") {
                    chunk += n.text + next.text; j += 2;
                } else if (n.kind === "neutral" && n.text === "%" ) { chunk += n.text; j++; }
                else break;
            }
            merged.push({ text: chunk, kind: "ltr" });
            i = j - 1;
        } else {
            merged.push(t);
        }
    }

    // Reverse order; mirror brackets; LTR chunks stay as they are
    return merged
        .reverse()
        .map(t => (BRACKET_MAP[t.text] ? BRACKET_MAP[t.text] : t.text))
        .join("");
}