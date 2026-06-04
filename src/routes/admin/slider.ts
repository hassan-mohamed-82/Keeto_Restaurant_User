import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { 
   createImage,
   getAllImages,
   deleteImage,
   getImageById,
   updateImage  
} from "../../controllers/admin/slider";

const router = Router();

router.post("/", catchAsync(createImage));
router.get("/", catchAsync(getAllImages));
router.delete("/:id", catchAsync(deleteImage));
router.get("/:id", catchAsync(getImageById));
router.put("/:id", catchAsync(updateImage));

export default router;
