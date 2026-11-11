// =============================================================================
// Orchestrates the import: parse → load lookups once → validate → insert.
// Inserts go through the same helpers as createSubcategory / createFood, in a
// single transaction (any failure rolls everything back).
// =============================================================================
import { db } from "../../models/connection";
import { insertFood, insertSubcategory } from "../../helpers/menu.insert";
import { parseWorkbook } from "./parser";
import { loadImportLookups } from "./resolver";
import { EMPTY_COUNTS, ImportPlan, SubcategoryLink, validateImport } from "./validator";

/** Parses and validates an uploaded workbook. Never writes to the database. */
export async function planImport(file: Buffer, restaurantId: string): Promise<ImportPlan> {
    const parsed = await parseWorkbook(file);
    if (parsed.fatalErrors.length > 0) {
        return { subcategories: [], foods: [], skipped: [], errors: parsed.fatalErrors, counts: { ...EMPTY_COUNTS } };
    }
    const lookups = await loadImportLookups(restaurantId);
    return validateImport(parsed, lookups);
}

export interface ImportResult {
    subcategoriesCreated: number;
    foodsCreated: number;
    variationsCreated: number;
    optionsCreated: number;
}

function subcategoryIdFor(link: SubcategoryLink | null, created: Map<string, string>): string | null {
    if (!link) return null;
    if (link.kind === "existing") return link.id;
    const id = created.get(link.key);
    if (!id) throw new Error(`Bulk import: subcategory "${link.key}" was not created before its foods`);
    return id;
}

/**
 * Inserts a validated plan in ONE transaction: subcategories first, then each
 * food with its variations and options.
 */
export async function executeImportPlan(restaurantId: string, plan: ImportPlan): Promise<ImportResult> {
    if (plan.errors.length > 0) {
        throw new Error("Bulk import: refusing to insert a plan that has validation errors");
    }

    return db.transaction(async (tx) => {
        // "categoryId|normalized subcategory name" → new subcategory id
        const createdSubcategories = new Map<string, string>();
        for (const item of plan.subcategories) {
            const id = await insertSubcategory(tx, restaurantId, item.data);
            createdSubcategories.set(item.key, id);
        }

        for (const item of plan.foods) {
            await insertFood(tx, restaurantId, {
                ...item.data,
                subcategoryid: subcategoryIdFor(item.subcategory, createdSubcategories),
            });
        }

        return {
            subcategoriesCreated: plan.subcategories.length,
            foodsCreated: plan.foods.length,
            variationsCreated: plan.counts.variations,
            optionsCreated: plan.counts.options,
        };
    });
}
