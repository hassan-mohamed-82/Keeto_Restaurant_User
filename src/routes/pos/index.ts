import { Router } from "express";
import { authenticated } from "../../middlewares/authenticated";
import { authorizeRoles } from "../../middlewares/authorized";
import { invalidateCache } from "../../middlewares/invalidateCache";
import authRouter from "./auth";
import ShiftsRouter from "./shifts";
import BundleRouter from "../admin/bundles";
import NotesRouter from "./notes";
import NotesItemsRouter from "./notesItems";
import OfferRouter from "./offers";

const router = Router();

router.use("/auth", authRouter);
router.use(authenticated, authorizeRoles("owner", "subadmin", "branch_manager", "staff"));

// أضفنا ميدل وير لمسح الكاش تلقائياً عند أي تعديل من الأدمن
router.use(invalidateCache);

// POS Routes
router.use("/shifts", ShiftsRouter);
router.use("/bundles", BundleRouter);
router.use("/notes", NotesRouter);
router.use("/notes-items", NotesItemsRouter);
router.use("/offers", OfferRouter);

export default router;