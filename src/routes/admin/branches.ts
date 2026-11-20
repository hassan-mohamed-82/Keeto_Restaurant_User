import { Router } from "express";
import { hasPermission } from "../../middlewares/hasPermission";
import { createBranch, getMyBranches, getBranchById, updateBranch, deleteBranch, updateBranchStatus, getallzones, updateBranchVisaStatus, updateAllBranchesVisaStatus } from "../../controllers/admin/branches";
import { catchAsync } from "../../utils/catchAsync";
import { validate } from "../../middlewares/validation";
import { updateBranchVisaStatusSchema, updateAllBranchesVisaStatusSchema } from "../../validation/admin/branches";

const router = Router();

// ✅ Get zones - يحتاج صلاحية read (restaurants module)
router.get("/zone", hasPermission("branches", "read"), catchAsync(getallzones));

// ✅ Create branch - يحتاج صلاحية create (restaurants module)
router.post("/", hasPermission("branches", "create"), catchAsync(createBranch));

// ✅ Get all branches - يحتاج صلاحية read
router.get("/", hasPermission("branches", "read"), catchAsync(getMyBranches));

// ✅ Toggle visa for ALL branches
router.put("/visa-status", hasPermission("branches", "update"), validate(updateAllBranchesVisaStatusSchema), catchAsync(updateAllBranchesVisaStatus));

// ✅ Get branch by id - يحتاج صلاحية read
router.get("/:id", hasPermission("branches", "read"), catchAsync(getBranchById));

// ✅ Update branch - يحتاج صلاحية update
router.put("/:id", hasPermission("branches", "update"), catchAsync(updateBranch));

// ✅ Delete branch - يحتاج صلاحية delete
router.delete("/:id", hasPermission("branches", "delete"), catchAsync(deleteBranch));

// ✅ Update branch status - يحتاج صلاحية update
router.put("/:id/status", hasPermission("branches", "update"), catchAsync(updateBranchStatus));

// ✅ Toggle visa for a specific branch - يحتاج صلاحية update
router.put("/:id/visa-status", hasPermission("branches", "update"), validate(updateBranchVisaStatusSchema), catchAsync(updateBranchVisaStatus));

export default router;