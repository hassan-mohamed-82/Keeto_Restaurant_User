import { Router } from "express";
import { loginDeliveryMan, logoutDeliveryMan } from "../../controllers/delivery_man/auth";
import { validate } from "../../middlewares/validation";
import { deliveryManLoginSchema } from "../../validation/delivery_man/auth";
import { authenticated } from "../../middlewares/authenticated";
import { authorizedDeliveryMan } from "../../middlewares/authorizedDeliveryMan";

const router = Router();

router.post("/login", validate(deliveryManLoginSchema), loginDeliveryMan);
router.post("/logout", authenticated, authorizedDeliveryMan(), logoutDeliveryMan);

export default router;
