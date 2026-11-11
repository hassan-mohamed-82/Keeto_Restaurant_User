// =============================================================================
// Builds the downloadable .xlsx template (exceljs).
//
// Sheets: Instructions, Subcategories, Foods, Variations and a hidden Lookups
// sheet with this restaurant's category / subcategory / addon names, used by
// the dropdowns (Excel data validation).
// =============================================================================
import * as ExcelJS from "exceljs";
import { MENU_ENUMS } from "../../helpers/menu.rules";
import {
    ColumnSpecs,
    FOOD_COLUMNS,
    MAX_DATA_ROWS_PER_SHEET,
    MAX_UPLOAD_BYTES,
    SHEET_NAMES,
    SUBCATEGORY_COLUMNS,
    VARIATION_COLUMNS,
} from "./columns";
import { loadTemplateLookups, TemplateLookups } from "./resolver";

export const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const TEMPLATE_FILE_NAME = "menu-import-template.xlsx";

const FIRST_DATA_ROW = 2;
const LAST_DATA_ROW = FIRST_DATA_ROW + MAX_DATA_ROWS_PER_SHEET - 1;
const BOOLEAN_CHOICES = ["yes", "no"] as const;

const COLORS = {
    header: "FF1F4E78",
    requiredHeader: "FFC55A11",
    headerText: "FFFFFFFF",
    title: "FF1F4E78",
} as const;

/** 1 → A, 27 → AA */
function columnLetter(columnNumber: number): string {
    let n = columnNumber;
    let letters = "";
    while (n > 0) {
        const remainder = (n - 1) % 26;
        letters = String.fromCharCode(65 + remainder) + letters;
        n = Math.floor((n - 1) / 26);
    }
    return letters;
}

function columnNumberOf<C extends ColumnSpecs>(columns: C, key: keyof C & string): number {
    return Object.keys(columns).indexOf(key) + 1;
}

// ----------------------------------------------------------------------------
// Data sheets
// ----------------------------------------------------------------------------
function addDataSheet<C extends ColumnSpecs>(workbook: ExcelJS.Workbook, name: string, columns: C): ExcelJS.Worksheet {
    const worksheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    const specs = Object.keys(columns).map((key) => columns[key]);

    worksheet.columns = specs.map((spec) => ({
        header: spec.header,
        key: spec.header,
        width: spec.width,
        // Time columns are formatted as text so "09:00" stays exactly as typed
        style: spec.type === "time" ? { numFmt: "@" } : {},
    }));

    const headerRow = worksheet.getRow(1);
    headerRow.height = 22;
    specs.forEach((spec, index) => {
        const cell = headerRow.getCell(index + 1);
        cell.font = { bold: true, color: { argb: COLORS.headerText } };
        cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: spec.required ? COLORS.requiredHeader : COLORS.header },
        };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.note = spec.note;
    });
    return worksheet;
}

interface ListRule {
    /** Excel list source: a quoted inline list or a range on the Lookups sheet. */
    formula: string;
    /** Strict lists reject values that are not in the list. */
    strict: boolean;
    error: string;
}

function inlineList(values: readonly string[]): string {
    return `"${values.join(",")}"`;
}

function applyListValidation(worksheet: ExcelJS.Worksheet, columnNumber: number, rule: ListRule): void {
    for (let row = FIRST_DATA_ROW; row <= LAST_DATA_ROW; row++) {
        const validation: ExcelJS.DataValidation = {
            type: "list",
            allowBlank: true,
            formulae: [rule.formula],
            showErrorMessage: rule.strict,
        };
        if (rule.strict) {
            validation.errorTitle = "Invalid value";
            validation.error = rule.error;
        }
        worksheet.getCell(row, columnNumber).dataValidation = validation;
    }
}

// ----------------------------------------------------------------------------
// Lookups (hidden)
// ----------------------------------------------------------------------------
interface LookupRanges {
    categories: string | null;
    subcategories: string | null;
    addons: string | null;
}

function addLookupsSheet(workbook: ExcelJS.Workbook, lookups: TemplateLookups): LookupRanges {
    const worksheet = workbook.addWorksheet(SHEET_NAMES.lookups, { state: "hidden" });
    const lists: Array<[keyof LookupRanges, string[]]> = [
        ["categories", lookups.categoryNames],
        ["subcategories", lookups.subcategoryNames],
        ["addons", lookups.addonNames],
    ];
    const ranges: LookupRanges = { categories: null, subcategories: null, addons: null };

    lists.forEach(([key, values], index) => {
        const columnNumber = index + 1;
        const letter = columnLetter(columnNumber);
        worksheet.getColumn(columnNumber).width = 32;
        const header = worksheet.getCell(1, columnNumber);
        header.value = key;
        header.font = { bold: true };
        values.forEach((value, i) => {
            worksheet.getCell(FIRST_DATA_ROW + i, columnNumber).value = value;
        });
        if (values.length > 0) {
            ranges[key] = `'${SHEET_NAMES.lookups}'!$${letter}$${FIRST_DATA_ROW}:$${letter}$${FIRST_DATA_ROW + values.length - 1}`;
        }
    });
    return ranges;
}

// ----------------------------------------------------------------------------
// Instructions
// ----------------------------------------------------------------------------
function addInstructionsSheet(workbook: ExcelJS.Workbook, lookups: TemplateLookups): void {
    const worksheet = workbook.addWorksheet(SHEET_NAMES.instructions);
    worksheet.getColumn(1).width = 120;

    const addLine = (text: string, style: "title" | "heading" | "text" = "text"): void => {
        const row = worksheet.addRow([text]);
        const cell = row.getCell(1);
        cell.alignment = { wrapText: true, vertical: "top" };
        if (style === "title") cell.font = { bold: true, size: 16, color: { argb: COLORS.title } };
        if (style === "heading") cell.font = { bold: true, size: 12, color: { argb: COLORS.title } };
    };
    const blank = (): void => {
        worksheet.addRow([""]);
    };

    addLine("Menu import: subcategories and foods", "title");
    blank();
    addLine("How to use", "heading");
    addLine("1. (Optional) Fill the Subcategories sheet with new subcategories.");
    addLine("2. Fill the Foods sheet. One row per food.");
    addLine("3. (Optional) Fill the Variations sheet: one row per option. Rows with the same food + variationName form one variation.");
    addLine("4. Upload the file to check it first (validate), then upload it again to import it (commit). Nothing is saved if any row has an error.");
    blank();
    addLine("Rules", "heading");
    addLine("• Use names, not IDs. Names match ignoring upper/lower case, extra spaces, Arabic diacritics and أ/إ/آ, ى/ي, ة/ه differences. The Arabic name (nameAr) is matched too.");
    addLine("• Categories must already exist: pick them from the dropdown. A category that is not found, or whose name matches more than one category, is an error.");
    addLine("• A food's subcategory must belong to the food's category. It can be an existing subcategory or one added in the Subcategories sheet of this file.");
    addLine("• Rows that already exist (same category + name for this restaurant) are skipped and listed as skipped. They are not duplicated.");
    addLine("• The same category + name twice in the file is an error.");
    addLine("• Required columns have an orange header: Subcategories: category, name. Foods: category, name, description, startTime, endTime, price. Variations: food, variationName, optionName.");
    addLine("• Times use the 24-hour format HH:mm, e.g. 09:00 or 23:30. Excel time cells are accepted too.");
    addLine("• Images are optional. Paste an image URL starting with http:// or https://, or leave the cell empty.");
    addLine("• yes / no columns: is_Halal, isOutOfStock, isRequired.");
    addLine("• Numbers use \".\" for decimals, e.g. 85.50.");
    addLine("• An active food cannot be placed under an inactive subcategory.");
    addLine("• Addons: type addon names separated by commas, e.g. \"Extra cheese, Ketchup\". The available names are listed below and in the hidden Lookups sheet (right-click a sheet tab → Unhide).");
    addLine(`• Limits: .xlsx files only, at most ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB and ${MAX_DATA_ROWS_PER_SHEET} rows per sheet.`);
    blank();
    addLine("Allowed values", "heading");
    addLine(`• priority: ${MENU_ENUMS.subcategoryPriority.join(" | ")} (default low)`);
    addLine(`• status: ${MENU_ENUMS.foodStatus.join(" | ")} (default active)`);
    addLine(`• foodtype: ${MENU_ENUMS.foodType.join(" | ")} (default veg)`);
    addLine(`• discount_type: ${MENU_ENUMS.discountType.join(" | ")} (default percentage)`);
    addLine(`• stock_type: ${MENU_ENUMS.stockType.join(" | ")} (default unlimited)`);
    addLine(`• selectionType: ${MENU_ENUMS.selectionType.join(" | ")} (default single)`);
    blank();
    addLine("Variations example (one variation \"Size\" with three options)", "heading");
    addLine("food | variationName | isRequired | selectionType | min | max | optionName | additionalPrice");
    addLine("Margherita | Size | yes | single | 1 | 1 | Small | 0");
    addLine("Margherita | Size |  |  |  |  | Medium | 20");
    addLine("Margherita | Size |  |  |  |  | Large | 40");
    addLine("Variation settings (isRequired, selectionType, min, max, Arabic/French names) only need to be filled once per variation.");
    blank();
    addLine("تعليمات مختصرة", "heading");
    addLine("• اكتب الأسماء وليس الـ IDs. الأقسام (category) لازم تكون موجودة بالفعل، اختارها من القائمة.");
    addLine("• الأعمدة الإجبارية لونها برتقالي. الوقت بصيغة 24 ساعة مثل 09:00 أو 23:30.");
    addLine("• الصورة اختيارية: رابط يبدأ بـ http:// أو https:// أو اتركها فاضية.");
    addLine("• الإضافات (addons) أسماء مفصولة بفاصلة. الصفوف الموجودة بالفعل يتم تخطيها ولا تتكرر.");
    blank();
    addLine(`Available addons (${lookups.addonNames.length})`, "heading");
    if (lookups.addonNames.length === 0) addLine("This restaurant has no addons yet.");
    for (const name of lookups.addonNames) addLine(name);
}

// ----------------------------------------------------------------------------
// Entry points
// ----------------------------------------------------------------------------
/** Builds the template for a restaurant (loads its category / subcategory / addon names). */
export async function buildImportTemplate(restaurantId: string): Promise<Buffer> {
    return renderImportTemplate(await loadTemplateLookups(restaurantId));
}

/** Renders the template from already-loaded names (no database access). */
export async function renderImportTemplate(lookups: TemplateLookups): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Keeto";
    workbook.created = new Date();

    addInstructionsSheet(workbook, lookups);
    const subcategorySheet = addDataSheet(workbook, SHEET_NAMES.subcategories, SUBCATEGORY_COLUMNS);
    const foodSheet = addDataSheet(workbook, SHEET_NAMES.foods, FOOD_COLUMNS);
    const variationSheet = addDataSheet(workbook, SHEET_NAMES.variations, VARIATION_COLUMNS);
    const ranges = addLookupsSheet(workbook, lookups);

    const strictEnum = (values: readonly string[]): ListRule => ({
        formula: inlineList(values),
        strict: true,
        error: `Choose one of: ${values.join(", ")}`,
    });
    const yesNo: ListRule = { formula: inlineList(BOOLEAN_CHOICES), strict: true, error: "Choose yes or no" };
    const categoryRule: ListRule | null = ranges.categories
        ? { formula: ranges.categories, strict: true, error: "Choose an existing category from the list. Categories are not created by the import." }
        : null;
    // Not strict: a subcategory added in the Subcategories sheet of this file is not in the list yet
    const subcategoryRule: ListRule | null = ranges.subcategories
        ? { formula: ranges.subcategories, strict: false, error: "" } // error text unused when not strict
        : null;

    // Subcategories
    if (categoryRule) applyListValidation(subcategorySheet, columnNumberOf(SUBCATEGORY_COLUMNS, "category"), categoryRule);
    applyListValidation(subcategorySheet, columnNumberOf(SUBCATEGORY_COLUMNS, "priority"), strictEnum(MENU_ENUMS.subcategoryPriority));
    applyListValidation(subcategorySheet, columnNumberOf(SUBCATEGORY_COLUMNS, "status"), strictEnum(MENU_ENUMS.subcategoryStatus));

    // Foods
    if (categoryRule) applyListValidation(foodSheet, columnNumberOf(FOOD_COLUMNS, "category"), categoryRule);
    if (subcategoryRule) applyListValidation(foodSheet, columnNumberOf(FOOD_COLUMNS, "subcategory"), subcategoryRule);
    applyListValidation(foodSheet, columnNumberOf(FOOD_COLUMNS, "foodtype"), strictEnum(MENU_ENUMS.foodType));
    applyListValidation(foodSheet, columnNumberOf(FOOD_COLUMNS, "is_Halal"), yesNo);
    applyListValidation(foodSheet, columnNumberOf(FOOD_COLUMNS, "discount_type"), strictEnum(MENU_ENUMS.discountType));
    applyListValidation(foodSheet, columnNumberOf(FOOD_COLUMNS, "stock_type"), strictEnum(MENU_ENUMS.stockType));
    applyListValidation(foodSheet, columnNumberOf(FOOD_COLUMNS, "status"), strictEnum(MENU_ENUMS.foodStatus));
    applyListValidation(foodSheet, columnNumberOf(FOOD_COLUMNS, "isOutOfStock"), yesNo);

    // Variations
    applyListValidation(variationSheet, columnNumberOf(VARIATION_COLUMNS, "isRequired"), yesNo);
    applyListValidation(variationSheet, columnNumberOf(VARIATION_COLUMNS, "selectionType"), strictEnum(MENU_ENUMS.selectionType));

    // exceljs types writeBuffer() as its own ArrayBuffer-like Buffer; at runtime it is a Node Buffer
    const output = await workbook.xlsx.writeBuffer();
    return Buffer.from(output as unknown as ArrayBuffer);
}
