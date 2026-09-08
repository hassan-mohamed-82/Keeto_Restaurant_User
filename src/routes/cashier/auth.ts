import { Router } from "express";
import { login_cashier } from "../../controllers/cashier/auth";
const router = Router()

router.post("/login", login_cashier)

export default router