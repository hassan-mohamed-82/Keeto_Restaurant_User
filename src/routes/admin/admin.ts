import { Router } from "express";
import { createStaff, deleteStaff, getAllStaff, getStaffById, updateStaff } from "../../controllers/admin/restrauntadmin";
import { catchAsync } from "../../utils/catchAsync";
const router = Router();

router.post("/", catchAsync(createStaff));
router.get("/", catchAsync(getAllStaff));
router.get("/:id", catchAsync(getStaffById));
router.put("/:id", catchAsync(updateStaff));
router.delete("/:id", catchAsync(deleteStaff));

export default router;