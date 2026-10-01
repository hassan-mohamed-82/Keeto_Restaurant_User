import { Router } from "express";
import { getMyProfile, updateMyProfile } from "../../controllers/delivery_man/profile";
import { validate } from "../../middlewares/validation";
import { deliveryManUpdateProfileSchema } from "../../validation/delivery_man/profile";

const router = Router();

router.get("/", getMyProfile);
router.put("/", validate(deliveryManUpdateProfileSchema), updateMyProfile);

export default router;
