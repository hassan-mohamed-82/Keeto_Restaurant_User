import { Router } from "express";
import { login, logout } from "../../controllers/admin/auth";
import { authenticated } from "../../middlewares/authenticated";
import { catchAsync } from "../../utils/catchAsync";
import { validate } from "../../middlewares/validation";
import { loginSchema } from "../../validation/admin/auth";

const router = Router();

router.post("/login", validate(loginSchema), catchAsync(login));
router.post("/logout", authenticated, catchAsync(logout));

export default router;