import { Request, Response } from "express";
import { restaurants } from "../../models/schema/admin/restaurants";
import { restaurantsUrl } from "../../models/schema/admin/restQR";
import { eq, and } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";
import QRCode from "qrcode";
import { saveBase64Image } from "../../utils/handleImages"; 
import { db } from "../../models/connection";

export const generateRestaurantQR = async (req: Request, res: Response) => {
    // 1. استلام اللينك من الـ body
    const { restaurantUrl } = req.body;

    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) {
        throw new BadRequest("Restaurant ID is required.");
    }
    
    if (!restaurantUrl) {
        throw new BadRequest("Restaurant URL is required.");
    }

        // 2. تحويل اللينك لـ QR Code (على هيئة Base64)
        const qrCodeBase64 = await QRCode.toDataURL(restaurantUrl);
        await db.insert(restaurantsUrl).values({
            id: uuidv4(),
            restaurantid: restaurantId,
            qrCodeImg: qrCodeBase64,
        });

         // 3. إرجاع الـ QR Code للمطعم
        return SuccessResponse(res, {
            message: "QR Code generated successfully",
            data: {
                qrCode: qrCodeBase64, // هيرجع كنص Base64 ممكن الفرونت اند يعرضه مباشرة في تاج <img>
                // qrUrl: savedQrUrl // لو قررت تحفظه وترجع اللينك
            }
        }, 200);


};



export const getRestaurantQR = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant ID is required.");
    }
    const existingRestaurant = await db.select().from(restaurantsUrl).where(eq(restaurantsUrl.restaurantid, restaurantId));
    if (existingRestaurant[0]) {
        throw new BadRequest("Restaurant QR already exists.");
    }
    return SuccessResponse(res, {
        message: "Restaurants fetched successfully",
        data: existingRestaurant,
    }, 200);
};


export const deletRestaurantQR = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant ID is required.");
    }
    const existingRestaurant = await db.select().from(restaurantsUrl).where(eq(restaurantsUrl.restaurantid, restaurantId));
    if (existingRestaurant[0]) {
        throw new BadRequest("Restaurant QR already exists.");
    }
    return SuccessResponse(res, {
        message: "Restaurants fetched successfully",
        data: existingRestaurant,
    }, 200);
};

export const updateRestaurantQR = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant ID is required.");
    }
    const existingRestaurant = await db.select().from(restaurantsUrl).where(eq(restaurantsUrl.restaurantid, restaurantId));
    if (existingRestaurant[0]) {
        throw new BadRequest("Restaurant QR already exists.");
    }
    return SuccessResponse(res, {
        message: "Restaurants fetched successfully",
        data: existingRestaurant,
    }, 200);
};

export const getRestaurantQRbyid = async (req: Request, res: Response) => {
    const id = req.params.id;

    if (!id) {
        throw new BadRequest("id is required.");
    }
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant ID is required.");
    }
    const existingRestaurant = await db.select().from(restaurantsUrl).where(and(eq(restaurantsUrl.id, id),eq(restaurantsUrl.restaurantid, restaurantId)));
    if (!existingRestaurant[0]) {
        throw new BadRequest("Restaurant QR not found.");
    }
    return SuccessResponse(res, {
        message: "Restaurants fetched successfully",
        data: existingRestaurant,
    }, 200);
};