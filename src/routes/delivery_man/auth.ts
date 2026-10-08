import { Router } from "express";
import { loginDeliveryMan, logoutDeliveryMan ,updateFcmToken  } from "../../controllers/delivery_man/auth";
import { validate } from "../../middlewares/validation";
import { deliveryManLoginSchema } from "../../validation/delivery_man/auth";
import { authenticated } from "../../middlewares/authenticated";
import { authorizedDeliveryMan } from "../../middlewares/authorizedDeliveryMan";
import { catchAsync } from "../../utils/catchAsync";

const router = Router();

router.post("/login", validate(deliveryManLoginSchema), loginDeliveryMan);
router.post("/logout", authenticated, authorizedDeliveryMan(), logoutDeliveryMan);
router.post("/fcm-token", authorizedDeliveryMan(), catchAsync(updateFcmToken));
export default router;
