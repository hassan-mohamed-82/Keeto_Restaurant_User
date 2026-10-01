import { Router } from "express";
import { authenticated } from "../../middlewares/authenticated";
import { authorizedDeliveryMan } from "../../middlewares/authorizedDeliveryMan";
import authRouter from "./auth";
import dashboardRouter from "./dashboard";
import ordersRouter from "./orders";
import profileRouter from "./profile";
import notificationsRouter from "./notifications";

const router = Router();

// Public: Login (no auth required)
router.use("/auth", authRouter);

// All routes below require authentication and delivery_man role
router.use(authenticated, authorizedDeliveryMan());

router.use("/dashboard", dashboardRouter);
router.use("/orders", ordersRouter);
router.use("/profile", profileRouter);
router.use("/notifications", notificationsRouter);

export default router;
