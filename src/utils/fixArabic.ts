import factory from 'bidi-js';
import { ArabicShaper } from 'arabic-persian-reshaper';

const bidi = factory();

export function fixArabicText(text: string | null | undefined): string {
    if (!text) return '';
    
    // فحص ما إذا كان النص يحتوي على حروف عربية
    const containsArabic = /[\u0600-\u06FF]/.test(text);
    if (!containsArabic) return text;

    // 1. ربط الحروف العربية ببعضها
    const reshaped = ArabicShaper.convertArabic(text);
    // 2. ضبط اتجاه الكتابة من اليمين لليسار
    const embeddingLevels = bidi.getEmbeddingLevels(reshaped, 'ltr');
    const bidiText = bidi.getReorderedString(reshaped, embeddingLevels);
    
    return bidiText;
}