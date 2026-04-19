import { Router } from "express";
import AdmiRouter from "./admin";
import authRouter from "./auth";
import RolesRouter from "./roles";
import CountryRouter from "./country";
import CityRouter from "./city";
import ZoneRouter from "./zone";
import SubcategoryRouter from "./subcategory";
import AddonRouter from "./addon";
import FoodRouter from "./food";
import walletsRouter from "./restaurant_wallets"
import restaurantsettingRouter from "./restaurantsetting";
import payment_methodsRouter from "./payment_methods";
import branchesRouter from "./branches";
import branchemenuRouter from "./branchemenu";
import OrderRouter from "./order"
import restaurantZoneDeliveryFeesRouter from "./restaurantZoneDeliveryFees";
import user_walletsRouter from "./userWallets";
import { authenticated } from "../../middlewares/authenticated";
import { authorizeRoles } from "../../middlewares/authorized";
const router = Router();

router.use("/auth", authRouter);
router.use(authenticated, authorizeRoles("restaurantadmin", "subadmin"));

router.use("/restaurantadmin", AdmiRouter);
router.use("/roles", RolesRouter);
router.use("/subcategories", SubcategoryRouter);
router.use("/order", OrderRouter);
router.use("/addons", AddonRouter);
router.use("/branchemenu", branchemenuRouter);
router.use("/food", FoodRouter);
router.use("/wallets", walletsRouter);
router.use("/restaurantsetting", restaurantsettingRouter);
router.use("/restaurant-zone-delivery-fees", restaurantZoneDeliveryFeesRouter);
router.use("/branches", branchesRouter);

export default router;