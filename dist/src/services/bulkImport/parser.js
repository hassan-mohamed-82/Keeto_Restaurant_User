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
exports.cleanLine = cleanLine;
exports.parseWorkbook = parseWorkbook;
// =============================================================================
// Reads an uploaded .xlsx into typed rows.
//
// Every cell is read defensively (numbers, dates, booleans, rich text,
// hyperlinks, formulas, Excel errors) and coerced according to its column
// type. Coercion problems are attached to the row (`cellErrors`); problems that
// make the rows meaningless (unreadable file, missing required headers, too
// many rows, no data) are returned as `fatalErrors`.
// =============================================================================
const ExcelJS = __importStar(require("exceljs"));
const columns_1 = require("./columns");
const EMPTY = { kind: "empty" };
/** Turns any exceljs cell value into a simple tagged value. */
function readCell(value, depth = 0) {
    if (value === null || value === undefined)
        return EMPTY;
    if (typeof value === "string")
        return value.trim() === "" ? EMPTY : { kind: "string", value };
    if (typeof value === "number") {
        return Number.isFinite(value) ? { kind: "number", value } : { kind: "error", message: "Invalid number" };
    }
    if (typeof value === "boolean")
        return { kind: "boolean", value };
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? { kind: "error", message: "Invalid date" } : { kind: "date", value };
    }
    if (typeof value === "object" && depth < 4) {
        const obj = value;
        // Excel error value, e.g. { error: "#N/A" }
        if (typeof obj.error === "string") {
            return { kind: "error", message: `The cell contains an Excel error (${obj.error})` };
        }
        // Rich text: { richText: [{ text }, ...] }
        if (Array.isArray(obj.richText)) {
            const text = obj.richText
                .map((part) => part !== null && typeof part === "object" && typeof part.text === "string"
                ? part.text
                : "")
                .join("");
            return readCell(text, depth + 1);
        }
        // Formula or shared formula: use the cached result
        if ("formula" in obj || "sharedFormula" in obj) {
            if (obj.result === undefined || obj.result === null) {
                return { kind: "error", message: "The cell has a formula without a calculated value. Paste the value instead of the formula." };
            }
            return readCell(obj.result, depth + 1);
        }
        // Hyperlink: { text, hyperlink }
        if ("hyperlink" in obj || "text" in obj) {
            const text = readCell(obj.text, depth + 1);
            if (text.kind !== "empty")
                return text;
            return typeof obj.hyperlink === "string" ? readCell(obj.hyperlink, depth + 1) : EMPTY;
        }
    }
    return { kind: "error", message: "Unsupported cell content" };
}
// ----------------------------------------------------------------------------
// Text and number helpers
// ----------------------------------------------------------------------------
/** Zero-width characters and bidi control marks often pasted together with Arabic text. */
const INVISIBLE_CHARS = /[​-‏‪-‮⁦-⁩﻿]/g;
/** Single-line text: removes invisible marks and collapses whitespace. */
function cleanLine(value) {
    return value.replace(INVISIBLE_CHARS, "").replace(/\s+/g, " ").trim();
}
/** Multi-line text: keeps line breaks, removes invisible marks. */
function cleanMultiline(value) {
    return value
        .replace(INVISIBLE_CHARS, "")
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
        .join("\n")
        .trim();
}
/** Converts Arabic-Indic and Eastern Arabic-Indic digits to ASCII digits. */
function toAsciiDigits(value) {
    return value
        .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
        .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}
/**
 * Parses a number typed as text. "." (or the Arabic decimal separator) is the
 * only decimal separator; "," is rejected because it is ambiguous.
 */
function parseNumberText(value) {
    const text = toAsciiDigits(value)
        .replace(/٫/g, ".") // Arabic decimal separator
        .replace(/٬/g, "") // Arabic thousands separator
        .replace(/\s+/g, "");
    if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text))
        return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
}
function numberToText(value) {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10)));
}
function describe(raw) {
    let text;
    switch (raw.kind) {
        case "string":
            text = cleanLine(raw.value);
            break;
        case "number":
            text = numberToText(raw.value);
            break;
        case "boolean":
            text = raw.value ? "TRUE" : "FALSE";
            break;
        case "date":
            text = raw.value.toISOString().slice(0, 10);
            break;
        default:
            text = "";
    }
    return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}
const pad2 = (n) => String(n).padStart(2, "0");
const ok = (value) => ({ ok: true, value });
const fail = (message) => ({ ok: false, message });
function coerceText(spec, raw, multiline) {
    let text;
    if (raw.kind === "string")
        text = raw.value;
    else if (raw.kind === "number")
        text = numberToText(raw.value);
    else if (raw.kind === "boolean")
        text = raw.value ? "TRUE" : "FALSE";
    else if (raw.kind === "date") {
        return fail(`Excel turned this value into a date. Format the "${spec.header}" cell as Text and type the value again.`);
    }
    else
        return ok(null);
    text = multiline ? cleanMultiline(text) : cleanLine(text);
    if (text === "")
        return ok(null);
    if (spec.maxLength !== undefined) {
        const length = [...text].length;
        if (length > spec.maxLength) {
            return fail(`"${spec.header}" is too long (${length} characters, maximum ${spec.maxLength})`);
        }
    }
    if (multiline && Buffer.byteLength(text, "utf8") > columns_1.DB_LIMITS.textBytes) {
        return fail(`"${spec.header}" is too long (maximum ${columns_1.DB_LIMITS.textBytes} bytes)`);
    }
    return ok(text);
}
function coerceNumber(raw) {
    if (raw.kind === "number")
        return raw.value;
    if (raw.kind === "string")
        return parseNumberText(raw.value);
    return null;
}
function coerceInteger(spec, raw) {
    const value = coerceNumber(raw);
    if (value === null)
        return fail(`"${spec.header}" must be a whole number (got "${describe(raw)}")`);
    const rounded = Math.round(value);
    if (Math.abs(value - rounded) > 1e-9)
        return fail(`"${spec.header}" must be a whole number (got "${describe(raw)}")`);
    if (rounded > columns_1.DB_LIMITS.intMax || rounded < columns_1.DB_LIMITS.intMin)
        return fail(`"${spec.header}" is out of range`);
    return ok(rounded === 0 ? 0 : rounded); // avoid -0
}
function coerceDecimal(spec, raw) {
    const value = coerceNumber(raw);
    if (value === null) {
        return fail(`"${spec.header}" must be a number, using "." for decimals (got "${describe(raw)}")`);
    }
    return ok(value);
}
const TRUE_WORDS = new Set(["yes", "y", "true", "1", "نعم", "صح", "صحيح", "oui", "vrai"]);
const FALSE_WORDS = new Set(["no", "n", "false", "0", "لا", "خطأ", "خطا", "non", "faux"]);
function coerceBoolean(spec, raw) {
    if (raw.kind === "boolean")
        return ok(raw.value);
    if (raw.kind === "number" && (raw.value === 0 || raw.value === 1))
        return ok(raw.value === 1);
    if (raw.kind === "string") {
        const word = cleanLine(toAsciiDigits(raw.value)).toLowerCase();
        if (TRUE_WORDS.has(word))
            return ok(true);
        if (FALSE_WORDS.has(word))
            return ok(false);
    }
    return fail(`"${spec.header}" must be yes or no (got "${describe(raw)}")`);
}
/** Minutes since midnight → "HH:mm". */
function formatMinutes(totalMinutes) {
    const minutes = ((totalMinutes % 1440) + 1440) % 1440;
    return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}
const TIME_TEXT = /^(\d{1,2})[:.](\d{2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|ص|م)?$/i;
/**
 * Accepts Excel times (day fractions or Date cells) and text such as "9:00",
 * "09:30", "21:30", "9:30 PM" or "9:30 م". Output is always 24-hour "HH:mm".
 */
function coerceTime(spec, raw) {
    const invalid = fail(`"${spec.header}" must be a time like 09:00 or 21:30 (got "${describe(raw)}")`);
    if (raw.kind === "number") {
        // Excel stores times as a fraction of a day (0.375 = 09:00); a value
        // with a whole part is a date-time, so only its fraction is used.
        if (raw.value < 0)
            return invalid;
        const fraction = raw.value - Math.floor(raw.value);
        if (raw.value >= 1 && fraction === 0)
            return invalid; // a plain number like 9 is ambiguous
        // Round to the nearest second (float noise), then drop the seconds.
        const seconds = Math.round(fraction * 86400);
        return ok(formatMinutes(Math.floor(seconds / 60)));
    }
    if (raw.kind === "date") {
        // exceljs builds dates in UTC from the Excel serial value (rounded to the millisecond)
        const ms = raw.value.getUTCHours() * 3600000 +
            raw.value.getUTCMinutes() * 60000 +
            raw.value.getUTCSeconds() * 1000 +
            raw.value.getUTCMilliseconds();
        const seconds = Math.round(ms / 1000);
        return ok(formatMinutes(Math.floor(seconds / 60)));
    }
    if (raw.kind !== "string")
        return invalid;
    const match = TIME_TEXT.exec(cleanLine(toAsciiDigits(raw.value)));
    if (!match)
        return invalid;
    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = match[3] !== undefined ? Number(match[3]) : 0;
    const meridiem = match[4]?.toLowerCase().replace(/\./g, "");
    if (minutes > 59 || seconds > 59)
        return invalid;
    if (meridiem) {
        if (hours < 1 || hours > 12)
            return invalid;
        const isPm = meridiem === "pm" || meridiem === "م";
        hours = (hours % 12) + (isPm ? 12 : 0);
    }
    else if (hours > 23) {
        return fail(`"${spec.header}" must be between 00:00 and 23:59 (use 23:59 or 00:00 for midnight)`);
    }
    return ok(formatMinutes(hours * 60 + minutes));
}
const enumToken = (value) => cleanLine(value).toLowerCase().replace(/[\s_]+/g, "-");
function coerceEnum(spec, raw) {
    const allowed = spec.enumValues ?? [];
    if (raw.kind === "string") {
        const token = enumToken(raw.value);
        const match = allowed.find((value) => enumToken(value) === token);
        if (match !== undefined)
            return ok(match);
    }
    return fail(`Invalid ${spec.header} "${describe(raw)}". Allowed values: ${allowed.join(", ")}`);
}
/** Comma-separated names (Latin "," or Arabic "،"). */
function coerceList(spec, raw) {
    let text;
    if (raw.kind === "string")
        text = raw.value;
    else if (raw.kind === "number")
        text = numberToText(raw.value);
    else
        return fail(`"${spec.header}" must be a comma-separated list of names`);
    return ok(text.split(/[,،]/).map(cleanLine).filter((item) => item !== ""));
}
function coerceCell(spec, raw) {
    if (raw.kind === "error")
        return fail(raw.message);
    if (raw.kind === "empty")
        return ok(spec.type === "list" ? [] : null);
    switch (spec.type) {
        case "text":
            return coerceText(spec, raw, false);
        case "longText":
            return coerceText(spec, raw, true);
        case "integer":
            return coerceInteger(spec, raw);
        case "decimal":
            return coerceDecimal(spec, raw);
        case "boolean":
            return coerceBoolean(spec, raw);
        case "time":
            return coerceTime(spec, raw);
        case "enum":
            return coerceEnum(spec, raw);
        case "list":
            return coerceList(spec, raw);
        default: {
            const unreachable = spec.type;
            return fail(`Unsupported column type ${String(unreachable)}`);
        }
    }
}
// ----------------------------------------------------------------------------
// File container checks (before handing the file to exceljs)
// ----------------------------------------------------------------------------
const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);
/** Total uncompressed size we are willing to unzip (guards against zip bombs). */
const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
/** Sum of the uncompressed sizes declared in the zip central directory, or null if it cannot be read. */
function declaredUncompressedSize(file) {
    const eocdMinSize = 22;
    if (file.length < eocdMinSize)
        return null;
    const searchFrom = Math.max(0, file.length - eocdMinSize - 0xffff);
    let eocd = -1;
    for (let i = file.length - eocdMinSize; i >= searchFrom; i--) {
        if (file.readUInt32LE(i) === ZIP_END_OF_CENTRAL_DIRECTORY) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0)
        return null;
    const entryCount = file.readUInt16LE(eocd + 10);
    const directoryOffset = file.readUInt32LE(eocd + 16);
    if (entryCount === 0xffff || directoryOffset === 0xffffffff)
        return null; // zip64
    let position = directoryOffset;
    let total = 0;
    for (let i = 0; i < entryCount; i++) {
        if (position + 46 > file.length || file.readUInt32LE(position) !== ZIP_CENTRAL_DIRECTORY_HEADER)
            return null;
        const uncompressed = file.readUInt32LE(position + 24);
        if (uncompressed === 0xffffffff)
            return Number.POSITIVE_INFINITY;
        total += uncompressed;
        position += 46 + file.readUInt16LE(position + 28) + file.readUInt16LE(position + 30) + file.readUInt16LE(position + 32);
    }
    return total;
}
function checkContainer(file) {
    if (file.length < 4)
        return "The uploaded file is empty or is not a valid .xlsx workbook";
    if (file.subarray(0, 4).equals(OLE_SIGNATURE)) {
        return "This is an old .xls file or a password-protected workbook. Save it as an Excel Workbook (.xlsx) without a password and upload it again";
    }
    if (file.readUInt32LE(0) !== ZIP_LOCAL_FILE_HEADER)
        return "The uploaded file is not a valid .xlsx workbook";
    const uncompressed = declaredUncompressedSize(file);
    if (uncompressed !== null && uncompressed > MAX_UNCOMPRESSED_BYTES) {
        return "The workbook is too large to process. Remove extra sheets, images or formatting and try again";
    }
    return null;
}
// ----------------------------------------------------------------------------
// Sheet reading
// ----------------------------------------------------------------------------
const fileError = (message) => ({ sheet: "File", row: null, column: null, message });
function buildRow(sheet, columns, rowNumber, rawCells) {
    const values = {};
    const cellErrors = [];
    for (const key of Object.keys(columns)) {
        const spec = columns[key];
        const coerced = coerceCell(spec, rawCells.get(key) ?? EMPTY);
        if (coerced.ok) {
            values[key] = coerced.value;
        }
        else {
            values[key] = (spec.type === "list" ? [] : null);
            cellErrors.push({ sheet, row: rowNumber, column: spec.header, message: coerced.message });
        }
    }
    return { rowNumber, values, cellErrors };
}
function readSheet(worksheet, sheet, columns, fatalErrors) {
    if (!worksheet)
        return { present: false, rows: [] };
    // Header row → column numbers (first occurrence wins)
    const headerColumns = new Map();
    worksheet.getRow(1).eachCell((cell, colNumber) => {
        const raw = readCell(cell.value);
        if (raw.kind !== "string")
            return;
        const key = (0, columns_1.normalizeHeader)(raw.value);
        if (key !== "" && !headerColumns.has(key))
            headerColumns.set(key, colNumber);
    });
    const columnNumbers = new Map();
    let headersOk = true;
    for (const key of Object.keys(columns)) {
        const spec = columns[key];
        const colNumber = headerColumns.get((0, columns_1.normalizeHeader)(spec.header));
        if (colNumber !== undefined) {
            columnNumbers.set(key, colNumber);
        }
        else if (spec.required) {
            headersOk = false;
            fatalErrors.push({ sheet, row: 1, column: spec.header, message: `Missing required column "${spec.header}" in the header row` });
        }
    }
    if (!headersOk)
        return { present: true, rows: [] };
    const rows = [];
    let dataRowCount = 0;
    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1)
            return;
        const rawCells = new Map();
        let hasData = false;
        for (const [key, colNumber] of columnNumbers) {
            const raw = readCell(row.getCell(colNumber).value);
            rawCells.set(key, raw);
            if (raw.kind !== "empty")
                hasData = true;
        }
        if (!hasData)
            return; // completely empty rows are ignored
        dataRowCount++;
        if (dataRowCount <= columns_1.MAX_DATA_ROWS_PER_SHEET)
            rows.push(buildRow(sheet, columns, rowNumber, rawCells));
    });
    if (dataRowCount > columns_1.MAX_DATA_ROWS_PER_SHEET) {
        fatalErrors.push({
            sheet,
            row: null,
            column: null,
            message: `Too many rows: ${dataRowCount} data rows found, the maximum is ${columns_1.MAX_DATA_ROWS_PER_SHEET} per sheet. Split the data into several files.`,
        });
        return { present: true, rows: [] };
    }
    return { present: true, rows };
}
// ----------------------------------------------------------------------------
// Entry point
// ----------------------------------------------------------------------------
async function parseWorkbook(file) {
    const result = {
        subcategories: { present: false, rows: [] },
        foods: { present: false, rows: [] },
        variations: { present: false, rows: [] },
        fatalErrors: [],
    };
    const containerProblem = checkContainer(file);
    if (containerProblem) {
        result.fatalErrors.push(fileError(containerProblem));
        return result;
    }
    const workbook = new ExcelJS.Workbook();
    try {
        await workbook.xlsx.load(file);
    }
    catch {
        result.fatalErrors.push(fileError("The file could not be read as an Excel workbook (.xlsx). Download a new template and try again"));
        return result;
    }
    const findSheet = (name) => workbook.worksheets.find((ws) => (0, columns_1.normalizeHeader)(ws.name) === (0, columns_1.normalizeHeader)(name));
    result.subcategories = readSheet(findSheet(columns_1.SHEET_NAMES.subcategories), columns_1.SHEET_NAMES.subcategories, columns_1.SUBCATEGORY_COLUMNS, result.fatalErrors);
    result.foods = readSheet(findSheet(columns_1.SHEET_NAMES.foods), columns_1.SHEET_NAMES.foods, columns_1.FOOD_COLUMNS, result.fatalErrors);
    result.variations = readSheet(findSheet(columns_1.SHEET_NAMES.variations), columns_1.SHEET_NAMES.variations, columns_1.VARIATION_COLUMNS, result.fatalErrors);
    const anySheet = result.subcategories.present || result.foods.present || result.variations.present;
    const rowCount = result.subcategories.rows.length + result.foods.rows.length + result.variations.rows.length;
    if (!anySheet) {
        result.fatalErrors.push(fileError("No Subcategories, Foods or Variations sheet was found. Please use the import template"));
    }
    else if (result.fatalErrors.length === 0 && rowCount === 0) {
        result.fatalErrors.push(fileError("The file has no data rows. Fill the Subcategories, Foods and/or Variations sheets"));
    }
    return result;
}
