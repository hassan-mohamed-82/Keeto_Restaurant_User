export const MODULES = [
    "restrauntadmins",
    "role_restaurant",
    "addon",
    "basiccampaign",
    "branchemenu",
    "branches",
    "city",
    "country",
    "coupon",
    "discount",
    "food",
    "foodingredients",
    "image",
    "ingredients",
    "ingredientscategory",
    "notification",
    "order",
    "policy",
    "popup",
    "rating",
    "report",
    "restaurant_wallet",
    "restaurantsetting",
    "restaurantZoneDeliveryfees",
    "restaurant QR",
    "restaurantadmin",
    "roles",
    "subcategory",
    "zone",
    "delivery_man"

    
] as const;

export const ACTION_NAMES = ["View", "Add", "Edit", "Delete", "Status"] as const;

export type ModuleName = (typeof MODULES)[number];
export type ActionName = (typeof ACTION_NAMES)[number];

export const BASE64_IMAGE_REGEX = /^data:image\/(jpeg|jpg|png|gif|webp);base64,/;
