export const MODULES = [
    // ─── Core Admin ───────────────────────────────────────
    "dashboard",           // view-only: overview & stats
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
] as const;

export const ACTION_NAMES = ["View", "Add", "Edit", "Delete", "Status", "filter"] as const;

/** Modules that support only a restricted subset of actions */
export const MODULE_RESTRICTED_ACTIONS: Partial<Record<ModuleName, readonly string[]>> = {
    dashboard: ["View"],
};

export type ModuleName = (typeof MODULES)[number];
export type ActionName = (typeof ACTION_NAMES)[number];

export const BASE64_IMAGE_REGEX = /^data:image\/(jpeg|jpg|png|gif|webp);base64,/;

export const LINK_TYPES = ["link", "subcategory", "product", "discount"] as const;
export type LinkType = (typeof LINK_TYPES)[number];

