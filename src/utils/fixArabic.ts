import { ArabicShaper } from 'arabic-persian-reshaper';

const bracketMap: Record<string, string> = {
    '(': ')', ')': '(',
    '[': ']', ']': '[',
    '{': '}', '}': '{',
    '<': '>', '>': '<',
    '«': '»', '»': '«'
};

export function fixArabicText(text: string | null | undefined): string {
    if (!text) return '';
    const textStr = String(text);

    // فحص ما إذا كان النص يحتوي على حروف عربية
    const containsArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(textStr);
    if (!containsArabic) return textStr;

    // 1. ربط الحروف العربية ببعضها (Shaping)
    const reshaped = ArabicShaper.convertArabic(textStr);

    // 2. عكس اتجاه النص ليتناسب مع محرك رسم PDFKit (RTL -> LTR Rendering)
    // مع الحفاظ على ترتيب الأرقام والكلمات اللاتينية والأقواس
    return reshaped.split('\n').map(line => {
        const chars = Array.from(line).reverse().map(ch => bracketMap[ch] || ch);
        const reversed = chars.join('');

        // إعادة ترتيب الأرقام والكلمات الإنجليزية التي تم عكسها بشكل غير مقصود
        return reversed.replace(/([A-Za-z0-9\.\,\:\-\+\#\$\%\&]+)/g, (match) => {
            return Array.from(match).reverse().join('');
        });
    }).join('\n');
}