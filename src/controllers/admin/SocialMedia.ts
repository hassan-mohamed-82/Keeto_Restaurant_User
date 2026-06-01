import { Request, Response } from "express";
import { socialmedia } from "../../models/schema/admin/SocialMedia";
import { eq } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";
import { saveBase64Image } from "../../utils/handleImages";
import { db } from "../../models/connection";

export const addSocialMedia = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId;
    const { link, icon } = req.body;

    if (!restaurantId) {
        throw new BadRequest("Restaurant ID is required");
    }
    if (!link) {
        throw new BadRequest("Link is required");
    }
    if (!icon) {
        throw new BadRequest("Icon is required");
    }
    const iconUrl = await saveBase64Image(icon, req,"icons");
    const socialMediaId = uuidv4();
    await db.insert(socialmedia).values({
        id: socialMediaId,
        restaurantid: restaurantId,
        link: link,
        icon: icon,
    });

    return SuccessResponse(res, { message: "Social media added successfully", data: { id: socialMediaId } }, 201);
};

export const getSocialMedia = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId;
    if (!restaurantId) {
        throw new BadRequest("Restaurant ID is required");
    }
    const socialMedia = await db.select().from(socialmedia).where(eq(socialmedia.restaurantid, restaurantId));
    return SuccessResponse(res, { message: "Social media fetched successfully", data: socialMedia }, 200);

};


export const getSocialMediaById = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId;
    if (!restaurantId) {
        throw new BadRequest("Restaurant ID is required");
    }
    const socialMedia = await db.select().from(socialmedia).where(eq(socialmedia.restaurantid, restaurantId));
    return SuccessResponse(res, { message: "Social media fetched successfully", data: socialMedia }, 200);

};



export const updateSocialMedia = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId;
    const { link, icon } = req.body;
    if (!restaurantId) {
        throw new BadRequest("Restaurant ID is required");
    }
    if (!link) {
        throw new BadRequest("Link is required");
    }
    if (!icon) {
        throw new BadRequest("Icon is required");
    }
    const iconUrl = await saveBase64Image(icon, req, "icons");
    await db.update(socialmedia).set({
        link: link,
        icon: icon,
    }).where(eq(socialmedia.restaurantid, restaurantId));
    return SuccessResponse(res, { message: "Social media updated successfully", data: { id } }, 200);
};


export const deleteSocialMedia = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId;
    if (!restaurantId) {
        throw new BadRequest("Restaurant ID is required");
    }
    await db.delete(socialmedia).where(eq(socialmedia.restaurantid, restaurantId));
    return SuccessResponse(res, { message: "Social media deleted successfully", data: { id } }, 200);
};