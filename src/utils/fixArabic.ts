// Pure TypeScript zero-dependency Arabic Contextual Shaper & BiDi Reorder Engine
// Implements Unicode Arabic Presentation Forms-B & Forms-A and Lam-Alef Ligatures

interface GlyphForms {
    isolated: number;
    final: number;
    initial: number;
    medial: number;
    dualConnecting: boolean;
}

// Arabic Presentation Forms Mapping Table
const GLYPH_MAP: Record<number, GlyphForms> = {
    // Hamza
    0x0621: { isolated: 0xFE80, final: 0xFE80, initial: 0xFE80, medial: 0xFE80, dualConnecting: false },
    // Alef with Madda
    0x0622: { isolated: 0xFE81, final: 0xFE82, initial: 0xFE81, medial: 0xFE82, dualConnecting: false },
    // Alef with Hamza Above
    0x0623: { isolated: 0xFE83, final: 0xFE84, initial: 0xFE83, medial: 0xFE84, dualConnecting: false },
    // Waw with Hamza Above
    0x0624: { isolated: 0xFE85, final: 0xFE86, initial: 0xFE85, medial: 0xFE86, dualConnecting: false },
    // Alef with Hamza Below
    0x0625: { isolated: 0xFE87, final: 0xFE88, initial: 0xFE87, medial: 0xFE88, dualConnecting: false },
    // Yeh with Hamza Above
    0x0626: { isolated: 0xFE89, final: 0xFE8A, initial: 0xFE8B, medial: 0xFE8C, dualConnecting: true },
    // Alef
    0x0627: { isolated: 0xFE8D, final: 0xFE8E, initial: 0xFE8D, medial: 0xFE8E, dualConnecting: false },
    // Beh
    0x0628: { isolated: 0xFE8F, final: 0xFE90, initial: 0xFE91, medial: 0xFE92, dualConnecting: true },
    // Teh Marbuta
    0x0629: { isolated: 0xFE93, final: 0xFE94, initial: 0xFE93, medial: 0xFE94, dualConnecting: false },
    // Teh
    0x062A: { isolated: 0xFE95, final: 0xFE96, initial: 0xFE97, medial: 0xFE98, dualConnecting: true },
    // Theh
    0x062B: { isolated: 0xFE99, final: 0xFE9A, initial: 0xFE9B, medial: 0xFE9C, dualConnecting: true },
    // Jeem
    0x062C: { isolated: 0xFE9D, final: 0xFE9E, initial: 0xFE9F, medial: 0xFEA0, dualConnecting: true },
    // Hah
    0x062D: { isolated: 0xFEA1, final: 0xFEA2, initial: 0xFEA3, medial: 0xFEA4, dualConnecting: true },
    // Khah
    0x062E: { isolated: 0xFEA5, final: 0xFEA6, initial: 0xFEA7, medial: 0xFEA8, dualConnecting: true },
    // Dal
    0x062F: { isolated: 0xFEA9, final: 0xFEAA, initial: 0xFEA9, medial: 0xFEAA, dualConnecting: false },
    // Thal
    0x0630: { isolated: 0xFEAB, final: 0xFEAC, initial: 0xFEAB, medial: 0xFEAC, dualConnecting: false },
    // Reh
    0x0631: { isolated: 0xFEAD, final: 0xFEAE, initial: 0xFEAD, medial: 0xFEAE, dualConnecting: false },
    // Zain
    0x0632: { isolated: 0xFEAF, final: 0xFEB0, initial: 0xFEAF, medial: 0xFEB0, dualConnecting: false },
    // Seen
    0x0633: { isolated: 0xFEB1, final: 0xFEB2, initial: 0xFEB3, medial: 0xFEB4, dualConnecting: true },
    // Sheen
    0x0634: { isolated: 0xFEB5, final: 0xFEB6, initial: 0xFEB7, medial: 0xFEB8, dualConnecting: true },
    // Sad
    0x0635: { isolated: 0xFEB9, final: 0xFEBA, initial: 0xFEBB, medial: 0xFEBC, dualConnecting: true },
    // Dad
    0x0636: { isolated: 0xFEBD, final: 0xFEBE, initial: 0xFEBF, medial: 0xFEC0, dualConnecting: true },
    // Tah
    0x0637: { isolated: 0xFEC1, final: 0xFEC2, initial: 0xFEC3, medial: 0xFEC4, dualConnecting: true },
    // Zah
    0x0638: { isolated: 0xFEC5, final: 0xFEC6, initial: 0xFEC7, medial: 0xFEC8, dualConnecting: true },
    // Ain
    0x0639: { isolated: 0xFEC9, final: 0xFECA, initial: 0xFECB, medial: 0xFECC, dualConnecting: true },
    // Ghain
    0x063A: { isolated: 0xFECD, final: 0xFECE, initial: 0xFECF, medial: 0xFED0, dualConnecting: true },
    // Feh
    0x0641: { isolated: 0xFED1, final: 0xFED2, initial: 0xFED3, medial: 0xFED4, dualConnecting: true },
    // Qaf
    0x0642: { isolated: 0xFED5, final: 0xFED6, initial: 0xFED7, medial: 0xFED8, dualConnecting: true },
    // Kaf
    0x0643: { isolated: 0xFED9, final: 0xFEDA, initial: 0xFEDB, medial: 0xFEDC, dualConnecting: true },
    // Lam
    0x0644: { isolated: 0xFEDD, final: 0xFEDE, initial: 0xFEDF, medial: 0xFEE0, dualConnecting: true },
    // Meem
    0x0645: { isolated: 0xFEE1, final: 0xFEE2, initial: 0xFEE3, medial: 0xFEE4, dualConnecting: true },
    // Noon
    0x0646: { isolated: 0xFEE5, final: 0xFEE6, initial: 0xFEE7, medial: 0xFEE8, dualConnecting: true },
    // Heh
    0x0647: { isolated: 0xFEE9, final: 0xFEEA, initial: 0xFEEB, medial: 0xFEEC, dualConnecting: true },
    // Waw
    0x0648: { isolated: 0xFEED, final: 0xFEEE, initial: 0xFEED, medial: 0xFEEE, dualConnecting: false },
    // Alef Maksura (ى)
    0x0649: { isolated: 0xFEEF, final: 0xFEF0, initial: 0xFBE8, medial: 0xFBE9, dualConnecting: false },
    // Yeh (ي)
    0x064A: { isolated: 0xFEF1, final: 0xFEF2, initial: 0xFEF3, medial: 0xFEF4, dualConnecting: true },

    // Persian / Urdu additions
    0x067E: { isolated: 0xFB56, final: 0xFB57, initial: 0xFB58, medial: 0xFB59, dualConnecting: true }, // Peh
    0x0686: { isolated: 0xFB7A, final: 0xFB7B, initial: 0xFB7C, medial: 0xFB7D, dualConnecting: true }, // Tcheh
    0x0698: { isolated: 0xFB8A, final: 0xFB8B, initial: 0xFB8A, medial: 0xFB8B, dualConnecting: false }, // Jeh
    0x06AF: { isolated: 0xFB92, final: 0xFB93, initial: 0xFB94, medial: 0xFB95, dualConnecting: true }, // Gaf
    0x06A9: { isolated: 0xFB8E, final: 0xFB8F, initial: 0xFB90, medial: 0xFB91, dualConnecting: true }, // Keheh
    0x06CC: { isolated: 0xFBFC, final: 0xFBFD, initial: 0xFBFE, medial: 0xFBFF, dualConnecting: true }, // Farsi Yeh
};

// Lam-Alef Ligatures Table
// Maps [Lam, AlefType] -> { isolated, final }
const LAM_ALEF_MAP: Record<number, { isolated: number; final: number }> = {
    0x0622: { isolated: 0xFEF5, final: 0xFEF6 }, // ﻵ
    0x0623: { isolated: 0xFEF7, final: 0xFEF8 }, // ﻷ
    0x0625: { isolated: 0xFEF9, final: 0xFEFA }, // ﻹ
    0x0627: { isolated: 0xFEFB, final: 0xFEFC }, // ﻻ
};

// Harakat / Diacritics regex (Fatha, Damma, Kasra, Shadda, Sukun, Tanween, etc.)
const HARAKAT_REGEX = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;

// Bracket reflection map for RTL
const BRACKET_MAP: Record<string, string> = {
    '(': ')',
    ')': '(',
    '[': ']',
    ']': '[',
    '{': '}',
    '}': '{',
    '<': '>',
    '>': '<',
    '«': '»',
    '»': '«',
};

// Arabic Digits (Eastern Arabic) to Western Digits conversion if needed
const ARABIC_DIGITS_MAP: Record<string, string> = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

export function convertArabicDigitsToWestern(str: string): string {
    return str.replace(/[٠-٩]/g, d => ARABIC_DIGITS_MAP[d] || d);
}

function isArabicChar(code: number): boolean {
    return GLYPH_MAP[code] !== undefined;
}

function connectsToPrev(code: number): boolean {
    // All Arabic letters except Hamza (0x0621) can connect to a previous dual-connecting letter
    return isArabicChar(code) && code !== 0x0621;
}

/**
 * Reshape an Arabic string into connected Presentation Forms-B glyphs
 */
export function reshapeArabic(text: string): string {
    if (!text) return '';

    // Strip harakat for accurate connection
    const cleanText = text.replace(HARAKAT_REGEX, '');
    const charCodes: number[] = [];
    for (let i = 0; i < cleanText.length; i++) {
        charCodes.push(cleanText.charCodeAt(i));
    }

    const result: string[] = [];
    const len = charCodes.length;

    for (let i = 0; i < len; i++) {
        const currentCode = charCodes[i];

        if (!isArabicChar(currentCode)) {
            // Non-Arabic character (space, punctuation, English, number, etc.)
            result.push(String.fromCharCode(currentCode));
            continue;
        }

        const glyphInfo = GLYPH_MAP[currentCode];

        // Check if previous character connects to current
        let prevConnects = false;
        if (i > 0) {
            const prevCode = charCodes[i - 1];
            if (isArabicChar(prevCode) && GLYPH_MAP[prevCode]?.dualConnecting) {
                prevConnects = true;
            }
        }

        // Check for Lam-Alef ligature (0x0644 followed by 0x0622, 0x0623, 0x0625, or 0x0627)
        if (currentCode === 0x0644 && i + 1 < len) {
            const nextCode = charCodes[i + 1];
            const lamAlefLigature = LAM_ALEF_MAP[nextCode];
            if (lamAlefLigature) {
                // Determine ligature form
                const ligCode = prevConnects ? lamAlefLigature.final : lamAlefLigature.isolated;
                result.push(String.fromCharCode(ligCode));
                i++; // Skip the Alef
                continue;
            }
        }

        // Check if current character connects to next
        let nextConnects = false;
        if (i + 1 < len && glyphInfo.dualConnecting) {
            const nextCode = charCodes[i + 1];
            if (connectsToPrev(nextCode)) {
                nextConnects = true;
            }
        }

        // Determine shape
        let shapedCode: number;
        if (prevConnects && nextConnects) {
            shapedCode = glyphInfo.medial;
        } else if (prevConnects && !nextConnects) {
            shapedCode = glyphInfo.final;
        } else if (!prevConnects && nextConnects) {
            shapedCode = glyphInfo.initial;
        } else {
            shapedCode = glyphInfo.isolated;
        }

        result.push(String.fromCharCode(shapedCode));
    }

    return result.join('');
}

/**
 * Checks if a string or token has any Arabic characters
 */
export function hasArabic(str: string): boolean {
    return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(str);
}

/**
 * Tokenize a line into runs of Arabic, English/Numbers, and Separators
 * and reorder them for correct LTR rendering in PDFKit.
 */
function processLineForPdf(line: string): string {
    if (!line) return '';
    if (!hasArabic(line)) return line;

    // Check if line starts with an LTR English label like "Street: ", "Zone: ", "Payment: ", "Client: ", "Branch: ", "Address: ", "Bldg: ", "Floor: ", "Apt: ", "Landmark: ", "+ "
    const labelMatch = line.match(/^([A-Za-z0-9\s\#\:\-\+\|\.\,\/]+\:\s*|\s*\+\s*)/);
    if (labelMatch) {
        const prefix = labelMatch[0];
        const rest = line.substring(prefix.length);
        if (hasArabic(rest)) {
            return prefix + processArabicSentence(rest);
        }
        return line;
    }

    return processArabicSentence(line);
}

/**
 * Reorders an Arabic sentence (which may contain numbers, English words, punctuation)
 * into a visually correct LTR string for PDFKit.
 */
function processArabicSentence(sentence: string): string {
    // 1. Reshape the Arabic glyphs into presentation forms
    const reshaped = reshapeArabic(sentence);

    // 2. Tokenize the reshaped sentence into:
    // - Arabic words (reshaped letters)
    // - LTR tokens (English words, numbers, decimals, special codes)
    // - Whitespace & Punctuation
    const tokens: Array<{ type: 'arabic' | 'ltr' | 'space' | 'punct'; value: string }> = [];

    // Regex to match tokens:
    // Group 1: Arabic Presentation Forms / Arabic chars
    // Group 2: English words, numbers, currency symbols, hashtags
    // Group 3: Whitespace
    // Group 4: Punctuation / other symbols
    const tokenRegex = /([\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]+)|([A-Za-z0-9\.\,\:\-\+\#\$\%\&]+)|(\s+)|([^\s\w\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF])/g;

    let match;
    while ((match = tokenRegex.exec(reshaped)) !== null) {
        if (match[1]) {
            tokens.push({ type: 'arabic', value: match[1] });
        } else if (match[2]) {
            tokens.push({ type: 'ltr', value: match[2] });
        } else if (match[3]) {
            tokens.push({ type: 'space', value: match[3] });
        } else if (match[4]) {
            const ch = match[4];
            tokens.push({ type: 'punct', value: BRACKET_MAP[ch] || ch });
        }
    }

    // In Arabic RTL context, sentences read from right to left.
    // To render correctly in PDFKit (which places chars LTR):
    // 1) Each Arabic word's characters are reversed.
    // 2) The sequence of all tokens in the sentence is reversed.
    // 3) LTR tokens (numbers, English) retain their internal left-to-right character order.
    const reversedTokens = tokens.reverse().map(token => {
        if (token.type === 'arabic') {
            return Array.from(token.value).reverse().join('');
        }
        return token.value;
    });

    return reversedTokens.join('');
}

/**
 * Main export: Prepares Arabic/Mixed text for printing with PDFKit
 */
export function fixArabicText(text: string | null | undefined): string {
    if (!text) return '';
    const textStr = String(text);

    if (!hasArabic(textStr)) {
        return textStr;
    }

    // Handle multiline strings line-by-line
    return textStr
        .split('\n')
        .map(line => processLineForPdf(line))
        .join('\n');
}