"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LINK_TYPES = exports.BASE64_IMAGE_REGEX = exports.MODULE_RESTRICTED_ACTIONS = exports.ACTION_NAMES = exports.MODULES = void 0;
exports.MODULES = [
    // ─── Core Admin ───────────────────────────────────────
    "dashboard", // view-only: overview & stats
    "restrauntadmins",
    "role_restaurant",
    "restaurantadmin",
    // ─── Menu ─────────────────────────────────────────────
    "food",
    "foodingredients",
    "ingredients",
    "ingredientscategory",
    "addon",
    "subcategory",
    "image",
    "foodLocks",
    "recommendedFood",
    "pointsProducts",
    // ─── Orders ───────────────────────────────────────────
    "order",
    "pointsOrders",
    // ─── Branches & Zones ─────────────────────────────────
    "branches",
    "branchemenu",
    "zone",
    "restaurantZoneDeliveryfees",
    "restaurant QR",
    // ─── Marketing ────────────────────────────────────────
    "basiccampaign",
    "coupon",
    "discount",
    "popup",
    "slider",
    "notification",
    "freeDeliveryOffer",
    // ─── Finance ──────────────────────────────────────────
    "restaurant_wallet",
    "financialAccount",
    "expense",
    "expenseCategory",
    "report",
    // ─── Customers & Ratings ──────────────────────────────
    "rating",
    "customerRatings",
    // ─── Settings ─────────────────────────────────────────
    "restaurantsetting",
    "policy",
    "city",
    "country",
    "delivery_man",
    "socialmedia",
];
exports.ACTION_NAMES = ["View", "Add", "Edit", "Delete", "Status", "filter"];
/** Modules that support only a restricted subset of actions */
exports.MODULE_RESTRICTED_ACTIONS = {
    dashboard: ["View"],
};
exports.BASE64_IMAGE_REGEX = /^data:image\/(jpeg|jpg|png|gif|webp);base64,/;
exports.LINK_TYPES = ["link", "subcategory", "product", "discount"];
