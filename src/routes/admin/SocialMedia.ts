import { Router } from "express";
import { addSocialMedia, getSocialMedia, deleteSocialMedia, getSocialMediaById, updateSocialMedia, selectPlatform } from "../../controllers/admin/SocialMedia";
import { catchAsync } from "../../utils/catchAsync";
const router = Router();

router.get("/select-platform", catchAsync(selectPlatform));
router.post("/add", catchAsync(addSocialMedia));
router.get("/", catchAsync(getSocialMedia));
router.get("/:id", catchAsync(getSocialMediaById));
router.put("/:id", catchAsync(updateSocialMedia));
router.delete("/:id", catchAsync(deleteSocialMedia));

export default router;