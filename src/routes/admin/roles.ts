import { Router } from "express";
import { createRole, deleteRole, getAllRoles, getRoleById, updateRole,
    getAvailablePermissions
 } from "../../controllers/admin/roles";
import { catchAsync } from "../../utils/catchAsync";
const router = Router();

router.get("/permissions", catchAsync(getAvailablePermissions));
router.post("/", catchAsync(createRole));
router.get("/", catchAsync(getAllRoles));
router.get("/:id", catchAsync(getRoleById));
router.put("/:id", catchAsync(updateRole));
router.delete("/:id", catchAsync(deleteRole));

export default router;