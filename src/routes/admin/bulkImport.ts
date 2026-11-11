import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { hasPermission } from "../../middlewares/hasPermission";
import { uploadExcelFile } from "../../middlewares/multer";
import { commitImport, downloadImportTemplate, validateImport } from "../../controllers/admin/bulkImport";

const router = Router();

// Auth (authenticated + authorizeRoles) and cache invalidation come from the
// admin router, exactly like the subcategory and food routes. Permissions use
// the food module, the same one that guards POST /food.
router.get("/template", hasPermission("food", "read"), catchAsync(downloadImportTemplate));
router.post("/validate", hasPermission("food", "create"), uploadExcelFile, catchAsync(validateImport));
router.post("/commit", hasPermission("food", "create"), uploadExcelFile, catchAsync(commitImport));

export default router;
