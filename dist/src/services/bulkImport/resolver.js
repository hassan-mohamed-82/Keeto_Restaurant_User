"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NameIndex = void 0;
exports.normalizeName = normalizeName;
exports.resolveName = resolveName;
exports.loadImportLookups = loadImportLookups;
exports.loadTemplateLookups = loadTemplateLookups;
// =============================================================================
// Name normalization and name → id lookups.
//
// All lookup tables are loaded once per request (no query per row) and indexed
// by the normalized `name` and `nameAr` of each record.
// =============================================================================
const drizzle_orm_1 = require("drizzle-orm");
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const foodConditions_1 = require("../../helpers/foodConditions");
// ----------------------------------------------------------------------------
// Normalization
// ----------------------------------------------------------------------------
const INVISIBLE_CHARS = /[​-‏‪-‮⁦-⁩﻿]/g;
/** Harakat, Quranic annotation marks and the superscript alef. */
const ARABIC_DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭ]/g;
const TATWEEL = /ـ/g;
const ALEF_VARIANTS = /[آأإٱ]/g; // آ أ إ ٱ
const YEH_VARIANTS = /[ىی]/g; // ى ی
const TEH_MARBUTA = /ة/g; // ة
/**
 * Normalizes a name for comparison: Unicode NFKC, invisible marks removed,
 * Arabic diacritics and tatweel removed, أ/إ/آ → ا, ى → ي, ة → ه, whitespace
 * collapsed, trimmed and lower-cased.
 */
function normalizeName(value) {
    return value
        .normalize("NFKC")
        .replace(INVISIBLE_CHARS, "")
        .replace(ARABIC_DIACRITICS, "")
        .replace(TATWEEL, "")
        .replace(ALEF_VARIANTS, "ا")
        .replace(YEH_VARIANTS, "ي")
        .replace(TEH_MARBUTA, "ه")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}
/** Records indexed by the normalized form of both `name` and `nameAr`. */
class NameIndex {
    constructor(records = []) {
        this.byKey = new Map();
        for (const record of records)
            this.add(record);
    }
    add(record) {
        const keys = new Set([record.name, record.nameAr]
            .filter((value) => typeof value === "string")
            .map(normalizeName)
            .filter((key) => key !== ""));
        for (const key of keys) {
            const list = this.byKey.get(key);
            if (!list)
                this.byKey.set(key, [record]);
            else if (!list.some((existing) => existing.id === record.id))
                list.push(record);
        }
    }
    /** All distinct records whose name or nameAr matches `value`. */
    find(value) {
        const key = normalizeName(value);
        return key === "" ? [] : this.byKey.get(key) ?? [];
    }
}
exports.NameIndex = NameIndex;
function resolveName(index, value) {
    const matches = index.find(value);
    if (matches.length === 0)
        return { status: "notFound" };
    if (matches.length > 1)
        return { status: "ambiguous", matches };
    return { status: "found", record: matches[0] };
}
/** Groups records by a key (e.g. categoryId) into one NameIndex per key. */
function indexBy(records, keyOf) {
    const grouped = new Map();
    for (const record of records) {
        const key = keyOf(record);
        let index = grouped.get(key);
        if (!index) {
            index = new NameIndex();
            grouped.set(key, index);
        }
        index.add(record);
    }
    return grouped;
}
/** Loads every lookup table once (4 queries), scoped to the restaurant where the table has a restaurant id. */
async function loadImportLookups(restaurantId) {
    const [categoryRows, subcategoryRows, addonRows, foodRows] = await Promise.all([
        connection_1.db
            .select({ id: schema_1.categories.id, name: schema_1.categories.name, nameAr: schema_1.categories.nameAr, status: schema_1.categories.status })
            .from(schema_1.categories)
            .where((0, drizzle_orm_1.eq)(schema_1.categories.isDeleted, false)),
        connection_1.db
            .select({
            id: schema_1.subcategories.id,
            name: schema_1.subcategories.name,
            nameAr: schema_1.subcategories.nameAr,
            categoryId: schema_1.subcategories.categoryId,
            status: schema_1.subcategories.status,
        })
            .from(schema_1.subcategories)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.subcategories.isDeleted, false))),
        connection_1.db
            .select({ id: schema_1.addons.id, name: schema_1.addons.name, nameAr: schema_1.addons.nameAr })
            .from(schema_1.addons)
            .where((0, drizzle_orm_1.eq)(schema_1.addons.restaurantid, restaurantId)),
        connection_1.db
            .select({ id: schema_1.food.id, name: schema_1.food.name, nameAr: schema_1.food.nameAr, categoryId: schema_1.food.categoryid })
            .from(schema_1.food)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), foodConditions_1.activeFoodCondition)),
    ]);
    return {
        categories: new NameIndex(categoryRows),
        subcategoriesByCategory: indexBy(subcategoryRows, (row) => row.categoryId),
        addons: new NameIndex(addonRows),
        foodsByCategory: indexBy(foodRows, (row) => row.categoryId),
    };
}
/** Distinct display names (name and nameAr), deduplicated by their normalized form, sorted. */
function displayNames(rows) {
    const byKey = new Map();
    for (const row of rows) {
        for (const value of [row.name, row.nameAr]) {
            if (!value)
                continue;
            const display = value.replace(/\s+/g, " ").trim();
            const key = normalizeName(display);
            if (key !== "" && !byKey.has(key))
                byKey.set(key, display);
        }
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}
async function loadTemplateLookups(restaurantId) {
    const [categoryRows, subcategoryRows, addonRows] = await Promise.all([
        connection_1.db.select({ name: schema_1.categories.name, nameAr: schema_1.categories.nameAr }).from(schema_1.categories),
        connection_1.db
            .select({ name: schema_1.subcategories.name, nameAr: schema_1.subcategories.nameAr })
            .from(schema_1.subcategories)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.subcategories.isDeleted, false))),
        connection_1.db
            .select({ name: schema_1.addons.name, nameAr: schema_1.addons.nameAr })
            .from(schema_1.addons)
            .where((0, drizzle_orm_1.eq)(schema_1.addons.restaurantid, restaurantId)),
    ]);
    return {
        categoryNames: displayNames(categoryRows),
        subcategoryNames: displayNames(subcategoryRows),
        addonNames: displayNames(addonRows),
    };
}
