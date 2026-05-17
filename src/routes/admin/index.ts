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
import IngredientsRouter from "./ingredients"
import IngredientCategoryRouter from "./IngredientCategory";
import restaurantZoneDeliveryFeesRouter from "./restaurantZoneDeliveryFees";
import user_walletsRouter from "./userWallets";
import RatingRouter from "./rating";
import DiscountRouter from "./discount";
import CouponRouter from "./coupon";
import policyRouter from "./policy";
import { authenticated } from "../../middlewares/authenticated";
import { authorizeRoles } from "../../middlewares/authorized";
const router = Router();

router.use("/auth", authRouter);
// ضفنا الـ Underscore هنا 👇
router.use(authenticated, authorizeRoles("restaurant_admin", "subadmin", "branch_manager"));
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
router.use("/ingredients", IngredientsRouter);
router.use("/ingredientcategory", IngredientCategoryRouter);
router.use("/ratings", RatingRouter);
router.use("/discounts", DiscountRouter);
router.use("/coupons", CouponRouter);
router.use("/policy", policyRouter);
export default router;