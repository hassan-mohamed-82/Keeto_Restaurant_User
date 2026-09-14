import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { validate } from "../../middlewares/validation";
import { createSliderSchema, updateSliderSchema } from "../../validation/admin/slider";
import { 
   createImage,
   getAllImages,
   deleteImage,
   getImageById,
   updateImage  
} from "../../controllers/admin/slider";

const router = Router();

router.post("/", validate(createSliderSchema), catchAsync(createImage));
router.get("/", catchAsync(getAllImages));
router.get("/:id", catchAsync(getImageById));
router.delete("/:id", catchAsync(deleteImage));
router.put("/:id", validate(updateSliderSchema), catchAsync(updateImage));

export default router;
