import { Router } from "express";
import { addSocialMedia, getSocialMedia, deleteSocialMedia, getSocialMediaById, updateSocialMedia, selectPlatform } from "../../controllers/admin/SocialMedia";
import { catchAsync } from "../../utils/catchAsync";
import { hasPermission } from "../../middlewares/hasPermission";
const router = Router();

router.get("/select-platform", catchAsync(selectPlatform));
router.post("/add", hasPermission("socialmedia", "create", true), catchAsync(addSocialMedia));
router.get("/", hasPermission("socialmedia", "read", true), catchAsync(getSocialMedia));
router.get("/:id", hasPermission("socialmedia", "read", true), catchAsync(getSocialMediaById));
router.put("/:id", hasPermission("socialmedia", "update", true), catchAsync(updateSocialMedia));
router.delete("/:id", hasPermission("socialmedia", "delete", true), catchAsync(deleteSocialMedia));
export default router;