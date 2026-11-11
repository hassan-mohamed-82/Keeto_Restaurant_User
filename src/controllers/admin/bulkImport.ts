import { Request, Response } from "express";
import { BadRequest } from "../../Errors/BadRequest";
import { SuccessResponse } from "../../utils/response";
import { EXCEL_FIELD_NAME } from "../../middlewares/multer";
import { buildImportTemplate, TEMPLATE_FILE_NAME, XLSX_MIME_TYPE } from "../../services/bulkImport/template";
import { executeImportPlan, planImport } from "../../services/bulkImport/importer";
import { ImportPlan } from "../../services/bulkImport/validator";

// Cache invalidation: like createSubcategory / createFood, a successful (2xx)
// commit is picked up by the router-level `invalidateCache` middleware, which
// clears home_screen_data, restaurants_cuisine:*, foods_category:* and
// restaurant_details:*. The validate dry run opts out of it.

const getRestaurantId = (req: Request): string => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }
    return restaurantId;
};

const getUploadedWorkbook = (req: Request): Buffer => {
    if (!req.file) {
        throw new BadRequest(`Upload the .xlsx file in the "${EXCEL_FIELD_NAME}" form field`);
    }
    if (req.file.size === 0) {
        throw new BadRequest("The uploaded file is empty");
    }
    return req.file.buffer;
};

/** Logs counts and errors only (never cell contents of the file). */
const logPlan = (action: "validate" | "commit", restaurantId: string, plan: ImportPlan): void => {
    const { counts } = plan;
    console.log(
        `[bulk-import] ${action} restaurant=${restaurantId} subcategories=${counts.subcategories} foods=${counts.foods} ` +
            `variations=${counts.variations} options=${counts.options} skipped=${plan.skipped.length} errors=${plan.errors.length}`
    );
    if (plan.errors.length > 0) {
        console.log("[bulk-import] errors (first 20):", JSON.stringify(plan.errors.slice(0, 20)));
    }
};

const failedValidationDetails = (plan: ImportPlan) => ({
    subcategoriesCreated: 0,
    foodsCreated: 0,
    skipped: plan.skipped,
    errors: plan.errors,
});

// =============================================
// GET /import/template
// =============================================
export const downloadImportTemplate = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);
    const file = await buildImportTemplate(restaurantId);

    res.setHeader("Content-Type", XLSX_MIME_TYPE);
    res.setHeader("Content-Disposition", `attachment; filename="${TEMPLATE_FILE_NAME}"`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.status(200).send(file);
};

// =============================================
// POST /import/validate  (dry run, no database writes)
// =============================================
export const validateImport = async (req: Request, res: Response) => {
    // Nothing is written, so the cache does not need to be cleared
    res.locals.skipCacheInvalidation = true;

    const restaurantId = getRestaurantId(req);
    const plan = await planImport(getUploadedWorkbook(req), restaurantId);
    logPlan("validate", restaurantId, plan);

    if (plan.errors.length > 0) {
        throw new BadRequest("Import validation failed", { ...failedValidationDetails(plan), dryRun: true });
    }

    return SuccessResponse(res, {
        message: "Validation passed",
        data: {
            subcategoriesCreated: 0,
            foodsCreated: 0,
            skipped: plan.skipped,
            errors: [],
            dryRun: true,
            wouldCreate: plan.counts,
        },
    });
};

// =============================================
// POST /import/commit  (same validation, then one transaction)
// =============================================
export const commitImport = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);
    const plan = await planImport(getUploadedWorkbook(req), restaurantId);
    logPlan("commit", restaurantId, plan);

    if (plan.errors.length > 0) {
        throw new BadRequest("Import validation failed", failedValidationDetails(plan));
    }

    const result = await executeImportPlan(restaurantId, plan);
    console.log(
        `[bulk-import] committed restaurant=${restaurantId} subcategories=${result.subcategoriesCreated} foods=${result.foodsCreated} ` +
            `variations=${result.variationsCreated} options=${result.optionsCreated} skipped=${plan.skipped.length}`
    );

    return SuccessResponse(res, {
        message: "Import completed",
        data: {
            subcategoriesCreated: result.subcategoriesCreated,
            foodsCreated: result.foodsCreated,
            variationsCreated: result.variationsCreated,
            optionsCreated: result.optionsCreated,
            skipped: plan.skipped,
            errors: [],
        },
    });
};
