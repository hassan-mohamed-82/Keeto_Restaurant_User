import { Request, Response } from "express";
import { socialmedia, platforms } from "../../models/schema";
import { eq, and } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../models/connection";

export const selectPlatform = async (req: Request, res: Response) => {
    const result = await db
        .select({
            id: platforms.id,
            name: platforms.name,
            logo: platforms.logo,
        })
        .from(platforms);
    return SuccessResponse(res, { message: "Platform fetched successfully", data: result }, 200);
};

export const addSocialMedia = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const { link, platformId } = req.body;

    if (!restaurantId) {
        throw new BadRequest("Restaurant ID is required");
    }
    if (!link) {
        throw new BadRequest("Link is required");
    }
    if (!platformId) {
        throw new BadRequest("Platform ID is required");
    }

    // التحقق من وجود المنصة
    const [platform] = await db
        .select()
        .from(platforms)
        .where(eq(platforms.id, platformId))
        .limit(1);

    if (!platform) {
        throw new NotFound("Selected platform does not exist");
    }

    const socialMediaId = uuidv4();
    await db.insert(socialmedia).values({
        id: socialMediaId,
        restaurantid: restaurantId,
        platformId: platformId,
        link: link,
    });

    return SuccessResponse(
        res,
        { message: "Social media added successfully", data: { id: socialMediaId } },
        201
    );
};

export const getSocialMedia = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant ID is required");
    }

    const result = await db
        .select({
            id: socialmedia.id,
            restaurantId: socialmedia.restaurantid,
            link: socialmedia.link,
            createdAt: socialmedia.createdAt,
            updatedAt: socialmedia.updatedAt,
            platform: {
                id: platforms.id,
                name: platforms.name,
                logo: platforms.logo,
            },
        })
        .from(socialmedia)
        .innerJoin(platforms, eq(socialmedia.platformId, platforms.id))
        .where(eq(socialmedia.restaurantid, restaurantId));

    return SuccessResponse(
        res,
        { message: "Social media fetched successfully", data: result },
        200
    );
};

export const getSocialMediaById = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant ID is required");
    }

    const [result] = await db
        .select({
            id: socialmedia.id,
            restaurantId: socialmedia.restaurantid,
            link: socialmedia.link,
            createdAt: socialmedia.createdAt,
            updatedAt: socialmedia.updatedAt,
            platform: {
                id: platforms.id,
                name: platforms.name,
                logo: platforms.logo,
            },
        })
        .from(socialmedia)
        .innerJoin(platforms, eq(socialmedia.platformId, platforms.id))
        .where(and(eq(socialmedia.id, id), eq(socialmedia.restaurantid, restaurantId)))
        .limit(1);

    if (!result) {
        throw new NotFound("Social media record not found");
    }

    return SuccessResponse(
        res,
        { message: "Social media fetched successfully", data: result },
        200
    );
};

export const updateSocialMedia = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const { link, platformId } = req.body;

    if (!restaurantId) {
        throw new BadRequest("Restaurant ID is required");
    }

    const [existing] = await db
        .select()
        .from(socialmedia)
        .where(and(eq(socialmedia.id, id), eq(socialmedia.restaurantid, restaurantId)))
        .limit(1);

    if (!existing) {
        throw new NotFound("Social media record not found");
    }

    if (platformId) {
        const [platform] = await db
            .select()
            .from(platforms)
            .where(eq(platforms.id, platformId))
            .limit(1);

        if (!platform) {
            throw new NotFound("Selected platform does not exist");
        }
    }

    await db
        .update(socialmedia)
        .set({
            ...(link && { link }),
            ...(platformId && { platformId }),
        })
        .where(and(eq(socialmedia.id, id), eq(socialmedia.restaurantid, restaurantId)));

    return SuccessResponse(
        res,
        { message: "Social media updated successfully", data: { id } },
        200
    );
};

export const deleteSocialMedia = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) {
        throw new BadRequest("Restaurant ID is required");
    }

    const [existing] = await db
        .select()
        .from(socialmedia)
        .where(and(eq(socialmedia.id, id), eq(socialmedia.restaurantid, restaurantId)))
        .limit(1);

    if (!existing) {
        throw new NotFound("Social media record not found");
    }

    await db
        .delete(socialmedia)
        .where(and(eq(socialmedia.id, id), eq(socialmedia.restaurantid, restaurantId)));

    return SuccessResponse(
        res,
        { message: "Social media deleted successfully", data: { id } },
        200
    );
};