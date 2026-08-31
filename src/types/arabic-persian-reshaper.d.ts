declare module 'arabic-persian-reshaper' {
    export interface Shaper {
        convertArabic(text: string): string;
        convertArabicBack(text: string): string;
    }
    export const ArabicShaper: Shaper;
    export const PersianShaper: Shaper;
}
