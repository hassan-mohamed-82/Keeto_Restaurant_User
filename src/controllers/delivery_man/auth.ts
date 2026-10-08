import { Request, Response } from "express";
import { db } from "../../models/connection";
import { deliveryMen, restaurants, branches } from "../../models/schema";
import { eq, and, or } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { UnauthorizedError } from "../../Errors";
import { NotFound } from "../../Errors/NotFound";
import bcrypt from "bcrypt";
import { generateDeliveryManToken } from "../../utils/jwt";

// ==========================================
// POST /delivery-man/auth/login
// ==========================================
export const loginDeliveryMan = async (req: Request, res: Response) => {
    const { identifier, password, fcmToken } = req.body;

    const trimmed = (identifier || "").trim();
    if (!trimmed || !password) {
        throw new BadRequest("Identifier (phone or email) and password are required");
    }

    // Search by phone or email
    const [deliveryMan] = await db
        .select()
        .from(deliveryMen)
        .where(
            and(
                or(
                    eq(deliveryMen.phone, trimmed),
                    eq(deliveryMen.email, trimmed.toLowerCase())
                ),
                eq(deliveryMen.isDeleted, false)
            )
        )
        .limit(1);

    if (!deliveryMan) {
        throw new UnauthorizedError("Invalid credentials");
    }

    return await _processLogin(res, deliveryMan, password, fcmToken);
};

async function _processLogin(res: Response, deliveryMan: any, password: string, fcmToken?: string) {
    // Check password
    if (!deliveryMan.password) {
        throw new UnauthorizedError("Account has no password set. Contact your restaurant admin.");
    }

    const isPasswordValid = await bcrypt.compare(password, deliveryMan.password);
    if (!isPasswordValid) throw new UnauthorizedError("Invalid credentials");

    // Check active status
    if (deliveryMan.isActive === false) {
        throw new UnauthorizedError("Your account is deactivated. Please contact your restaurant admin.");
    }

    // Fetch restaurant info
    let restaurantName: string | null = null;
    let restaurantStatus: string | null = null;
    if (deliveryMan.restaurantId) {
        const [restaurant] = await db
            .select({ status: restaurants.status, name: restaurants.name })
            .from(restaurants)
            .where(eq(restaurants.id, deliveryMan.restaurantId))
            .limit(1);

        if (restaurant) {
            if (restaurant.status === "inactive") {
                throw new UnauthorizedError("The restaurant is currently suspended.");
            }
            restaurantName = restaurant.name as string;
            restaurantStatus = restaurant.status as string;
        }
    }

    // Fetch branch info
    let branchName: string | null = null;
    let branchNameAr: string | null = null;
    if (deliveryMan.branchId) {
        const [branch] = await db
            .select({ name: branches.name, nameAr: branches.nameAr })
            .from(branches)
            .where(eq(branches.id, deliveryMan.branchId))
            .limit(1);

        if (branch) {
            branchName = branch.name as string;
            branchNameAr = branch.nameAr as string | null;
        }
    }

    // Save FCM token (only after all checks passed)
    if (fcmToken && typeof fcmToken === "string" && fcmToken.trim()) {
        await db
            .update(deliveryMen)
            .set({ fcmToken: fcmToken.trim() })
            .where(eq(deliveryMen.id, deliveryMan.id));
    }

    // Generate token
    const token = generateDeliveryManToken({
        id: deliveryMan.id,
        name: deliveryMan.name,
        restaurantId: deliveryMan.restaurantId,
        branchId: deliveryMan.branchId || null,
        phone: deliveryMan.phone,
    });

    return SuccessResponse(res, {
        message: "Delivery man logged in successfully",
        token,
        deliveryMan: {
            id: deliveryMan.id,
            name: deliveryMan.name,
            phone: deliveryMan.phone,
            email: deliveryMan.email,
            image: deliveryMan.image,
            isActive: deliveryMan.isActive,
            restaurantId: deliveryMan.restaurantId,
            restaurantName,
            branchId: deliveryMan.branchId,
            branchName,
            branchNameAr,
        },
    }, 200);
}

// ==========================================
// POST /delivery-man/auth/logout
// ==========================================
export const logoutDeliveryMan = async (req: Request, res: Response) => {
    const deliveryManId = req.user?.id;
    if (!deliveryManId) throw new UnauthorizedError("Not authenticated");

    // JWT is stateless and is discarded client-side.
    // Clear the FCM token so this device stops receiving pushes after logout.
    await db
        .update(deliveryMen)
        .set({ fcmToken: null })
        .where(eq(deliveryMen.id, deliveryManId));

    return SuccessResponse(res, { message: "Logged out successfully" });
};

// ==========================================
// POST /delivery-man/auth/fcm-token
// Called by the app when Firebase refreshes the token (onTokenRefresh)
// ==========================================
export const updateFcmToken = async (req: Request, res: Response) => {
    const deliveryManId = req.user?.id;
    if (!deliveryManId) throw new UnauthorizedError("Not authenticated");

    const { fcmToken } = req.body;
    if (!fcmToken || typeof fcmToken !== "string" || !fcmToken.trim()) {
        throw new BadRequest("fcmToken is required");
    }

    await db
        .update(deliveryMen)
        .set({ fcmToken: fcmToken.trim() })
        .where(eq(deliveryMen.id, deliveryManId));

    return SuccessResponse(res, { message: "FCM token updated successfully" });
};