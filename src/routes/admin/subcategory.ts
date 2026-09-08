import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import {
  createSubcategory,
  getAllSubcategories,
  getSubcategoryById,
  updateSubcategory,
  deleteSubcategory,
  getallcategory,
  updateBranchSubcategoryStatus,
  updateBranchSubcategoryOutOfStock,
  getSubcategoryBranchAvailability,
  getActiveSubcategoriesByBranch,
} from "../../controllers/admin/subcategory";

const router = Router();

// Dropdown / Active helpers
router.get("/select", catchAsync(getallcategory));
router.get("/branch/:branchId/active", catchAsync(getActiveSubcategoriesByBranch));

// Branch status & availability
router.get("/:id/branches-availability", catchAsync(getSubcategoryBranchAvailability));
router.put("/:id/branch/:branchId/status", catchAsync(updateBranchSubcategoryStatus));

// Subcategory out-of-stock
router.put("/:id/branch/:branchId/out-of-stock", catchAsync(updateBranchSubcategoryOutOfStock));
router.put("/:id/out-of-stock", catchAsync(updateBranchSubcategoryOutOfStock));

// Standard CRUD
router.post("/", catchAsync(createSubcategory));
router.get("/", catchAsync(getAllSubcategories));
router.get("/:id", catchAsync(getSubcategoryById));
router.put("/:id", catchAsync(updateSubcategory));
router.delete("/:id", catchAsync(deleteSubcategory));

export default router;
