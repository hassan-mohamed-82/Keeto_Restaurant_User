import { Router } from "express";
import { createRole, deleteRole, getAllRoles, getRoleById, updateRole,
    getAvailablePermissions
 } from "../../controllers/admin/roles";
import { catchAsync } from "../../utils/catchAsync";
import { hasPermission } from "../../middlewares/hasPermission";
const router = Router();

router.get("/permissions", hasPermission("role_restaurant", "read"), catchAsync(getAvailablePermissions));
router.post("/", hasPermission("role_restaurant", "create"), catchAsync(createRole));
router.get("/", hasPermission("role_restaurant", "read") ,catchAsync(getAllRoles));
router.get("/:id",hasPermission("role_restaurant", "read") , catchAsync(getRoleById));
router.put("/:id" ,hasPermission("role_restaurant", "update") , catchAsync(updateRole));
router.delete("/:id" ,hasPermission("role_restaurant", "delete") , catchAsync(deleteRole));

export default router;