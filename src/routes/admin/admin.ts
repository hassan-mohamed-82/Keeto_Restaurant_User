import { Router } from "express";
import { createAdmin, deleteAdmin, getAllAdmins, getAdminById, updateAdmin } from "../../controllers/admin/restrauntadmin";
import { catchAsync } from "../../utils/catchAsync";
const router = Router();

router.post("/", catchAsync(createAdmin));
router.get("/", catchAsync(getAllAdmins));
router.get("/:id", catchAsync(getAdminById));
router.put("/:id", catchAsync(updateAdmin));
router.delete("/:id", catchAsync(deleteAdmin));

export default router;