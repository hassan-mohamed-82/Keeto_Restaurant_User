// =============================================================================
// Sheet and column definitions shared by the template builder and the parser.
// The header text written in the template is the column key; the parser
// matches headers case-insensitively and ignores spaces/underscores.
// =============================================================================
import { MENU_ENUMS } from "../../helpers/menu.rules";

export const SHEET_NAMES = {
    instructions: "Instructions",
    subcategories: "Subcategories",
    foods: "Foods",
    variations: "Variations",
    lookups: "Lookups",
} as const;

export type DataSheetName =
    | typeof SHEET_NAMES.subcategories
    | typeof SHEET_NAMES.foods
    | typeof SHEET_NAMES.variations;

export const MAX_DATA_ROWS_PER_SHEET = 500;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** MySQL limits used for length / range checks. */
export const DB_LIMITS = {
    varchar255: 255,
    imageUrl: 500,
    textBytes: 65535,
    intMax: 2147483647,
    intMin: -2147483648,
    decimal10_2Max: 99999999.99,
} as const;

export type ColumnType =
    | "text" // single line, whitespace collapsed
    | "longText" // multi-line text (TEXT column)
    | "integer"
    | "decimal"
    | "boolean" // yes / no
    | "time" // normalized to HH:mm
    | "enum"
    | "list"; // comma-separated names

export interface ColumnSpec {
    header: string;
    type: ColumnType;
    required: boolean;
    width: number;
    note: string;
    enumValues?: readonly string[];
    maxLength?: number;
}

export type ColumnSpecs = Record<string, ColumnSpec>;

export const SUBCATEGORY_COLUMNS = {
    category: {
        header: "category", type: "text", required: true, width: 28,
        note: "Required. Name of an existing category (pick from the list). Categories are not created by the import.",
    },
    name: {
        header: "name", type: "text", required: true, width: 28, maxLength: DB_LIMITS.varchar255,
        note: "Required. Subcategory name. Must be unique inside its category.",
    },
    nameAr: { header: "nameAr", type: "text", required: false, width: 28, maxLength: DB_LIMITS.varchar255, note: "Optional. Arabic name." },
    nameFr: { header: "nameFr", type: "text", required: false, width: 28, maxLength: DB_LIMITS.varchar255, note: "Optional. French name." },
    image: {
        header: "image", type: "text", required: false, width: 34, maxLength: DB_LIMITS.imageUrl,
        note: "Optional. Image URL starting with http:// or https://. Leave empty for no image.",
    },
    priority: {
        header: "priority", type: "enum", required: false, width: 12, enumValues: MENU_ENUMS.subcategoryPriority,
        note: `Optional. ${MENU_ENUMS.subcategoryPriority.join(", ")}. Default: low.`,
    },
    order_level: {
        header: "order_level", type: "integer", required: false, width: 12,
        note: "Optional. Whole number used for sorting. Default: 0.",
    },
    status: {
        header: "status", type: "enum", required: false, width: 12, enumValues: MENU_ENUMS.subcategoryStatus,
        note: `Optional. ${MENU_ENUMS.subcategoryStatus.join(", ")}. Default: active.`,
    },
    addons: {
        header: "addons", type: "list", required: false, width: 36,
        note: "Optional. Comma-separated addon names, e.g. Extra cheese, Ketchup. See the Instructions sheet for the available names.",
    },
} as const satisfies ColumnSpecs;

export const FOOD_COLUMNS = {
    category: {
        header: "category", type: "text", required: true, width: 26,
        note: "Required. Name of an existing category (pick from the list).",
    },
    subcategory: {
        header: "subcategory", type: "text", required: false, width: 26,
        note: "Optional. A subcategory of this category that already exists or is added in the Subcategories sheet.",
    },
    name: {
        header: "name", type: "text", required: true, width: 28, maxLength: DB_LIMITS.varchar255,
        note: "Required. Food name. Must be unique inside its category.",
    },
    nameAr: { header: "nameAr", type: "text", required: false, width: 28, maxLength: DB_LIMITS.varchar255, note: "Optional. Arabic name." },
    nameFr: { header: "nameFr", type: "text", required: false, width: 28, maxLength: DB_LIMITS.varchar255, note: "Optional. French name." },
    description: { header: "description", type: "longText", required: true, width: 40, note: "Required. Description." },
    descriptionAr: { header: "descriptionAr", type: "longText", required: false, width: 40, note: "Optional. Arabic description." },
    descriptionFr: { header: "descriptionFr", type: "longText", required: false, width: 40, note: "Optional. French description." },
    image: {
        header: "image", type: "text", required: false, width: 34, maxLength: DB_LIMITS.imageUrl,
        note: "Optional. Image URL starting with http:// or https://. Leave empty for no image.",
    },
    foodtype: {
        header: "foodtype", type: "enum", required: false, width: 12, enumValues: MENU_ENUMS.foodType,
        note: `Optional. ${MENU_ENUMS.foodType.join(", ")}. Default: veg.`,
    },
    Nutrition: { header: "Nutrition", type: "longText", required: false, width: 24, note: "Optional. Nutrition information." },
    allergen_ingredients: { header: "allergen_ingredients", type: "longText", required: false, width: 24, note: "Optional. Allergen ingredients." },
    is_Halal: { header: "is_Halal", type: "boolean", required: false, width: 10, note: "Optional. yes or no. Default: no." },
    startTime: {
        header: "startTime", type: "time", required: true, width: 11,
        note: "Required. Time the food becomes available, 24-hour HH:mm (e.g. 09:00).",
    },
    endTime: {
        header: "endTime", type: "time", required: true, width: 11,
        note: "Required. Time the food stops being available, 24-hour HH:mm (e.g. 23:30).",
    },
    search_tags: {
        header: "search_tags", type: "text", required: false, width: 24, maxLength: DB_LIMITS.varchar255,
        note: "Optional. Search tags.",
    },
    price: { header: "price", type: "decimal", required: true, width: 10, note: "Required. Price greater than 0, e.g. 85 or 85.50." },
    discount_type: {
        header: "discount_type", type: "enum", required: false, width: 14, enumValues: MENU_ENUMS.discountType,
        note: `Optional. ${MENU_ENUMS.discountType.join(", ")}. Default: percentage.`,
    },
    discount_value: {
        header: "discount_value", type: "decimal", required: false, width: 14,
        note: "Optional. 0 or more; at most 100 when discount_type is percentage.",
    },
    Maximum_Purchase: {
        header: "Maximum_Purchase", type: "integer", required: false, width: 16,
        note: "Optional. Maximum quantity per order (whole number).",
    },
    stock_type: {
        header: "stock_type", type: "enum", required: false, width: 12, enumValues: MENU_ENUMS.stockType,
        note: `Optional. ${MENU_ENUMS.stockType.join(", ")}. Default: unlimited.`,
    },
    status: {
        header: "status", type: "enum", required: false, width: 10, enumValues: MENU_ENUMS.foodStatus,
        note: `Optional. ${MENU_ENUMS.foodStatus.join(", ")}. Default: active. An active food cannot be placed under an inactive subcategory.`,
    },
    points: { header: "points", type: "integer", required: false, width: 9, note: "Optional. Loyalty points (whole number). Default: 0." },
    isOutOfStock: { header: "isOutOfStock", type: "boolean", required: false, width: 12, note: "Optional. yes or no. Default: no." },
    addons: {
        header: "addons", type: "list", required: false, width: 36,
        note: "Optional. Comma-separated addon names, e.g. Extra cheese, Ketchup. See the Instructions sheet for the available names.",
    },
} as const satisfies ColumnSpecs;

export const VARIATION_COLUMNS = {
    food: {
        header: "food", type: "text", required: true, width: 28,
        note: "Required. Name of a food from the Foods sheet of this file.",
    },
    variationName: {
        header: "variationName", type: "text", required: true, width: 22, maxLength: DB_LIMITS.varchar255,
        note: "Required. Variation name, e.g. Size. Rows with the same food + variationName form one variation.",
    },
    variationNameAr: { header: "variationNameAr", type: "text", required: false, width: 22, maxLength: DB_LIMITS.varchar255, note: "Optional. Arabic variation name." },
    variationNameFr: { header: "variationNameFr", type: "text", required: false, width: 22, maxLength: DB_LIMITS.varchar255, note: "Optional. French variation name." },
    isRequired: { header: "isRequired", type: "boolean", required: false, width: 11, note: "Optional. yes or no. Default: no. Fill it once per variation." },
    selectionType: {
        header: "selectionType", type: "enum", required: false, width: 13, enumValues: MENU_ENUMS.selectionType,
        note: `Optional. ${MENU_ENUMS.selectionType.join(", ")}. Default: single.`,
    },
    min: { header: "min", type: "integer", required: false, width: 7, note: "Optional. Minimum number of options to choose." },
    max: { header: "max", type: "integer", required: false, width: 7, note: "Optional. Maximum number of options to choose." },
    optionName: {
        header: "optionName", type: "text", required: true, width: 22, maxLength: DB_LIMITS.varchar255,
        note: "Required. One option per row, e.g. Small, Medium, Large.",
    },
    optionNameAr: { header: "optionNameAr", type: "text", required: false, width: 22, maxLength: DB_LIMITS.varchar255, note: "Optional. Arabic option name." },
    optionNameFr: { header: "optionNameFr", type: "text", required: false, width: 22, maxLength: DB_LIMITS.varchar255, note: "Optional. French option name." },
    additionalPrice: { header: "additionalPrice", type: "decimal", required: false, width: 15, note: "Optional. Extra price for this option, 0 or more. Default: 0." },
} as const satisfies ColumnSpecs;

export type SubcategoryColumns = typeof SUBCATEGORY_COLUMNS;
export type FoodColumns = typeof FOOD_COLUMNS;
export type VariationColumns = typeof VARIATION_COLUMNS;

/** Header matching ignores case, spaces, underscores and other punctuation. */
export function normalizeHeader(header: string): string {
    return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Order of sheets and columns used to sort errors. */
export const SHEET_COLUMN_ORDER: Record<DataSheetName, readonly string[]> = {
    [SHEET_NAMES.subcategories]: Object.keys(SUBCATEGORY_COLUMNS),
    [SHEET_NAMES.foods]: Object.keys(FOOD_COLUMNS),
    [SHEET_NAMES.variations]: Object.keys(VARIATION_COLUMNS),
};
