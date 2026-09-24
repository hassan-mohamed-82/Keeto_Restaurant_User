import { Router } from "express";
import { createImage, deleteImage, getAllImages, getImageById, updateImage , getAllActiveBranches } from "../../controllers/admin/image";
import { catchAsync } from "../../utils/catchAsync";
import { validate } from "../../middlewares/validation";
import { createImageSchema, updateImageSchema } from "../../validation/admin/image";

const router = Router();

router.get("/select-branch" , catchAsync(getAllActiveBranches))
router.post("/", validate(createImageSchema), catchAsync(createImage));
router.get("/", catchAsync(getAllImages));
router.get("/:id", catchAsync(getImageById));
router.delete("/:id", catchAsync(deleteImage));
router.put("/:id", validate(updateImageSchema), catchAsync(updateImage));
export default router;