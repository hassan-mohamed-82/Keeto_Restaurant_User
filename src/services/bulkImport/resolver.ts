// =============================================================================
// Name normalization and name → id lookups.
//
// All lookup tables are loaded once per request (no query per row) and indexed
// by the normalized `name` and `nameAr` of each record.
// =============================================================================
import { and, eq } from "drizzle-orm";
import { db } from "../../models/connection";
import { addons, categories, food, subcategories } from "../../models/schema";
import { activeFoodCondition } from "../../helpers/foodConditions";

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
export function normalizeName(value: string): string {
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

// ----------------------------------------------------------------------------
// Name index
// ----------------------------------------------------------------------------
export interface NamedRecord {
    id: string;
    name: string;
    nameAr: string | null;
}

/** Records indexed by the normalized form of both `name` and `nameAr`. */
export class NameIndex<T extends NamedRecord> {
    private readonly byKey = new Map<string, T[]>();

    constructor(records: Iterable<T> = []) {
        for (const record of records) this.add(record);
    }

    add(record: T): void {
        const keys = new Set(
            [record.name, record.nameAr]
                .filter((value): value is string => typeof value === "string")
                .map(normalizeName)
                .filter((key) => key !== "")
        );
        for (const key of keys) {
            const list = this.byKey.get(key);
            if (!list) this.byKey.set(key, [record]);
            else if (!list.some((existing) => existing.id === record.id)) list.push(record);
        }
    }

    /** All distinct records whose name or nameAr matches `value`. */
    find(value: string): T[] {
        const key = normalizeName(value);
        return key === "" ? [] : this.byKey.get(key) ?? [];
    }
}

export type Resolution<T> =
    | { status: "found"; record: T }
    | { status: "notFound" }
    | { status: "ambiguous"; matches: T[] };

export function resolveName<T extends NamedRecord>(index: NameIndex<T>, value: string): Resolution<T> {
    const matches = index.find(value);
    if (matches.length === 0) return { status: "notFound" };
    if (matches.length > 1) return { status: "ambiguous", matches };
    return { status: "found", record: matches[0] };
}

/** Groups records by a key (e.g. categoryId) into one NameIndex per key. */
function indexBy<T extends NamedRecord>(records: T[], keyOf: (record: T) => string): Map<string, NameIndex<T>> {
    const grouped = new Map<string, NameIndex<T>>();
    for (const record of records) {
        const key = keyOf(record);
        let index = grouped.get(key);
        if (!index) {
            index = new NameIndex<T>();
            grouped.set(key, index);
        }
        index.add(record);
    }
    return grouped;
}

// ----------------------------------------------------------------------------
// Lookups used by validation
// ----------------------------------------------------------------------------
export interface CategoryRecord extends NamedRecord {
    status: string | null;
}
export interface SubcategoryRecord extends NamedRecord {
    categoryId: string;
    status: string | null;
}
export type AddonRecord = NamedRecord;
export interface FoodRecord extends NamedRecord {
    categoryId: string;
}

export interface ImportLookups {
    /** All categories (they are global, not per restaurant). */
    categories: NameIndex<CategoryRecord>;
    /** This restaurant's subcategories, per categoryId. */
    subcategoriesByCategory: Map<string, NameIndex<SubcategoryRecord>>;
    /** This restaurant's addons. */
    addons: NameIndex<AddonRecord>;
    /** This restaurant's existing (not archived) foods, per categoryId. */
    foodsByCategory: Map<string, NameIndex<FoodRecord>>;
}

/** Loads every lookup table once (4 queries), scoped to the restaurant where the table has a restaurant id. */
export async function loadImportLookups(restaurantId: string): Promise<ImportLookups> {
    const [categoryRows, subcategoryRows, addonRows, foodRows] = await Promise.all([
        db
            .select({ id: categories.id, name: categories.name, nameAr: categories.nameAr, status: categories.status })
            .from(categories),
        db
            .select({
                id: subcategories.id,
                name: subcategories.name,
                nameAr: subcategories.nameAr,
                categoryId: subcategories.categoryId,
                status: subcategories.status,
            })
            .from(subcategories)
            .where(eq(subcategories.restaurantId, restaurantId)),
        db
            .select({ id: addons.id, name: addons.name, nameAr: addons.nameAr })
            .from(addons)
            .where(eq(addons.restaurantid, restaurantId)),
        db
            .select({ id: food.id, name: food.name, nameAr: food.nameAr, categoryId: food.categoryid })
            .from(food)
            .where(and(eq(food.restaurantid, restaurantId), activeFoodCondition)),
    ]);

    return {
        categories: new NameIndex<CategoryRecord>(categoryRows),
        subcategoriesByCategory: indexBy<SubcategoryRecord>(subcategoryRows, (row) => row.categoryId),
        addons: new NameIndex<AddonRecord>(addonRows),
        foodsByCategory: indexBy<FoodRecord>(foodRows, (row) => row.categoryId),
    };
}

// ----------------------------------------------------------------------------
// Lookups used by the template (display names only)
// ----------------------------------------------------------------------------
export interface TemplateLookups {
    categoryNames: string[];
    subcategoryNames: string[];
    addonNames: string[];
}

/** Distinct display names (name and nameAr), deduplicated by their normalized form, sorted. */
function displayNames(rows: Array<{ name: string; nameAr: string | null }>): string[] {
    const byKey = new Map<string, string>();
    for (const row of rows) {
        for (const value of [row.name, row.nameAr]) {
            if (!value) continue;
            const display = value.replace(/\s+/g, " ").trim();
            const key = normalizeName(display);
            if (key !== "" && !byKey.has(key)) byKey.set(key, display);
        }
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

export async function loadTemplateLookups(restaurantId: string): Promise<TemplateLookups> {
    const [categoryRows, subcategoryRows, addonRows] = await Promise.all([
        db.select({ name: categories.name, nameAr: categories.nameAr }).from(categories),
        db
            .select({ name: subcategories.name, nameAr: subcategories.nameAr })
            .from(subcategories)
            .where(eq(subcategories.restaurantId, restaurantId)),
        db
            .select({ name: addons.name, nameAr: addons.nameAr })
            .from(addons)
            .where(eq(addons.restaurantid, restaurantId)),
    ]);

    return {
        categoryNames: displayNames(categoryRows),
        subcategoryNames: displayNames(subcategoryRows),
        addonNames: displayNames(addonRows),
    };
}
