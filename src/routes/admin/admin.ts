import { Router } from "express";
import { createStaff, deleteStaff, getAllStaff, getStaffById, updateStaff } from "../../controllers/admin/restrauntadmin";
import { updateFcmToken } from "../../controllers/admin/fcmToken";
import { catchAsync } from "../../utils/catchAsync";
const router = Router();

router.post("/", catchAsync(createStaff));
router.get("/", catchAsync(getAllStaff));
router.put("/fcm-token", catchAsync(updateFcmToken));
router.put("/:id", catchAsync(updateStaff));
router.delete("/:id", catchAsync(deleteStaff));

export default router;