import { Request, Response } from "express";
import { db } from "../../models/connection";
import { images } from "../../models/schema";
import { eq } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { NotFound } from "../../Errors/NotFound";
import { BadRequest } from "../../Errors/BadRequest";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { saveBase64Image, handleImageUpdate } from "../../utils/handleImages";

export const createImage = async (req: Request, res: Response) => {
    const { img } = req.body;
   const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    
    // 1. Swap 'req' and 'img' to match the parameter order in handleImages.ts
    const result = await saveBase64Image(img, req, "images");
    
    // 2. 'result' is a string (the URL), so we check 'result' directly instead of 'result.url'
    if (!result) {
        throw new BadRequest("Image is required.");
    }

    const id = uuidv4();
    await db.insert(images).values({
        id,
        restaurantid: restaurantId,
        img: result, // Use 'result' directly
    });

    return SuccessResponse(res, {
        message: "Image created successfully",
        data: {
            id,
            img: result // Use 'result' directly
        }
    }, 201);
};

export const getAllImages = async (req: Request, res: Response) => {
     const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }
    const image = await db.select().from(images).where(eq(images.restaurantid, restaurantId));
    return SuccessResponse(res, {
        message: "Images fetched successfully",
        data: image,
    }, 200);
};

export const deleteImage = async (req: Request, res: Response) => {
    const { id } = req.params;
      const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }
    const image = await db.select().from(images).where(eq(images.id, id));
    if (!image[0]) {
        throw new NotFound("Image not found");
    }
    if (image[0].restaurantid !== restaurantId) {
        throw new BadRequest("You are not authorized to delete this image");
    }
    await db.delete(images).where(eq(images.id, id));
    return SuccessResponse(res, {
        message: "Image deleted successfully",
    }, 200);
};


export const getImageById = async (req: Request, res: Response) => {
    const { id } = req.params;
      const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }
    const image = await db.select().from(images).where(eq(images.id, id));
    if (!image[0]) {
        throw new NotFound("Image not found");
    }
    if (image[0].restaurantid !== restaurantId) {
        throw new BadRequest("You are not authorized to get this image");
    }
    return SuccessResponse(res, {
        message: "Image fetched successfully",
        data: image[0],
    }, 200);
};

export const updateImage = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { img } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }
    const image = await db.select().from(images).where(eq(images.id, id));
    if (!image[0]) {
        throw new NotFound("Image not found");
    }
    if (image[0].restaurantid !== restaurantId) {
        throw new BadRequest("You are not authorized to update this image");
    }
    const updatedUrl = await handleImageUpdate(req, image[0].img, img, "images");
    if (!updatedUrl) {
        throw new BadRequest("Image is required.");
    }

    await db.update(images).set({
        img: updatedUrl,
    }).where(eq(images.id, id));

    return SuccessResponse(res, {
        message: "Image updated successfully",
        data: updatedUrl,
    }, 200);
};

