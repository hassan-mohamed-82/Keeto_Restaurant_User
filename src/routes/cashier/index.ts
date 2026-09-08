import { Router } from "express";
  
import { authenticated } from "../../middlewares/authenticated";
import { authorizedCashier } from "../../middlewares/authorizedCashier";
import authRouter from "./auth";
import { invalidateCache } from "../../middlewares/invalidateCache";
 
const router = Router();

router.use("/auth", authRouter);
  
// ضفنا الـ Underscore هنا 👇
router.use(authenticated, authorizedCashier());

router.use("/auth", authRouter);
export default router;