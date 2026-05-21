import { Router } from "express";
import { hasPermission } from "../../middlewares/hasPermission";
import {createBranch,getMyBranches,getBranchById,updateBranch,deleteBranch,updateBranchStatus, getallzones} from "../../controllers/admin/branches";
import { catchAsync } from "../../utils/catchAsync";

const router = Router();

// ✅ Get zones - يحتاج صلاحية read (restaurants module)
router.get("/zone", hasPermission("branches", "read"), catchAsync(getallzones));

// ✅ Create branch - يحتاج صلاحية create (restaurants module)
router.post("/", hasPermission("branches", "create"), catchAsync(createBranch));

// ✅ Get all branches - يحتاج صلاحية read
router.get("/", hasPermission("branches", "read"), catchAsync(getMyBranches));

// ✅ Get branch by id - يحتاج صلاحية read
router.get("/:id", hasPermission("branches", "read"), catchAsync(getBranchById));

// ✅ Update branch - يحتاج صلاحية update
router.put("/:id", hasPermission("branches", "update"), catchAsync(updateBranch));

// ✅ Delete branch - يحتاج صلاحية delete
router.delete("/:id", hasPermission("branches", "delete"), catchAsync(deleteBranch));

// ✅ Update branch status - يحتاج صلاحية update
router.put("/:id/status", hasPermission("branches", "update"), catchAsync(updateBranchStatus));

export default router;