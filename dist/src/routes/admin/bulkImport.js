"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const hasPermission_1 = require("../../middlewares/hasPermission");
const multer_1 = require("../../middlewares/multer");
const bulkImport_1 = require("../../controllers/admin/bulkImport");
const router = (0, express_1.Router)();
// Auth (authenticated + authorizeRoles) and cache invalidation come from the
// admin router, exactly like the subcategory and food routes. Permissions use
// the food module, the same one that guards POST /food.
router.get("/template", (0, hasPermission_1.hasPermission)("food", "read"), (0, catchAsync_1.catchAsync)(bulkImport_1.downloadImportTemplate));
router.post("/validate", (0, hasPermission_1.hasPermission)("food", "create"), multer_1.uploadExcelFile, (0, catchAsync_1.catchAsync)(bulkImport_1.validateImport));
router.post("/commit", (0, hasPermission_1.hasPermission)("food", "create"), multer_1.uploadExcelFile, (0, catchAsync_1.catchAsync)(bulkImport_1.commitImport));
exports.default = router;
