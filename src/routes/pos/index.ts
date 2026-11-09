import { Router } from "express";
import { authenticated } from "../../middlewares/authenticated";
import { authorizeRoles } from "../../middlewares/authorized";
import { invalidateCache } from "../../middlewares/invalidateCache";
import authRouter from "./auth";
import ShiftsRouter from "./shifts";
import ServiceFeesRouter from "./serviceFees";
import TaxRouter from "./tax";
import BundleRouter from "./bundles";
import TaxTypeRouter from "./taxType";
import NotesRouter from "./notes";
import NotesItemsRouter from "./notesItems";
import OfferRouter from "./offers";
import SupplierRouter from "./suppliers";
import StoreRouter from "./stores";
import StoreManRouter from "./storeMen";
import CaptainOrderRouter from "./captainOrders";
import CashierManRouter from "./cashierMen";
import HallRouter from "./halls";
import HallTableRouter from "./hallTables";
const router = Router();

router.use("/auth", authRouter);
router.use(authenticated, authorizeRoles("owner", "subadmin", "branch_manager", "staff"));

// أضفنا ميدل وير لمسح الكاش تلقائياً عند أي تعديل من الأدمن
router.use(invalidateCache);

// POS Routes
router.use("/shifts", ShiftsRouter);
router.use("/service-fees", ServiceFeesRouter);
router.use("/taxes", TaxRouter);
router.use("/tax", TaxRouter);
router.use("/bundles", BundleRouter);
router.use("/tax-type", TaxTypeRouter);
router.use("/tax-types", TaxTypeRouter);
router.use("/notes", NotesRouter);
router.use("/notes-items", NotesItemsRouter);
router.use("/offers", OfferRouter);
router.use("/suppliers", SupplierRouter);
router.use("/stores", StoreRouter);
router.use("/store-men", StoreManRouter);
router.use("/captain-orders", CaptainOrderRouter);
router.use("/cashier-men", CashierManRouter);
router.use("/halls", HallRouter);
router.use("/hall-tables", HallTableRouter);

export default router;