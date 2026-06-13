"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const hasPermission_1 = require("../../middlewares/hasPermission");
const branches_1 = require("../../controllers/admin/branches");
const catchAsync_1 = require("../../utils/catchAsync");
const router = (0, express_1.Router)();
// ✅ Get zones - يحتاج صلاحية read (restaurants module)
router.get("/zone", (0, hasPermission_1.hasPermission)("branches", "read"), (0, catchAsync_1.catchAsync)(branches_1.getallzones));
// ✅ Create branch - يحتاج صلاحية create (restaurants module)
router.post("/", (0, hasPermission_1.hasPermission)("branches", "create"), (0, catchAsync_1.catchAsync)(branches_1.createBranch));
// ✅ Get all branches - يحتاج صلاحية read
router.get("/", (0, hasPermission_1.hasPermission)("branches", "read"), (0, catchAsync_1.catchAsync)(branches_1.getMyBranches));
// ✅ Get branch by id - يحتاج صلاحية read
router.get("/:id", (0, hasPermission_1.hasPermission)("branches", "read"), (0, catchAsync_1.catchAsync)(branches_1.getBranchById));
// ✅ Update branch - يحتاج صلاحية update
router.put("/:id", (0, hasPermission_1.hasPermission)("branches", "update"), (0, catchAsync_1.catchAsync)(branches_1.updateBranch));
// ✅ Delete branch - يحتاج صلاحية delete
router.delete("/:id", (0, hasPermission_1.hasPermission)("branches", "delete"), (0, catchAsync_1.catchAsync)(branches_1.deleteBranch));
// ✅ Update branch status - يحتاج صلاحية update
router.put("/:id/status", (0, hasPermission_1.hasPermission)("branches", "update"), (0, catchAsync_1.catchAsync)(branches_1.updateBranchStatus));
exports.default = router;
