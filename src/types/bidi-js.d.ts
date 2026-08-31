declare module 'bidi-js' {
    export interface Paragraph {
        start: number;
        end: number;
        level: number;
    }

    export interface EmbeddingLevelsResult {
        levels: Uint8Array;
        paragraphs: Paragraph[];
    }

    export interface Bidi {
        getEmbeddingLevels(
            text: string,
            baseDirection?: 'ltr' | 'rtl' | 'auto'
        ): EmbeddingLevelsResult;
        getReorderSegments(
            text: string,
            embeddingLevelsResult: EmbeddingLevelsResult,
            start?: number,
            end?: number
        ): number[][];
        getMirroredCharacter(char: string): string | null;
        getMirroredCharactersMap(
            text: string,
            embeddingLevelsResult: EmbeddingLevelsResult,
            start?: number,
            end?: number
        ): Map<number, string>;
        getReorderedString(
            text: string,
            embeddingLevelsResult: EmbeddingLevelsResult,
            start?: number,
            end?: number
        ): string;
        getReorderedIndices(
            text: string,
            embeddingLevelsResult: EmbeddingLevelsResult,
            start?: number,
            end?: number
        ): number[];
        getBidiCharType(char: string): number;
        getBidiCharTypeName(char: string): string;
        openingToClosingBracket(char: string): string | null;
        closingToOpeningBracket(char: string): string | null;
        getCanonicalBracket(char: string): string | null;
    }

    export default function bidiFactory(): Bidi;
}
