import { Router } from "express";
import { hasPermission } from "../../middlewares/hasPermission";
import { createStaff, deleteStaff, getAllStaff, getStaffById, updateStaff } from "../../controllers/admin/restrauntadmin";
import { updateFcmToken } from "../../controllers/admin/fcmToken";
import { catchAsync } from "../../utils/catchAsync";

const router = Router();

// ✅ Create staff - يحتاج صلاحية create (admins module)
router.post("/", hasPermission("admins", "create"), catchAsync(createStaff));

// ✅ Get all staff - يحتاج صلاحية read
router.get("/", hasPermission("admins", "read"), catchAsync(getAllStaff));

// ✅ Update FCM token - لا يحتاج صلاحيات (كل واحد يقدر يحدث token بتاعه)
router.put("/fcm-token", catchAsync(updateFcmToken));

router.get("/:id", hasPermission("admins", "read"), catchAsync(getStaffById));

// ✅ Update staff - يحتاج صلاحية update
router.put("/:id", hasPermission("admins", "update"), catchAsync(updateStaff));

// ✅ Delete staff - يحتاج صلاحية delete
router.delete("/:id", hasPermission("admins", "delete"), catchAsync(deleteStaff));

export default router;