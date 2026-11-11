# Bulk import: subcategories & foods (Excel)

Data-entry users fill an `.xlsx` template using **names instead of IDs**. The backend resolves the names, validates every row with the same rules as `createSubcategory` / `createFood`, and inserts everything in **one transaction**.

Categories are never created by the import: they must already exist.

## Endpoints

The admin router is mounted at `/api/restaurant`, so the routes are:

| Method | Path | Permission | Body | What it does |
|---|---|---|---|---|
| `GET` | `/api/restaurant/import/template` | `food:read` | none | Downloads `menu-import-template.xlsx` with this restaurant's names in the dropdowns |
| `POST` | `/api/restaurant/import/validate` | `food:create` | `multipart/form-data`, field **`file`** | Dry run: parse, resolve and validate. **No database writes** and no cache invalidation |
| `POST` | `/api/restaurant/import/commit` | `food:create` | same as validate | Same validation, then inserts everything in one transaction |

All three go through the admin router's `authenticated` + `authorizeRoles("owner", "subadmin", "branch_manager", "staff")`, like the subcategory and food routes. A successful commit triggers the router-level `invalidateCache` middleware (`home_screen_data`, `restaurants_cuisine:*`, `foods_category:*`, `restaurant_details:*`), exactly like a manual create.

```bash
curl -H "Authorization: Bearer $TOKEN" -o template.xlsx \
  https://<host>/api/restaurant/import/template

curl -H "Authorization: Bearer $TOKEN" -F "file=@menu.xlsx" \
  https://<host>/api/restaurant/import/validate

curl -H "Authorization: Bearer $TOKEN" -F "file=@menu.xlsx" \
  https://<host>/api/restaurant/import/commit
```

**Limits:** `.xlsx` only, 5 MB per file, 500 data rows per sheet (completely empty rows are ignored), 100 MB uncompressed workbook content.

## Template

| Sheet | Purpose |
|---|---|
| `Instructions` | Usage notes, rules, allowed values, the time format, a Variations example and the list of available addon names |
| `Subcategories` | New subcategories (optional) |
| `Foods` | Foods, one row per food |
| `Variations` | Variations and options, **one row per option** (optional) |
| `Lookups` (hidden) | Category names, this restaurant's subcategory names and addon names (both `name` and `nameAr`) used by the dropdowns |

Headers are matched ignoring case, spaces and underscores (`Order Level` = `order_level`). Column order does not matter and extra columns are ignored. Required columns have an orange header and a note explaining the column.

Dropdowns (Excel data validation) are on `category`, `subcategory` (suggestions only, because a subcategory added in the same file is not in the list yet), `priority`, `status`, `foodtype`, `discount_type`, `stock_type`, `selectionType` and the yes/no columns. `addons` is free text.

### Subcategories

| Column | Required | Values / default |
|---|---|---|
| `category` | yes | Existing category name |
| `name` | yes | Max 255 characters. Unique per category |
| `nameAr`, `nameFr` | | Max 255 characters |
| `image` | | URL starting with `http://` or `https://`. Empty → `NULL` |
| `priority` | | `low` \| `medium` \| `high` (default `low`) |
| `order_level` | | Whole number (default `0`) |
| `status` | | `active` \| `inactive` (default `active`) |
| `addons` | | Comma-separated addon names (`,` or `،`) |

### Foods

| Column | Required | Values / default |
|---|---|---|
| `category` | yes | Existing category name |
| `subcategory` | | A subcategory of that category: existing, or added in the Subcategories sheet |
| `name` | yes | Max 255 characters. Unique per category |
| `nameAr`, `nameFr` | | Max 255 characters |
| `description` | yes | Text |
| `descriptionAr`, `descriptionFr` | | Text |
| `image` | | URL starting with `http://` or `https://`. Empty → `""` (`food.image` is `NOT NULL`) |
| `foodtype` | | `veg` \| `non-veg` (default `veg`) |
| `Nutrition`, `allergen_ingredients` | | Text |
| `is_Halal`, `isOutOfStock` | | `yes` \| `no` (default `no`) |
| `startTime`, `endTime` | | 24-hour `HH:mm`. Excel time cells, `9:30 PM` and Arabic-Indic digits are accepted; stored as `HH:mm` |
| `search_tags` | | Max 255 characters |
| `price` | yes | Number greater than 0, `.` as decimal separator, stored with 2 decimals |
| `discount_type` | | `percentage` \| `amount` (default `percentage`) |
| `discount_value` | | 0 or more, at most 100 for `percentage`. `0` → `NULL` (as in `createFood`) |
| `Maximum_Purchase` | | Whole number ≥ 0. `0` → `NULL` |
| `stock_type` | | `limited` \| `unlimited` \| `daily` (default `unlimited`) |
| `status` | | `active` \| `inactive` (default `active`) |
| `points` | | Whole number ≥ 0 (default `0`) |
| `addons` | | Comma-separated addon names |

### Variations

Rows with the same (`food`, `variationName`) form one variation; each row is one option. Variation settings only need to be filled on one row; different values on two rows of the same variation are an error.

| Column | Required | Values / default |
|---|---|---|
| `food` | yes | Name of a food in the Foods sheet of the same file |
| `variationName` | yes | e.g. `Size` |
| `variationNameAr`, `variationNameFr` | | |
| `isRequired` | | `yes` \| `no` (default `no`) |
| `selectionType` | | `single` \| `multiple` (default `single`) |
| `min`, `max` | | Whole numbers ≥ 0, `min` ≤ `max`, `min` ≤ number of options |
| `optionName` | yes | Unique inside its variation |
| `optionNameAr`, `optionNameFr` | | |
| `additionalPrice` | | Number ≥ 0 (default `0`) |

```
food        | variationName | isRequired | selectionType | min | max | optionName | additionalPrice
Margherita  | Size          | yes        | single        | 1   | 1   | Small      | 0
Margherita  | Size          |            |               |     |     | Medium     | 20
Margherita  | Size          |            |               |     |     | Large      | 40
```

## Name matching

Before comparing, names are normalized: Unicode NFKC, invisible/bidi marks removed, Arabic diacritics and tatweel removed, `أ/إ/آ/ٱ → ا`, `ى → ي`, `ة → ه`, whitespace collapsed, trimmed, lower-cased. Both `name` and `nameAr` are matched. All lookup tables are loaded once per request (4 queries).

| Reference | Searched in | 0 matches | 2+ matches |
|---|---|---|---|
| `category` | all categories (global table) | `Category not found: "…"` | `Ambiguous category name: "…"` |
| `subcategory` | this restaurant's subcategories of the food's category + new rows of the Subcategories sheet | `Subcategory not found: "…" in category "…"` | `Ambiguous subcategory name: …` |
| `addons` | this restaurant's addons | `Unknown addon(s) for this restaurant: a, b` | `Ambiguous addon name(s)…` |
| Variations `food` | rows of the Foods sheet | `Food not found in the Foods sheet: "…"` | `Ambiguous food name: … matches Foods rows 3, 8` |

## Duplicates

- Same category + name twice **in the file**: error on the second row.
- Same restaurant + category + name **already in the database**: the row is **skipped** (listed in `skipped`, not an error). Variation rows of a skipped food are skipped too. Errors on a skipped row are ignored.

## Responses

All errors are returned at once. `row` is the real Excel row number (header = 1). File- or sheet-level problems (unreadable file, missing required header, too many rows) use `sheet: "File"` or the sheet name with `row: null`, and stop before row validation.

**Validate, success** (`200`)

```json
{
  "success": true,
  "data": {
    "message": "Validation passed",
    "data": {
      "subcategoriesCreated": 0,
      "foodsCreated": 0,
      "skipped": [
        { "sheet": "Foods", "row": 4, "name": "margherita", "reason": "Food already exists in category \"Pizza\"" }
      ],
      "errors": [],
      "dryRun": true,
      "wouldCreate": { "subcategories": 1, "foods": 2, "variations": 1, "options": 2 }
    }
  }
}
```

**Commit, success** (`200`)

```json
{
  "success": true,
  "data": {
    "message": "Import completed",
    "data": {
      "subcategoriesCreated": 1,
      "foodsCreated": 2,
      "variationsCreated": 1,
      "optionsCreated": 2,
      "skipped": [],
      "errors": []
    }
  }
}
```

**Validation failure** (`400`, same shape for validate and commit; nothing is written)

```json
{
  "success": false,
  "error": {
    "code": 400,
    "message": "Import validation failed",
    "details": {
      "subcategoriesCreated": 0,
      "foodsCreated": 0,
      "skipped": [
        { "sheet": "Subcategories", "row": 3, "name": "classic", "reason": "Subcategory already exists in category \"Pizza\"" }
      ],
      "errors": [
        { "sheet": "Subcategories", "row": 4, "column": "category", "message": "Category not found: \"Pizzaa\"" },
        { "sheet": "Subcategories", "row": 5, "column": "category", "message": "Ambiguous category name: \"Drinks\" matches 2 categories" },
        { "sheet": "Foods", "row": 4, "column": "status", "message": "Cannot create an active food under an inactive subcategory. Please activate the subcategory first." },
        { "sheet": "Foods", "row": 10, "column": "price", "message": "\"price\" must be greater than 0" },
        { "sheet": "Foods", "row": 12, "column": "startTime", "message": "\"startTime\" is required" },
        { "sheet": "Variations", "row": 7, "column": "food", "message": "Food not found in the Foods sheet: \"Unknown Food\"" }
      ]
    }
  }
}
```

Other 400s: no file (`Upload the .xlsx file in the "file" form field`), wrong extension (`Only .xlsx files are allowed`), file over 5 MB (`File too large. The maximum size is 5 MB`).

## Code

| File | Role |
|---|---|
| `src/helpers/menu.rules.ts` | Shared rules: enum values read from the schema, defaults, messages, required fields, active-under-inactive rule |
| `src/helpers/menu.insert.ts` | `insertSubcategory(executor, restaurantId, data)` and `insertFood(executor, restaurantId, data)`, used by `createSubcategory`, `createFood` and the import |
| `src/services/bulkImport/columns.ts` | Sheet and column definitions shared by the template and the parser |
| `src/services/bulkImport/template.ts` | exceljs template builder |
| `src/services/bulkImport/parser.ts` | Reads sheets into typed rows (numbers, dates, rich text, hyperlinks, formulas, errors) |
| `src/services/bulkImport/resolver.ts` | Name normalization and the name → id lookups |
| `src/services/bulkImport/validator.ts` | Business validation → import plan (no database access) |
| `src/services/bulkImport/importer.ts` | Orchestration and the single transaction |
| `src/controllers/admin/bulkImport.ts`, `src/routes/admin/bulkImport.ts` | Handlers and routes |
| `src/middlewares/multer.ts` | `excelUpload` / `uploadExcelFile` (memory storage, `.xlsx`, 5 MB) |
| `test/bulkImport.smoke.ts` | Round trip with the real exceljs, no database: `npx tsx test/bulkImport.smoke.ts` |
