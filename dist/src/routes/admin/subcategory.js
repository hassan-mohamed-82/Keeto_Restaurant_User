"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const subcategory_1 = require("../../controllers/admin/subcategory");
const router = (0, express_1.Router)();
// Dropdown / Active helpers
router.get("/select", (0, catchAsync_1.catchAsync)(subcategory_1.getallcategory));
router.get("/branch/:branchId/active", (0, catchAsync_1.catchAsync)(subcategory_1.getActiveSubcategoriesByBranch));
// Branch status & availability
router.get("/:id/branches-availability", (0, catchAsync_1.catchAsync)(subcategory_1.getSubcategoryBranchAvailability));
router.put("/:id/branch/:branchId/status", (0, catchAsync_1.catchAsync)(subcategory_1.updateBranchSubcategoryStatus));
// Standard CRUD
router.post("/", (0, catchAsync_1.catchAsync)(subcategory_1.createSubcategory));
router.get("/", (0, catchAsync_1.catchAsync)(subcategory_1.getAllSubcategories));
router.get("/:id", (0, catchAsync_1.catchAsync)(subcategory_1.getSubcategoryById));
router.put("/:id", (0, catchAsync_1.catchAsync)(subcategory_1.updateSubcategory));
router.delete("/:id", (0, catchAsync_1.catchAsync)(subcategory_1.deleteSubcategory));
exports.default = router;
