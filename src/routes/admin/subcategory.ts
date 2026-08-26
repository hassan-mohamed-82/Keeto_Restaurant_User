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

// Standard CRUD
router.post("/", catchAsync(createSubcategory));
router.get("/", catchAsync(getAllSubcategories));
router.get("/:id", catchAsync(getSubcategoryById));
router.put("/:id", catchAsync(updateSubcategory));
router.delete("/:id", catchAsync(deleteSubcategory));

export default router;
