import { ArabicShaper } from 'arabic-persian-reshaper';

export function fixArabicText(text: string | null | undefined): string {
  if (!text) return '';
  const containsArabic = /[\u0600-\u06FF]/.test(text);
  if (!containsArabic) return text;

  // 1. Convert to connected glyph forms
  const reshaped = ArabicShaper.convertArabic(text);

  // 2. Reverse word order for RTL rendering in PDFKit while preserving individual word character sequence
  return reshaped
    .split(' ')
    .reverse()
    .map(word => word.split('').reverse().join(''))
    .join(' ');
}