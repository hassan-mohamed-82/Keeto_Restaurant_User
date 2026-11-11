import { DataSheetName } from "./columns";

/** "File" is used for problems that are not tied to one sheet (unreadable file, no data, ...). */
export type ImportSheetName = DataSheetName | "File";

/**
 * One validation problem. `row` is the real Excel row number (header = row 1);
 * `row` / `column` are null for file- or sheet-level problems.
 */
export interface ImportError {
    sheet: ImportSheetName;
    row: number | null;
    column: string | null;
    message: string;
}

/** A row that was not imported because the item already exists in the database. */
export interface SkippedRow {
    sheet: DataSheetName;
    row: number;
    name: string;
    reason: string;
}

export interface ImportCounts {
    subcategories: number;
    foods: number;
    variations: number;
    options: number;
}
