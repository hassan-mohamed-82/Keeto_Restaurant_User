"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMPTY_FOOD_IMAGE = exports.EMPTY_COUNTS = void 0;
exports.sortErrors = sortErrors;
exports.validateImport = validateImport;
// =============================================================================
// Business validation for the bulk import.
//
// Takes the typed rows from the parser and the lookups loaded once by the
// resolver, applies the same rules as createSubcategory / createFood (shared
// through helpers/menu.rules.ts) and produces an ImportPlan: the rows to
// insert, the rows skipped because they already exist, and ALL errors.
// Pure function: no database access.
// =============================================================================
const weightPricing_helper_1 = require("../../helpers/weightPricing.helper");
const menu_rules_1 = require("../../helpers/menu.rules");
const columns_1 = require("./columns");
const resolver_1 = require("./resolver");
exports.EMPTY_COUNTS = { subcategories: 0, foods: 0, variations: 0, options: 0 };
/** `food.image` is NOT NULL in the schema, so foods imported without an image store an empty string. */
exports.EMPTY_FOOD_IMAGE = "";
// ----------------------------------------------------------------------------
// Required columns, derived from the shared rules of the create endpoints
// ----------------------------------------------------------------------------
const SUBCATEGORY_FIELD_COLUMN = {
    name: "name",
    categoryId: "category",
};
const FOOD_FIELD_COLUMN = {
    name: "name",
    description: "description",
    image: "image",
    categoryid: "category",
    price: "price",
};
const SUBCATEGORY_REQUIRED_COLUMNS = menu_rules_1.SUBCATEGORY_REQUIRED_FIELDS.map((field) => SUBCATEGORY_FIELD_COLUMN[field]);
/** Same required fields as createFood, except `image`, which is optional in the import. */
const FOOD_REQUIRED_COLUMNS = menu_rules_1.FOOD_REQUIRED_FIELDS.filter((field) => field !== "image").map((field) => FOOD_FIELD_COLUMN[field]);
const VARIATION_REQUIRED_COLUMNS = Object.keys(columns_1.VARIATION_COLUMNS).filter((key) => columns_1.VARIATION_COLUMNS[key].required);
// ----------------------------------------------------------------------------
// Small helpers
// ----------------------------------------------------------------------------
const IMAGE_URL_MESSAGE = 'Image must be a URL starting with "http://" or "https://" (or leave it empty)';
const isHttpUrl = (value) => /^https?:\/\/\S+$/i.test(value);
/** Rounds to 2 decimals the way MySQL DECIMAL(10,2) does (half away from zero on the decimal value). */
function roundTo2(value) {
    const sign = value < 0 ? -1 : 1;
    return sign * Number(`${Math.round(Number(`${Math.abs(value)}e2`))}e-2`);
}
const toDecimalString = (value) => roundTo2(value).toFixed(2);
const isEmpty = (value) => value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
function createRowContext(sheet, row) {
    return {
        sheet,
        rowNumber: row.rowNumber,
        errors: [...row.cellErrors],
        invalidColumns: new Set(row.cellErrors.map((error) => error.column ?? "")),
    };
}
function addError(ctx, column, message) {
    ctx.errors.push({ sheet: ctx.sheet, row: ctx.rowNumber, column, message });
    ctx.invalidColumns.add(column);
}
function requireColumns(ctx, row, columns) {
    for (const column of columns) {
        if (isEmpty(row.values[column]) && !ctx.invalidColumns.has(column)) {
            addError(ctx, column, `"${column}" is required`);
        }
    }
}
const SHEET_ORDER = {
    File: 0,
    [columns_1.SHEET_NAMES.subcategories]: 1,
    [columns_1.SHEET_NAMES.foods]: 2,
    [columns_1.SHEET_NAMES.variations]: 3,
};
function columnPosition(error) {
    if (error.sheet === "File" || error.column === null)
        return -1;
    const position = columns_1.SHEET_COLUMN_ORDER[error.sheet].indexOf(error.column);
    return position === -1 ? Number.MAX_SAFE_INTEGER : position;
}
/** Sheet order, then row, then column order (stable for equal keys). */
function sortErrors(errors) {
    return [...errors].sort((a, b) => SHEET_ORDER[a.sheet] - SHEET_ORDER[b.sheet] ||
        (a.row ?? 0) - (b.row ?? 0) ||
        columnPosition(a) - columnPosition(b));
}
// ----------------------------------------------------------------------------
// Validator
// ----------------------------------------------------------------------------
class ImportValidator {
    constructor(lookups) {
        this.lookups = lookups;
        this.errors = [];
        this.skipped = [];
        this.plannedSubcategories = [];
        this.plannedFoods = [];
        /** Subcategories defined in this file, per categoryId (looked up by name and nameAr). */
        this.fileSubcategories = new Map();
        /** First row of each "category|name" in the Subcategories sheet. */
        this.subcategoryRowsByKey = new Map();
        /** Foods of this file (looked up by name and nameAr from the Variations sheet). */
        this.fileFoods = new resolver_1.NameIndex();
        /** First row of each "category|name" in the Foods sheet. */
        this.foodRowsByKey = new Map();
    }
    run(parsed) {
        for (const row of parsed.subcategories.rows)
            this.validateSubcategory(row);
        for (const row of parsed.foods.rows)
            this.validateFood(row);
        this.validateVariations(parsed.variations.rows);
        const variations = this.plannedFoods.reduce((sum, item) => sum + item.data.variations.length, 0);
        const options = this.plannedFoods.reduce((sum, item) => sum + item.data.variations.reduce((n, v) => n + (v.options?.length ?? 0), 0), 0);
        return {
            subcategories: this.plannedSubcategories,
            foods: this.plannedFoods,
            skipped: this.skipped,
            errors: sortErrors(this.errors),
            counts: {
                subcategories: this.plannedSubcategories.length,
                foods: this.plannedFoods.length,
                variations,
                options,
            },
        };
    }
    // ------------------------------------------------------------------ shared
    resolveCategory(ctx, value) {
        if (value === null)
            return null;
        const result = (0, resolver_1.resolveName)(this.lookups.categories, value);
        if (result.status === "found")
            return result.record;
        if (result.status === "notFound") {
            addError(ctx, "category", `Category not found: "${value}"`);
        }
        else {
            addError(ctx, "category", `Ambiguous category name: "${value}" matches ${result.matches.length} categories`);
        }
        return null;
    }
    /** Resolves addon names within this restaurant; returns unique ids in input order. */
    resolveAddons(ctx, names) {
        const ids = [];
        const unknown = [];
        const ambiguous = [];
        for (const name of names) {
            const result = (0, resolver_1.resolveName)(this.lookups.addons, name);
            if (result.status === "found") {
                if (!ids.includes(result.record.id))
                    ids.push(result.record.id);
            }
            else if (result.status === "notFound") {
                unknown.push(name);
            }
            else {
                ambiguous.push(name);
            }
        }
        if (unknown.length > 0) {
            addError(ctx, "addons", `Unknown addon(s) for this restaurant: ${unknown.join(", ")}`);
        }
        if (ambiguous.length > 0) {
            addError(ctx, "addons", `Ambiguous addon name(s), several addons share them: ${ambiguous.join(", ")}`);
        }
        return ids;
    }
    finishRow(ctx) {
        this.errors.push(...ctx.errors);
    }
    duplicateKey(category, categoryText, name) {
        const categoryPart = category ? category.id : `?${(0, resolver_1.normalizeName)(categoryText ?? "")}`;
        return `${categoryPart}|${(0, resolver_1.normalizeName)(name)}`;
    }
    // ---------------------------------------------------------- Subcategories
    validateSubcategory(row) {
        const sheet = columns_1.SHEET_NAMES.subcategories;
        const v = row.values;
        const ctx = createRowContext(sheet, row);
        requireColumns(ctx, row, SUBCATEGORY_REQUIRED_COLUMNS);
        const category = this.resolveCategory(ctx, v.category);
        // Already exists for this restaurant + category → skip (not an error)
        if (category && v.name !== null) {
            const existing = this.lookups.subcategoriesByCategory.get(category.id)?.find(v.name) ?? [];
            if (existing.length > 0) {
                this.skipped.push({
                    sheet,
                    row: row.rowNumber,
                    name: v.name,
                    reason: `Subcategory already exists in category "${category.name}"`,
                });
                return;
            }
        }
        // Duplicate inside the file (same category + name)
        let isFirstOccurrence = false;
        if (v.name !== null) {
            const dupKey = this.duplicateKey(category, v.category, v.name);
            const firstRow = this.subcategoryRowsByKey.get(dupKey);
            if (firstRow !== undefined) {
                addError(ctx, "name", `Duplicate subcategory "${v.name}" in the same category (first on row ${firstRow})`);
            }
            else {
                this.subcategoryRowsByKey.set(dupKey, row.rowNumber);
                isFirstOccurrence = true;
            }
        }
        if (v.image !== null && !isHttpUrl(v.image))
            addError(ctx, "image", IMAGE_URL_MESSAGE);
        const addonIds = this.resolveAddons(ctx, v.addons);
        if (category && v.name !== null) {
            const key = `${category.id}|${(0, resolver_1.normalizeName)(v.name)}`;
            // Make it findable from the Foods sheet even if the row has other
            // errors, so those foods are not reported a second time.
            if (isFirstOccurrence) {
                let index = this.fileSubcategories.get(category.id);
                if (!index) {
                    index = new resolver_1.NameIndex();
                    this.fileSubcategories.set(category.id, index);
                }
                index.add({ id: key, key, name: v.name, nameAr: v.nameAr, status: v.status ?? menu_rules_1.SUBCATEGORY_DEFAULTS.status });
            }
            if (ctx.errors.length === 0) {
                this.plannedSubcategories.push({
                    rowNumber: row.rowNumber,
                    key,
                    data: {
                        name: v.name,
                        categoryId: category.id,
                        nameAr: v.nameAr ?? undefined,
                        nameFr: v.nameFr ?? undefined,
                        image: v.image ?? undefined, // empty → NULL
                        addonsIds: addonIds,
                        priority: v.priority ?? undefined,
                        status: v.status ?? undefined,
                        orderLevel: v.order_level ?? undefined,
                    },
                });
            }
        }
        this.finishRow(ctx);
    }
    // ------------------------------------------------------------------ Foods
    resolveFoodSubcategory(ctx, category, value) {
        const fromDb = this.lookups.subcategoriesByCategory.get(category.id)?.find(value) ?? [];
        const fromFile = this.fileSubcategories.get(category.id)?.find(value) ?? [];
        const total = fromDb.length + fromFile.length;
        if (total === 0) {
            addError(ctx, "subcategory", `Subcategory not found: "${value}" in category "${category.name}"`);
            return null;
        }
        if (total > 1) {
            addError(ctx, "subcategory", `Ambiguous subcategory name: "${value}" matches ${total} subcategories in category "${category.name}"`);
            return null;
        }
        if (fromDb.length === 1)
            return { link: { kind: "existing", id: fromDb[0].id }, status: fromDb[0].status };
        return { link: { kind: "new", key: fromFile[0].key }, status: fromFile[0].status };
    }
    validateFood(row) {
        const sheet = columns_1.SHEET_NAMES.foods;
        const v = row.values;
        const ctx = createRowContext(sheet, row);
        requireColumns(ctx, row, FOOD_REQUIRED_COLUMNS);
        const category = this.resolveCategory(ctx, v.category);
        const fileFood = {
            id: `row:${row.rowNumber}`,
            name: v.name ?? "",
            nameAr: v.nameAr,
            rowNumber: row.rowNumber,
            skipped: false,
            planned: null,
        };
        // Only the first row of each category + name can be referenced from the
        // Variations sheet, so a duplicate row does not make the link ambiguous.
        let firstRowOfDuplicate;
        if (v.name !== null) {
            const dupKey = this.duplicateKey(category, v.category, v.name);
            firstRowOfDuplicate = this.foodRowsByKey.get(dupKey);
            if (firstRowOfDuplicate === undefined) {
                this.foodRowsByKey.set(dupKey, row.rowNumber);
                this.fileFoods.add(fileFood);
            }
        }
        // Already exists for this restaurant + category → skip (not an error)
        if (category && v.name !== null) {
            const existing = this.lookups.foodsByCategory.get(category.id)?.find(v.name) ?? [];
            if (existing.length > 0) {
                fileFood.skipped = true;
                this.skipped.push({
                    sheet,
                    row: row.rowNumber,
                    name: v.name,
                    reason: `Food already exists in category "${category.name}"`,
                });
                return;
            }
        }
        // Duplicate inside the file (same category + name)
        if (firstRowOfDuplicate !== undefined && v.name !== null) {
            addError(ctx, "name", `Duplicate food "${v.name}" in the same category (first on row ${firstRowOfDuplicate})`);
        }
        // Subcategory (existing one, or one created by this file)
        let subcategory = null;
        if (category && v.subcategory !== null) {
            subcategory = this.resolveFoodSubcategory(ctx, category, v.subcategory);
        }
        if (subcategory && (0, menu_rules_1.blocksActiveFoodUnderInactiveSubcategory)(v.status, subcategory.status)) {
            addError(ctx, "status", menu_rules_1.MENU_MESSAGES.activeFoodUnderInactiveSubcategory);
        }
        // Numbers
        if (v.price !== null) {
            if (v.price <= 0)
                addError(ctx, "price", '"price" must be greater than 0');
            else if (v.price > columns_1.DB_LIMITS.decimal10_2Max)
                addError(ctx, "price", `"price" is too large (maximum ${columns_1.DB_LIMITS.decimal10_2Max})`);
        }
        if (v.discount_value !== null) {
            const discountType = v.discount_type ?? menu_rules_1.FOOD_DEFAULTS.discountType;
            if (v.discount_value < 0)
                addError(ctx, "discount_value", '"discount_value" cannot be negative');
            else if (v.discount_value > columns_1.DB_LIMITS.decimal10_2Max)
                addError(ctx, "discount_value", `"discount_value" is too large (maximum ${columns_1.DB_LIMITS.decimal10_2Max})`);
            else if (discountType === "percentage" && v.discount_value > 100) {
                addError(ctx, "discount_value", '"discount_value" cannot be more than 100 when discount_type is percentage');
            }
        }
        if (v.Maximum_Purchase !== null && v.Maximum_Purchase < 0)
            addError(ctx, "Maximum_Purchase", '"Maximum_Purchase" cannot be negative');
        if (v.points !== null && v.points < 0)
            addError(ctx, "points", '"points" cannot be negative');
        if (v.image !== null && !isHttpUrl(v.image))
            addError(ctx, "image", IMAGE_URL_MESSAGE);
        const addonIds = this.resolveAddons(ctx, v.addons);
        // Weight selling cross-validation
        const soldBy = v.sold_by;
        const weightUnit = v.weight_unit;
        if (soldBy === "weight" && !weightUnit) {
            addError(ctx, "weight_unit", '"weight_unit" is required when sold_by is "weight"');
        }
        if (soldBy !== "weight" && weightUnit) {
            addError(ctx, "weight_unit", '"weight_unit" must be empty when sold_by is "unit"');
        }
        const allowCustomWeight = v.allow_custom_weight;
        if ((0, weightPricing_helper_1.isFixedDiscountOnGramFood)({ soldBy, weightUnit, discountType: v.discount_type ?? menu_rules_1.FOOD_DEFAULTS.discountType, discountValue: v.discount_value })) {
            addError(ctx, "discount_type", weightPricing_helper_1.FIXED_DISCOUNT_ON_GRAM_MESSAGE);
        }
        if (ctx.errors.length === 0 &&
            category &&
            v.name !== null &&
            v.description !== null &&
            v.price !== null) {
            const planned = {
                rowNumber: row.rowNumber,
                subcategory: subcategory ? subcategory.link : null,
                data: {
                    name: v.name,
                    nameAr: v.nameAr ?? undefined, // undefined → column default ''
                    nameFr: v.nameFr ?? undefined,
                    description: v.description,
                    descriptionAr: v.descriptionAr ?? undefined,
                    descriptionFr: v.descriptionFr ?? undefined,
                    image: v.image ?? exports.EMPTY_FOOD_IMAGE,
                    categoryid: category.id,
                    foodtype: v.foodtype ?? undefined,
                    Nutrition: v.Nutrition,
                    allergen_ingredients: v.allergen_ingredients,
                    is_Halal: v.is_Halal,
                    addonsIds: addonIds,
                    startTime: v.startTime,
                    endTime: v.endTime,
                    search_tags: v.search_tags,
                    price: toDecimalString(v.price),
                    discount_type: v.discount_type ?? undefined,
                    // createFood stores a 0 discount as NULL (`discount_value || null`)
                    discount_value: v.discount_value !== null && v.discount_value > 0 ? toDecimalString(v.discount_value) : null,
                    Maximum_Purchase: v.Maximum_Purchase,
                    stock_type: v.stock_type ?? undefined,
                    status: v.status ?? undefined,
                    isOutOfStock: v.isOutOfStock,
                    points: v.points,
                    sold_by: (soldBy === "weight" ? "weight" : "unit"),
                    weight_unit: (soldBy === "weight" ? weightUnit : null),
                    allow_custom_weight: soldBy === "weight" ? (allowCustomWeight ?? null) : false,
                    variations: [],
                },
            };
            this.plannedFoods.push(planned);
            fileFood.planned = planned;
        }
        this.finishRow(ctx);
    }
    // ------------------------------------------------------------- Variations
    mergeGroupField(ctx, group, slot, column, value) {
        if (value === null)
            return;
        const existing = group.fields[slot];
        if (existing === undefined) {
            group.fields[slot] = { value, row: ctx.rowNumber };
            return;
        }
        if (existing.value !== value) {
            addError(ctx, column, `Conflicting "${column}" for variation "${group.name}": row ${existing.row} has "${String(existing.value)}"`);
        }
    }
    validateVariations(rows) {
        const sheet = columns_1.SHEET_NAMES.variations;
        const groups = new Map();
        for (const row of rows) {
            const v = row.values;
            const ctx = createRowContext(sheet, row);
            requireColumns(ctx, row, VARIATION_REQUIRED_COLUMNS);
            if (v.food === null) {
                this.finishRow(ctx);
                continue;
            }
            // Link to a row of the Foods sheet
            const matches = this.fileFoods.find(v.food);
            if (matches.length !== 1) {
                addError(ctx, "food", matches.length === 0
                    ? `Food not found in the Foods sheet: "${v.food}"`
                    : `Ambiguous food name: "${v.food}" matches Foods rows ${matches.map((m) => m.rowNumber).join(", ")}`);
                this.finishRow(ctx);
                continue;
            }
            const target = matches[0];
            if (target.skipped) {
                this.skipped.push({
                    sheet,
                    row: row.rowNumber,
                    name: [v.food, v.variationName, v.optionName].filter((part) => part !== null).join(" / "),
                    reason: `Food "${target.name}" already exists, so its variations were not imported`,
                });
                continue;
            }
            if (v.variationName === null || v.optionName === null) {
                this.finishRow(ctx);
                continue;
            }
            // Rows with the same food + variationName form one variation
            const groupKey = `${target.rowNumber}|${(0, resolver_1.normalizeName)(v.variationName)}`;
            let group = groups.get(groupKey);
            if (!group) {
                group = {
                    food: target,
                    name: v.variationName,
                    firstRow: row.rowNumber,
                    fields: {},
                    options: [],
                    optionRows: new Map(),
                    hasErrors: false,
                };
                groups.set(groupKey, group);
            }
            this.mergeGroupField(ctx, group, "nameAr", "variationNameAr", v.variationNameAr);
            this.mergeGroupField(ctx, group, "nameFr", "variationNameFr", v.variationNameFr);
            this.mergeGroupField(ctx, group, "isRequired", "isRequired", v.isRequired);
            this.mergeGroupField(ctx, group, "selectionType", "selectionType", v.selectionType);
            this.mergeGroupField(ctx, group, "min", "min", v.min);
            this.mergeGroupField(ctx, group, "max", "max", v.max);
            this.mergeGroupField(ctx, group, "isWeightGroup", "isWeightGroup", v.isWeightGroup);
            // The option on this row
            const optionKey = (0, resolver_1.normalizeName)(v.optionName);
            const firstOptionRow = group.optionRows.get(optionKey);
            if (firstOptionRow !== undefined) {
                addError(ctx, "optionName", `Duplicate option "${v.optionName}" in variation "${group.name}" (first on row ${firstOptionRow})`);
            }
            else {
                group.optionRows.set(optionKey, row.rowNumber);
            }
            const additionalPrice = v.additionalPrice ?? 0;
            if (additionalPrice < 0)
                addError(ctx, "additionalPrice", '"additionalPrice" cannot be negative');
            else if (additionalPrice > columns_1.DB_LIMITS.decimal10_2Max)
                addError(ctx, "additionalPrice", '"additionalPrice" is too large');
            const priceMode = v.priceMode ?? "fixed";
            if (priceMode === "per_weight" && target.planned?.data.sold_by !== "weight") {
                addError(ctx, "priceMode", '"per_weight" priceMode is only allowed for foods sold by weight');
            }
            const weightValue = v.weightValue;
            if (weightValue !== null && (0, weightPricing_helper_1.toThousandths)(weightValue) === null) {
                addError(ctx, "weightValue", '"weightValue" must be greater than 0 with at most 3 decimals');
            }
            if (ctx.errors.length > 0) {
                group.hasErrors = true;
            }
            else {
                group.options.push({
                    optionName: v.optionName,
                    optionNameAr: v.optionNameAr ?? undefined, // undefined → column default ''
                    optionNameFr: v.optionNameFr ?? undefined,
                    additionalPrice: roundTo2(additionalPrice),
                    priceMode,
                    weightValue,
                });
            }
            this.finishRow(ctx);
        }
        // Variation-level checks, then attach to the planned food
        for (const group of groups.values()) {
            const { min, max } = group.fields;
            const groupErrors = [];
            const groupError = (row, column, message) => {
                groupErrors.push({ sheet, row, column, message });
            };
            if (min && min.value < 0)
                groupError(min.row, "min", '"min" cannot be negative');
            if (max && max.value < 0)
                groupError(max.row, "max", '"max" cannot be negative');
            if (min && max && min.value > max.value) {
                groupError(max.row, "max", `"max" (${max.value}) cannot be less than "min" (${min.value}) for variation "${group.name}"`);
            }
            if (min && min.value > group.optionRows.size) {
                groupError(min.row, "min", `"min" (${min.value}) is more than the number of options (${group.optionRows.size}) of variation "${group.name}"`);
            }
            this.errors.push(...groupErrors);
            if (group.hasErrors || groupErrors.length > 0)
                continue;
            const plannedFood = group.food.planned;
            if (!plannedFood)
                continue; // the food row itself has errors (already reported)
            plannedFood.data.variations.push({
                name: group.name,
                nameAr: group.fields.nameAr?.value,
                nameFr: group.fields.nameFr?.value,
                isRequired: group.fields.isRequired?.value,
                selectionType: group.fields.selectionType?.value,
                min: min?.value,
                max: max?.value,
                isWeightGroup: group.fields.isWeightGroup?.value ?? false,
                options: group.options,
            });
        }
        // Food-level weight-group rules, once all variations are attached (same check as insertFood):
        // one weight group, only on weight foods, single-select, weightValue > 0 and unique,
        // no weightValue on normal variations, allow_custom_weight = no needs a weight group.
        const foodSheet = columns_1.SHEET_NAMES.foods;
        for (const planned of this.plannedFoods) {
            try {
                (0, weightPricing_helper_1.validateWeightGroupConfig)({
                    soldBy: planned.data.sold_by,
                    weightUnit: planned.data.weight_unit,
                    allowCustomWeight: planned.data.allow_custom_weight,
                    variations: planned.data.variations,
                });
            }
            catch (err) {
                this.errors.push({ sheet: foodSheet, row: planned.rowNumber, column: "allow_custom_weight", message: err?.message || "Invalid weight group setup" });
            }
        }
    }
}
/** Validates the parsed workbook against the lookups. No database access. */
function validateImport(parsed, lookups) {
    return new ImportValidator(lookups).run(parsed);
}
