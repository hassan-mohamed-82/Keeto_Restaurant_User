/**
 * Smoke test for the bulk menu import with the real exceljs. No database is used.
 *
 *   npx tsx test/bulkImport.smoke.ts
 *
 * Builds the template, fills it like a user would (typed times, Excel time
 * cells, hyperlink and rich-text cells, an Arabic name), saves it, then parses
 * and validates it against in-memory lookups.
 */
import * as ExcelJS from "exceljs";
import { renderImportTemplate } from "../src/services/bulkImport/template";
import { parseWorkbook } from "../src/services/bulkImport/parser";
import { validateImport } from "../src/services/bulkImport/validator";
import {
    AddonRecord,
    CategoryRecord,
    FoodRecord,
    ImportLookups,
    NameIndex,
    SubcategoryRecord,
} from "../src/services/bulkImport/resolver";

type XlsxLoadInput = Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0];

let failures = 0;
function check(condition: boolean, label: string, detail?: unknown): void {
    if (condition) {
        console.log(`ok    ${label}`);
    } else {
        failures++;
        console.error(`FAIL  ${label}`, detail ?? "");
    }
}

function sheet(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
    const worksheet = workbook.worksheets.find((ws) => ws.name === name);
    if (!worksheet) throw new Error(`Sheet ${name} not found`);
    return worksheet;
}

function headerMap(worksheet: ExcelJS.Worksheet): Map<string, number> {
    const map = new Map<string, number>();
    worksheet.getRow(1).eachCell((cell, colNumber) => map.set(String(cell.value), colNumber));
    return map;
}

function fill(worksheet: ExcelJS.Worksheet, rowNumber: number, values: Record<string, ExcelJS.CellValue>): void {
    const headers = headerMap(worksheet);
    for (const [column, value] of Object.entries(values)) {
        const colNumber = headers.get(column);
        if (!colNumber) throw new Error(`Column ${column} not found in ${worksheet.name}`);
        worksheet.getCell(rowNumber, colNumber).value = value;
    }
}

function lookups(): ImportLookups {
    const subcategories = new NameIndex<SubcategoryRecord>([
        { id: "sub-classic", name: "Classic", nameAr: "كلاسيك", categoryId: "cat-pizza", status: "active" },
    ]);
    return {
        categories: new NameIndex<CategoryRecord>([{ id: "cat-pizza", name: "Pizza", nameAr: "بيتزا", status: "active" }]),
        subcategoriesByCategory: new Map([["cat-pizza", subcategories]]),
        addons: new NameIndex<AddonRecord>([{ id: "addon-ketchup", name: "Ketchup", nameAr: "كاتشب" }]),
        foodsByCategory: new Map([["cat-pizza", new NameIndex<FoodRecord>([{ id: "food-1", name: "Margherita", nameAr: "", categoryId: "cat-pizza" }])]]),
    };
}

async function main(): Promise<void> {
    // 1. Template
    const template = await renderImportTemplate({
        categoryNames: ["Pizza", "بيتزا"],
        subcategoryNames: ["Classic"],
        addonNames: ["Ketchup"],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(template as unknown as XlsxLoadInput);
    check(
        workbook.worksheets.map((ws) => ws.name).join(",") === "Instructions,Subcategories,Foods,Variations,Lookups",
        "template has the expected sheets"
    );
    check(sheet(workbook, "Lookups").state === "hidden", "Lookups sheet is hidden");
    const foods = sheet(workbook, "Foods");
    const categoryColumn = headerMap(foods).get("category") ?? 0;
    check(foods.getCell(2, categoryColumn).dataValidation?.type === "list", "category column has a dropdown");

    // 2. Fill it in
    fill(sheet(workbook, "Subcategories"), 2, { category: "بيتزا", name: "Specials", priority: "high", addons: "ketchup" });
    fill(foods, 2, {
        category: "Pizza",
        subcategory: "Specials",
        name: { richText: [{ text: "Pepper" }, { text: "oni" }] },
        nameAr: "بيبروني",
        description: "Spicy",
        image: { text: "https://cdn.example.com/pepperoni.png", hyperlink: "https://cdn.example.com/pepperoni.png" },
        startTime: "9:00",
        endTime: "11:30 PM",
        price: 120.5,
        is_Halal: "yes",
        addons: "Ketchup",
    });
    fill(foods, 3, {
        category: "Pizza",
        subcategory: "كلاسيك",
        name: "Veggie",
        description: "Green",
        startTime: 0.375, // an Excel time cell (09:00)
        endTime: 0.9375, // 22:30
        price: "85",
    });
    foods.getCell(3, headerMap(foods).get("startTime") ?? 0).numFmt = "hh:mm";
    foods.getCell(3, headerMap(foods).get("endTime") ?? 0).numFmt = "hh:mm";
    fill(foods, 4, { category: "Pizza", name: "margherita", description: "Already exists", startTime: "10:00", endTime: "22:00", price: 50 });
    const variations = sheet(workbook, "Variations");
    fill(variations, 2, { food: "بيبروني", variationName: "Size", isRequired: "yes", min: 1, max: 1, optionName: "Small" });
    fill(variations, 3, { food: "Pepperoni", variationName: "Size", optionName: "Large", additionalPrice: 40 });

    const filled = await workbook.xlsx.writeBuffer();

    // 3. Parse + validate
    const parsed = await parseWorkbook(Buffer.from(filled as unknown as ArrayBuffer));
    check(parsed.fatalErrors.length === 0, "no fatal errors", parsed.fatalErrors);
    const plan = validateImport(parsed, lookups());
    check(plan.errors.length === 0, "no validation errors", plan.errors);
    check(
        JSON.stringify(plan.counts) === JSON.stringify({ subcategories: 1, foods: 2, variations: 1, options: 2 }),
        "counts: 1 subcategory, 2 foods, 1 variation, 2 options",
        plan.counts
    );
    check(plan.skipped.length === 1 && plan.skipped[0].row === 4, "existing food skipped", plan.skipped);

    const [pepperoni, veggie] = plan.foods;
    check(pepperoni?.data.name === "Pepperoni", "rich text name", pepperoni?.data.name);
    check(pepperoni?.data.image === "https://cdn.example.com/pepperoni.png", "hyperlink image", pepperoni?.data.image);
    check(pepperoni?.data.startTime === "09:00" && pepperoni?.data.endTime === "23:30", "typed times", pepperoni?.data);
    check(pepperoni?.data.price === "120.50", "price as decimal string", pepperoni?.data.price);
    check(pepperoni?.subcategory?.kind === "new", "subcategory from the same file");
    check(veggie?.data.startTime === "09:00" && veggie?.data.endTime === "22:30", "Excel time cells", veggie?.data);
    check(veggie?.data.image === "", "empty image stored as empty string");
    check(veggie?.subcategory?.kind === "existing", "existing subcategory matched by Arabic name");

    if (failures > 0) {
        console.error(`\n${failures} check(s) failed`);
        process.exit(1);
    }
    console.log("\nAll bulk import smoke checks passed");
    process.exit(0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
