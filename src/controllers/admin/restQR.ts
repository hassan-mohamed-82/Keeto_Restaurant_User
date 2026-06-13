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
import redis from "../../config/redis";

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

        // 3. حفظ الـ QR كصورة فعلية بدل ما يتحفظ base64 في الداتابيز
        const savedQrUrl = await saveBase64Image(qrCodeBase64, req, "qrcodes");

        const id = uuidv4();
        await db.insert(restaurantsUrl).values({
            id,
            restaurantid: restaurantId,
            qrCodeImg: savedQrUrl,
        });

        // Invalidate cache since a new QR was generated
        await redis.del(`qr:${restaurantId}`);

         // 4. إرجاع الـ URL للصورة المحفوظة
        return SuccessResponse(res, {
            message: "QR Code generated successfully",
            data: {
                id,
                qrCodeImg: savedQrUrl,
            }
        }, 200);


};



export const getRestaurantQR = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant ID is required.");
    }
    
    const cacheKey = `qr:${restaurantId}`;
    const cachedData = await redis.get(cacheKey);

    if (cachedData) {
        return SuccessResponse(res, {
            message: "Restaurants fetched successfully (from cache)",
            data: JSON.parse(cachedData),
        }, 200);
    }

    const existingRestaurant = await db.select().from(restaurantsUrl).where(eq(restaurantsUrl.restaurantid, restaurantId));
    
    // Cache the result for 1 hour (3600 seconds)
    await redis.set(cacheKey, JSON.stringify(existingRestaurant), 'EX', 3600);

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
        const { id } = req.params;
    if (!id) {
        throw new BadRequest("id is required.");
    }
    const existingRestaurant = await db.select().from(restaurantsUrl).where(eq(restaurantsUrl.id, id));
    if (!existingRestaurant[0]) {
        throw new BadRequest("Restaurant QR not found.");
    }
    await db.delete(restaurantsUrl).where(eq(restaurantsUrl.id, id));
    
    // Invalidate cache after deletion
    await redis.del(`qr:${restaurantId}`);

    return SuccessResponse(res, {
        message: "Restaurants deleted successfully",
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