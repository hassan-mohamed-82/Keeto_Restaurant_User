import { Router } from "express";
import AdmiRouter from "./admin";
import authRouter from "./auth";
import RolesRouter from "./roles";
import SubcategoryRouter from "./subcategory";
import AddonRouter from "./addon";
import FoodRouter from "./food";
import walletsRouter from "./restaurant_wallets"
import restaurantsettingRouter from "./restaurantsetting";
import branchesRouter from "./branches";
import branchemenuRouter from "./branchemenu";
import foodLocksRouter from "./foodLocks";
import OrderRouter from "./order"
import IngredientsRouter from "./ingredients"
import IngredientCategoryRouter from "./IngredientCategory";
import restaurantZoneDeliveryFeesRouter from "./restaurantZoneDeliveryFees";
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
import DeliveryManRouter from "./delivery_man";
import RecommendedFoodRouter from "./recommendedFood";
import FreeDeliveryOfferRouter from "./freeDeliveryOffer";
import PricingRouter from "./pricing";
import OrderDelayAlertRouter from "./orderDelayAlert";
import PrinterRouter from "./printer";
import paymentTransactionsRouter from "./paymentTransactions";
import FirstOrderDiscountRouter from "./firstOrderDiscount";
import videosRouter from "./videos";
import PushedNotificationRouter from "./pushedNotification";
import BulkImportRouter from "./bulkImport";

import ServiceFeesRouter from "../admin/serviceFees";
import TaxRouter from "../admin/tax";
import BundleRouter from "../admin/bundles";
import TaxTypeRouter from "../admin/taxType";
import SupplierRouter from "../admin/suppliers";
import StoreRouter from "../admin/stores";
import StoreManRouter from "../admin/storeMen";
import CaptainOrderRouter from "../admin/captainOrders";
import CashierManRouter from "../admin/cashierMen";
import HallRouter from "../admin/halls";
import HallTableRouter from "../admin/hallTables";

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
router.use("/food-locks", foodLocksRouter);
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
router.use("/delivery-men", DeliveryManRouter);
router.use("/recommended-foods", RecommendedFoodRouter);
router.use("/free-delivery", FreeDeliveryOfferRouter);
router.use("/pricing", PricingRouter);
router.use("/order-delay-alerts", OrderDelayAlertRouter);
router.use("/printers", PrinterRouter);
router.use("/payment-transactions", paymentTransactionsRouter);
router.use("/first-order-discounts", FirstOrderDiscountRouter);
router.use("/videos", videosRouter);
router.use("/pushed-notifications", PushedNotificationRouter);
router.use("/import", BulkImportRouter); // bulk Excel import of subcategories & foods



router.use("/service-fees", ServiceFeesRouter);
router.use("/tax", TaxRouter);
router.use("/bundles", BundleRouter);
router.use("/tax-type", TaxTypeRouter);
router.use("/suppliers", SupplierRouter);
router.use("/stores", StoreRouter);
router.use("/store-men", StoreManRouter);
router.use("/captain-orders", CaptainOrderRouter);
router.use("/cashier-men", CashierManRouter);
router.use("/halls", HallRouter);
router.use("/hall-tables", HallTableRouter);

export default router;