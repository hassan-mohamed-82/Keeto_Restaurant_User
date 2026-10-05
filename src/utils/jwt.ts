import jwt from "jsonwebtoken";
import { TokenPayload, Role } from "../types/custom";

const JWT_SECRET = process.env.JWT_SECRET as string;

// =======================
// Generate User Token
// =======================
export const generateUserToken = (data: {
    id: string;
    name: string;
}): string => {
    return jwt.sign(
        {
            id: data.id,
            name: data.name,
            role: "user",
        },
        JWT_SECRET,
        { expiresIn: "30d" }
    );
};

// =======================
// Generate Admin Token
// =======================
export const generateAdminToken = (data: {
    id: string;
    name: string;
    type: "super_admin" | "admin";
}): string => {
    return jwt.sign(
        {
            id: data.id,
            name: data.name,
            role: "admin",
            type: data.type,
        },
        JWT_SECRET,
        { expiresIn: "7d" }
    );
};

// =======================
// Generate Restaurant Admin Token
// =======================
export const generateRestaurantAdminToken = (data: {
    id: string;
    name: string;
    // 🔄 ضفنا هنا "owner" و "staff" لتقبلها الدالة في الـ Login مباشرة دون اعتراض
    type: "subadmin" | "branch_manager" | "owner" | "staff" | "cashier";
    restaurantId: string;
    branchId?: string | null;
}): string => {
    return jwt.sign(
        {
            id: data.id,
            name: data.name,
            role: data.type,
            type: data.type, // هنا سيتم تخزين "owner" أو "staff" داخل الـ token payload
            restaurantId: data.restaurantId,
            branchId: data.branchId || null,
        },
        JWT_SECRET,
        { expiresIn: "7d" }
    );
};

// =======================
// Generate Guest Token
// =======================
export const generateGuestToken = (data: {
    id: string;
    restaurantId?: string | null;
}): string => {
    return jwt.sign(
        {
            id: data.id,
            name: "Guest",
            role: "user",
            isGuest: true,
            restaurantId: data.restaurantId || null,
        },
        JWT_SECRET,
        { expiresIn: "30d" }
    );
};

// =======================
// Generate Delivery Man Token
// =======================
export const generateDeliveryManToken = (data: {
    id: string;
    name: string;
    restaurantId: string;
    branchId?: string | null;
    shippingCompanyId?: string | null;
    deliveryType?: string;
    phone?: string;
}): string => {
    return jwt.sign(
        {
            id: data.id,
            name: data.name,
            phone: data.phone || null,
            role: "delivery_man",
            type: "delivery_man",
            restaurantId: data.restaurantId,
            branchId: data.branchId || null,
            shippingCompanyId: data.shippingCompanyId || null,
            deliveryType: data.deliveryType || null,
        },
        JWT_SECRET,
        { expiresIn: "30d" }
    );
};
// =======================
// Generate Shipping Company Token
// =======================
export const generateShippingCompanyToken = (data: {
    id: string;
    name: string;
    email: string;
}): string => {
    return jwt.sign(
        {
            id: data.id,
            name: data.name,
            email: data.email,
            role: "shipping_company",
            shippingCompanyId: data.id,
        },
        JWT_SECRET,
        { expiresIn: "30d" }
    );
};

// =======================
// Verify Token
// =======================
export const verifyToken = (token: string): TokenPayload => {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
};