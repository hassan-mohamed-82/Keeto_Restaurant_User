// =======================
// Role System (Updated)
// =======================
export type Role = "user" | "admin" | "owner";

// =======================
// App User (Request.user)
// =======================
export interface AppUser {
    id: string;
    _id?: string; // MongoDB fallback
    name?: string;
    role: Role;
    isGuest?: boolean;

    // restaurant system
    type?: "owner" | "subadmin" | "branch_manager" | "staff" | "cashier";

    restaurantId?: string | null;
    branchId?: string | null;
}

// =======================
// Token Payload
// =======================
export interface TokenPayload {
    id: string;
    name?: string;
    role: Role;
    type?: string;
    restaurantId?: string;
    branchId?: string;
    isGuest?: boolean;
}

// =======================
// API Response
// =======================
export interface ApiResponse<T = any> {
    success: boolean;
    message: string;
    data?: T;
    error?: {
        code: number;
        message: string;
        details?: any;
    };
}

// =======================
// Permissions System
// =======================
export type ActionName = "create" | "read" | "update" | "delete" | "filter";

export type ModuleName =
    | "users"
    | "admins"
    | "restaurants"
    | "order"
    | "favorites"
    | "branches"
    | "categories"
    | "coupons"
    // ─── restaurant-admin modules ───
    | "dashboard"
    | "restrauntadmins"
    | "role_restaurant"
    | "restaurantadmin"
    | "food"
    | "foodingredients"
    | "ingredients"
    | "ingredientscategory"
    | "addon"
    | "subcategory"
    | "image"
    | "foodLocks"
    | "recommendedFood"
    | "pointsProducts"
    | "order"
    | "pointsOrders"
    | "branchemenu"
    | "zone"
    | "restaurantZoneDeliveryfees"
    | "restaurant QR"
    | "basiccampaign"
    | "coupon"
    | "discount"
    | "popup"
    | "slider"
    | "notification"
    | "freeDeliveryOffer"
    | "restaurant_wallet"
    | "financialAccount"
    | "expense"
    | "expenseCategory"
    | "report"
    | "rating"
    | "customerRatings"
    | "restaurantsetting"
    | "policy"
    | "city"
    | "country"
    | "delivery_man"
    | "socialmedia";

export interface PermissionAction {
    id?: string;
    action: ActionName;
}

export interface Permission {
    module: ModuleName;
    actions: PermissionAction[];
}

// =======================
// Express Extend
// =======================
declare global {
    namespace Express {
        interface Request {
            user?: AppUser;
        }
    }
}