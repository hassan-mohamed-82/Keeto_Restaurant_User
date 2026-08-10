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
import branchesRouter from "./branches";
import branchemenuRouter from "./branchemenu";
import OrderRouter from "./order"
import IngredientsRouter from "./ingredients"
import IngredientCategoryRouter from "./IngredientCategory";
import restaurantZoneDeliveryFeesRouter from "./restaurantZoneDeliveryFees";
import user_walletsRouter from "./userWallets";
import ImageRouter from "./image";
import RatingRouter from "./rating";
import DiscountRouter from "./discount";
import restQRRouter from "./restQR";
import CouponRouter from "./coupon";
import policyRouter from "./policy";
import FinancialAccountRouter from "./FinancialAccount";
import sliderRouter from "./slider";
import PopupRouter from "./popup";
import ReportRouter from "./report";
import expenseRouter from "./expenss";
import expenseCategoryRouter from "./expensscategory";
import NotificationRouter from "./notification";
import { authenticated } from "../../middlewares/authenticated";
import { authorizeRoles } from "../../middlewares/authorized";
import { invalidateCache } from "../../middlewares/invalidateCache";
import SocialMediaRouter from "./SocialMedia";
import ProfileRouter from "./profile";
import RestaurantUserRouter from "./restraurant_user";
import CashierRouter from "./cashier";
import PointsProductsRouter from "./pointsProducts";
import PointsOrdersRouter from "./pointsOrders";
const router = Router();

router.use("/auth", authRouter);
// ضفنا الـ Underscore هنا 👇
router.use(authenticated, authorizeRoles("owner", "subadmin", "branch_manager", "staff"));

// أضفنا ميدل وير لمسح الكاش تلقائياً عند أي تعديل من الأدمن
router.use(invalidateCache);

router.use("/restaurantadmin", AdmiRouter);
router.use("/roles", RolesRouter);
router.use("/subcategories", SubcategoryRouter);
router.use("/order", OrderRouter);
router.use("/addons", AddonRouter);
router.use("/branchemenu", branchemenuRouter);
router.use("/FinancialAccount", FinancialAccountRouter);
router.use("/food", FoodRouter);
router.use("/image", ImageRouter);
router.use("/wallets", walletsRouter);
router.use("/restaurantsetting", restaurantsettingRouter);
router.use("/restaurant-zone-delivery-fees", restaurantZoneDeliveryFeesRouter);
router.use("/branches", branchesRouter);
router.use("/ingredients", IngredientsRouter);
router.use("/ingredientcategory", IngredientCategoryRouter);
router.use("/ratings", RatingRouter);
router.use("/slider", sliderRouter);
router.use("/restQR", restQRRouter);
router.use("/discounts", DiscountRouter);
router.use("/coupons", CouponRouter);
router.use("/policy", policyRouter);
router.use("/popups", PopupRouter);
router.use("/report", ReportRouter);
router.use("/notifications", NotificationRouter);
router.use("/socialmedia", SocialMediaRouter);
router.use("/profile", ProfileRouter);
router.use("/restaurant-users", RestaurantUserRouter);
router.use("/cashiers", CashierRouter);
router.use("/expenses", expenseRouter);
router.use("/expense-categories", expenseCategoryRouter);
router.use("/points-products", PointsProductsRouter);
router.use("/points-orders", PointsOrdersRouter)

export default router;