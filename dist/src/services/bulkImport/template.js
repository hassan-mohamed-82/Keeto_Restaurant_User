"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEMPLATE_FILE_NAME = exports.XLSX_MIME_TYPE = void 0;
exports.buildImportTemplate = buildImportTemplate;
exports.renderImportTemplate = renderImportTemplate;
// =============================================================================
// Builds the downloadable .xlsx template (exceljs).
//
// Sheets: Instructions, Subcategories, Foods, Variations and a hidden Lookups
// sheet with this restaurant's category / subcategory / addon names, used by
// the dropdowns (Excel data validation).
// =============================================================================
const ExcelJS = __importStar(require("exceljs"));
const menu_rules_1 = require("../../helpers/menu.rules");
const columns_1 = require("./columns");
const resolver_1 = require("./resolver");
exports.XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
exports.TEMPLATE_FILE_NAME = "menu-import-template.xlsx";
const FIRST_DATA_ROW = 2;
const LAST_DATA_ROW = FIRST_DATA_ROW + columns_1.MAX_DATA_ROWS_PER_SHEET - 1;
const BOOLEAN_CHOICES = ["yes", "no"];
const COLORS = {
    header: "FF1F4E78",
    requiredHeader: "FFC55A11",
    headerText: "FFFFFFFF",
    title: "FF1F4E78",
};
/** 1 → A, 27 → AA */
function columnLetter(columnNumber) {
    let n = columnNumber;
    let letters = "";
    while (n > 0) {
        const remainder = (n - 1) % 26;
        letters = String.fromCharCode(65 + remainder) + letters;
        n = Math.floor((n - 1) / 26);
    }
    return letters;
}
function columnNumberOf(columns, key) {
    return Object.keys(columns).indexOf(key) + 1;
}
// ----------------------------------------------------------------------------
// Data sheets
// ----------------------------------------------------------------------------
function addDataSheet(workbook, name, columns) {
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
function inlineList(values) {
    return `"${values.join(",")}"`;
}
function applyListValidation(worksheet, columnNumber, rule) {
    for (let row = FIRST_DATA_ROW; row <= LAST_DATA_ROW; row++) {
        const validation = {
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
function addLookupsSheet(workbook, lookups) {
    const worksheet = workbook.addWorksheet(columns_1.SHEET_NAMES.lookups, { state: "hidden" });
    const lists = [
        ["categories", lookups.categoryNames],
        ["subcategories", lookups.subcategoryNames],
        ["addons", lookups.addonNames],
    ];
    const ranges = { categories: null, subcategories: null, addons: null };
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
            ranges[key] = `'${columns_1.SHEET_NAMES.lookups}'!$${letter}$${FIRST_DATA_ROW}:$${letter}$${FIRST_DATA_ROW + values.length - 1}`;
        }
    });
    return ranges;
}
// ----------------------------------------------------------------------------
// Instructions
// ----------------------------------------------------------------------------
function addInstructionsSheet(workbook, lookups) {
    const worksheet = workbook.addWorksheet(columns_1.SHEET_NAMES.instructions);
    worksheet.getColumn(1).width = 120;
    const addLine = (text, style = "text") => {
        const row = worksheet.addRow([text]);
        const cell = row.getCell(1);
        cell.alignment = { wrapText: true, vertical: "top" };
        if (style === "title")
            cell.font = { bold: true, size: 16, color: { argb: COLORS.title } };
        if (style === "heading")
            cell.font = { bold: true, size: 12, color: { argb: COLORS.title } };
    };
    const blank = () => {
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
    addLine("• Required columns have an orange header: Subcategories: category, name. Foods: category, name, description, price. Variations: food, variationName, optionName.");
    addLine("• Times use the 24-hour format HH:mm, e.g. 09:00 or 23:30. Excel time cells are accepted too.");
    addLine("• Images are optional. Paste an image URL starting with http:// or https://, or leave the cell empty.");
    addLine("• yes / no columns: is_Halal, isOutOfStock, allow_custom_weight, isRequired, isWeightGroup.");
    addLine("• Numbers use \".\" for decimals, e.g. 85.50.");
    addLine("• An active food cannot be placed under an inactive subcategory.");
    addLine("• Addons: type addon names separated by commas, e.g. \"Extra cheese, Ketchup\". The available names are listed below and in the hidden Lookups sheet (right-click a sheet tab → Unhide).");
    addLine(`• Limits: .xlsx files only, at most ${columns_1.MAX_UPLOAD_BYTES / (1024 * 1024)} MB and ${columns_1.MAX_DATA_ROWS_PER_SHEET} rows per sheet.`);
    blank();
    addLine("Allowed values", "heading");
    addLine(`• priority: ${menu_rules_1.MENU_ENUMS.subcategoryPriority.join(" | ")} (default low)`);
    addLine(`• status: ${menu_rules_1.MENU_ENUMS.foodStatus.join(" | ")} (default active)`);
    addLine(`• foodtype: ${menu_rules_1.MENU_ENUMS.foodType.join(" | ")} (default veg)`);
    addLine(`• discount_type: ${menu_rules_1.MENU_ENUMS.discountType.join(" | ")} (default percentage)`);
    addLine(`• stock_type: ${menu_rules_1.MENU_ENUMS.stockType.join(" | ")} (default unlimited)`);
    addLine(`• selectionType: ${menu_rules_1.MENU_ENUMS.selectionType.join(" | ")} (default single)`);
    addLine(`• priceMode: ${menu_rules_1.MENU_ENUMS.priceMode.join(" | ")} (default fixed)`);
    addLine(`• sold_by: ${menu_rules_1.MENU_ENUMS.soldBy.join(" | ")} (default unit); weight_unit: ${menu_rules_1.MENU_ENUMS.weightUnit.join(" | ")} (required for weight foods)`);
    addLine("• Weight groups: a weight food can have ONE variation with isWeightGroup = yes. Each of its options needs a weightValue (e.g. 0.25, 0.5, 1 for kg), unique in the group. The customer's weight must equal the chosen option. allow_custom_weight = no means the customer can only pick one of these weights.");
    addLine("• A fixed (amount) discount is not allowed on foods sold per gram (weight_unit = gm): use a percentage.");
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
    if (lookups.addonNames.length === 0)
        addLine("This restaurant has no addons yet.");
    for (const name of lookups.addonNames)
        addLine(name);
}
// ----------------------------------------------------------------------------
// Entry points
// ----------------------------------------------------------------------------
/** Builds the template for a restaurant (loads its category / subcategory / addon names). */
async function buildImportTemplate(restaurantId) {
    return renderImportTemplate(await (0, resolver_1.loadTemplateLookups)(restaurantId));
}
/** Renders the template from already-loaded names (no database access). */
async function renderImportTemplate(lookups) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Keeto";
    workbook.created = new Date();
    addInstructionsSheet(workbook, lookups);
    const subcategorySheet = addDataSheet(workbook, columns_1.SHEET_NAMES.subcategories, columns_1.SUBCATEGORY_COLUMNS);
    const foodSheet = addDataSheet(workbook, columns_1.SHEET_NAMES.foods, columns_1.FOOD_COLUMNS);
    const variationSheet = addDataSheet(workbook, columns_1.SHEET_NAMES.variations, columns_1.VARIATION_COLUMNS);
    const ranges = addLookupsSheet(workbook, lookups);
    const strictEnum = (values) => ({
        formula: inlineList(values),
        strict: true,
        error: `Choose one of: ${values.join(", ")}`,
    });
    const yesNo = { formula: inlineList(BOOLEAN_CHOICES), strict: true, error: "Choose yes or no" };
    const categoryRule = ranges.categories
        ? { formula: ranges.categories, strict: true, error: "Choose an existing category from the list. Categories are not created by the import." }
        : null;
    // Not strict: a subcategory added in the Subcategories sheet of this file is not in the list yet
    const subcategoryRule = ranges.subcategories
        ? { formula: ranges.subcategories, strict: false, error: "" } // error text unused when not strict
        : null;
    // Subcategories
    if (categoryRule)
        applyListValidation(subcategorySheet, columnNumberOf(columns_1.SUBCATEGORY_COLUMNS, "category"), categoryRule);
    applyListValidation(subcategorySheet, columnNumberOf(columns_1.SUBCATEGORY_COLUMNS, "priority"), strictEnum(menu_rules_1.MENU_ENUMS.subcategoryPriority));
    applyListValidation(subcategorySheet, columnNumberOf(columns_1.SUBCATEGORY_COLUMNS, "status"), strictEnum(menu_rules_1.MENU_ENUMS.subcategoryStatus));
    // Foods
    if (categoryRule)
        applyListValidation(foodSheet, columnNumberOf(columns_1.FOOD_COLUMNS, "category"), categoryRule);
    if (subcategoryRule)
        applyListValidation(foodSheet, columnNumberOf(columns_1.FOOD_COLUMNS, "subcategory"), subcategoryRule);
    applyListValidation(foodSheet, columnNumberOf(columns_1.FOOD_COLUMNS, "foodtype"), strictEnum(menu_rules_1.MENU_ENUMS.foodType));
    applyListValidation(foodSheet, columnNumberOf(columns_1.FOOD_COLUMNS, "is_Halal"), yesNo);
    applyListValidation(foodSheet, columnNumberOf(columns_1.FOOD_COLUMNS, "discount_type"), strictEnum(menu_rules_1.MENU_ENUMS.discountType));
    applyListValidation(foodSheet, columnNumberOf(columns_1.FOOD_COLUMNS, "stock_type"), strictEnum(menu_rules_1.MENU_ENUMS.stockType));
    applyListValidation(foodSheet, columnNumberOf(columns_1.FOOD_COLUMNS, "status"), strictEnum(menu_rules_1.MENU_ENUMS.foodStatus));
    applyListValidation(foodSheet, columnNumberOf(columns_1.FOOD_COLUMNS, "isOutOfStock"), yesNo);
    applyListValidation(foodSheet, columnNumberOf(columns_1.FOOD_COLUMNS, "sold_by"), strictEnum(menu_rules_1.MENU_ENUMS.soldBy));
    applyListValidation(foodSheet, columnNumberOf(columns_1.FOOD_COLUMNS, "weight_unit"), strictEnum(menu_rules_1.MENU_ENUMS.weightUnit));
    applyListValidation(foodSheet, columnNumberOf(columns_1.FOOD_COLUMNS, "allow_custom_weight"), yesNo);
    // Variations
    applyListValidation(variationSheet, columnNumberOf(columns_1.VARIATION_COLUMNS, "isRequired"), yesNo);
    applyListValidation(variationSheet, columnNumberOf(columns_1.VARIATION_COLUMNS, "selectionType"), strictEnum(menu_rules_1.MENU_ENUMS.selectionType));
    applyListValidation(variationSheet, columnNumberOf(columns_1.VARIATION_COLUMNS, "priceMode"), strictEnum(menu_rules_1.MENU_ENUMS.priceMode));
    applyListValidation(variationSheet, columnNumberOf(columns_1.VARIATION_COLUMNS, "isWeightGroup"), yesNo);
    // exceljs types writeBuffer() as its own ArrayBuffer-like Buffer; at runtime it is a Node Buffer
    const output = await workbook.xlsx.writeBuffer();
    return Buffer.from(output);
}
