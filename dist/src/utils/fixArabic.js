"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasArabic = hasArabic;
exports.convertArabicDigitsToWestern = convertArabicDigitsToWestern;
exports.fixArabicText = fixArabicText;
function hasArabic(str) {
    return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(str);
}
const ARABIC_DIGITS_MAP = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};
function convertArabicDigitsToWestern(str) {
    return str.replace(/[٠-٩]/g, d => ARABIC_DIGITS_MAP[d] || d);
}
const BRACKET_MAP = {
    "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{",
};
function tokenize(str) {
    // split into: spaces / brackets / punctuation / words
    const parts = str.match(/\s+|[()\[\]{}]|[:،,.؛]|[^\s()\[\]{}:،,.؛]+/g) || [];
    return parts.map(p => {
        if (/^\s+$/.test(p))
            return { text: p, kind: "neutral" };
        if (BRACKET_MAP[p])
            return { text: p, kind: "neutral" };
        if (/^[:،,.؛]$/.test(p))
            return { text: p, kind: "neutral" };
        return { text: p, kind: hasArabic(p) ? "ar" : "ltr" };
    });
}
/**
 * Visual reordering for PDFKit + fontkit (fontkit reverses letters inside Arabic words,
 * so we reverse token ORDER, keep LTR chunks (numbers/latin) intact, and mirror brackets).
 */
function fixArabicText(text) {
    if (!text)
        return "";
    const str = convertArabicDigitsToWestern(String(text));
    if (!hasArabic(str))
        return str;
    const tokens = tokenize(str);
    // Merge consecutive LTR tokens (with neutral spaces/dots between them) into one chunk
    const merged = [];
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.kind === "ltr") {
            let chunk = t.text;
            let j = i + 1;
            while (j < tokens.length) {
                const n = tokens[j];
                const next = tokens[j + 1];
                if (n.kind === "ltr") {
                    chunk += n.text;
                    j++;
                }
                else if (n.kind === "neutral" && /^[\s.,]$/.test(n.text) && next && next.kind === "ltr") {
                    chunk += n.text + next.text;
                    j += 2;
                }
                else if (n.kind === "neutral" && n.text === "%") {
                    chunk += n.text;
                    j++;
                }
                else
                    break;
            }
            merged.push({ text: chunk, kind: "ltr" });
            i = j - 1;
        }
        else {
            merged.push(t);
        }
    }
    // Reverse order; mirror brackets; LTR chunks stay as they are
    return merged
        .reverse()
        .map(t => (BRACKET_MAP[t.text] ? BRACKET_MAP[t.text] : t.text))
        .join("");
}
