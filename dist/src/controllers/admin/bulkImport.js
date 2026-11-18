"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commitImport = exports.validateImport = exports.downloadImportTemplate = void 0;
const BadRequest_1 = require("../../Errors/BadRequest");
const response_1 = require("../../utils/response");
const multer_1 = require("../../middlewares/multer");
const template_1 = require("../../services/bulkImport/template");
const importer_1 = require("../../services/bulkImport/importer");
// Cache invalidation: like createSubcategory / createFood, a successful (2xx)
// commit is picked up by the router-level `invalidateCache` middleware, which
// clears home_screen_data, restaurants_cuisine:*, foods_category:* and
// restaurant_details:*. The validate dry run opts out of it.
const getRestaurantId = (req) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    return restaurantId;
};
const getUploadedWorkbook = (req) => {
    if (!req.file) {
        throw new BadRequest_1.BadRequest(`Upload the .xlsx file in the "${multer_1.EXCEL_FIELD_NAME}" form field`);
    }
    if (req.file.size === 0) {
        throw new BadRequest_1.BadRequest("The uploaded file is empty");
    }
    return req.file.buffer;
};
/** Logs counts and errors only (never cell contents of the file). */
const logPlan = (action, restaurantId, plan) => {
    const { counts } = plan;
    console.log(`[bulk-import] ${action} restaurant=${restaurantId} subcategories=${counts.subcategories} foods=${counts.foods} ` +
        `variations=${counts.variations} options=${counts.options} skipped=${plan.skipped.length} errors=${plan.errors.length}`);
    if (plan.errors.length > 0) {
        console.log("[bulk-import] errors (first 20):", JSON.stringify(plan.errors.slice(0, 20)));
    }
};
const failedValidationDetails = (plan) => ({
    subcategoriesCreated: 0,
    foodsCreated: 0,
    skipped: plan.skipped,
    errors: plan.errors,
});
// =============================================
// GET /import/template
// =============================================
const downloadImportTemplate = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const file = await (0, template_1.buildImportTemplate)(restaurantId);
    res.setHeader("Content-Type", template_1.XLSX_MIME_TYPE);
    res.setHeader("Content-Disposition", `attachment; filename="${template_1.TEMPLATE_FILE_NAME}"`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.status(200).send(file);
};
exports.downloadImportTemplate = downloadImportTemplate;
// =============================================
// POST /import/validate  (dry run, no database writes)
// =============================================
const validateImport = async (req, res) => {
    // Nothing is written, so the cache does not need to be cleared
    res.locals.skipCacheInvalidation = true;
    const restaurantId = getRestaurantId(req);
    const plan = await (0, importer_1.planImport)(getUploadedWorkbook(req), restaurantId);
    logPlan("validate", restaurantId, plan);
    if (plan.errors.length > 0) {
        throw new BadRequest_1.BadRequest("Import validation failed", { ...failedValidationDetails(plan), dryRun: true });
    }
    return (0, response_1.SuccessResponse)(res, {
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
exports.validateImport = validateImport;
// =============================================
// POST /import/commit  (same validation, then one transaction)
// =============================================
const commitImport = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const plan = await (0, importer_1.planImport)(getUploadedWorkbook(req), restaurantId);
    logPlan("commit", restaurantId, plan);
    if (plan.errors.length > 0) {
        throw new BadRequest_1.BadRequest("Import validation failed", failedValidationDetails(plan));
    }
    const result = await (0, importer_1.executeImportPlan)(restaurantId, plan);
    console.log(`[bulk-import] committed restaurant=${restaurantId} subcategories=${result.subcategoriesCreated} foods=${result.foodsCreated} ` +
        `variations=${result.variationsCreated} options=${result.optionsCreated} skipped=${plan.skipped.length}`);
    return (0, response_1.SuccessResponse)(res, {
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
exports.commitImport = commitImport;
