import { Router } from "express";
import { addSocialMedia, getSocialMedia, deleteSocialMedia, getSocialMediaById, updateSocialMedia } from "../../controllers/admin/SocialMedia";
import { catchAsync } from "../../utils/catchAsync";
const router = Router();

router.post("/add", catchAsync(addSocialMedia));
router.get("/",catchAsync(getSocialMedia));
router.get("/:id", catchAsync(getSocialMediaById));
router.put("/:id", catchAsync(updateSocialMedia));
router.delete("/:id", catchAsync(deleteSocialMedia));

export default router;