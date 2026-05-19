import { Request, Response } from "express";
import { db } from "../../models/connection";
import { popup } from "../../models/schema";
import { eq, and } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";

// ==========================================
// 1. Create Popup
// ==========================================
export const createPopup = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const {
        Title, TitleAr, TitleFr,
        description, descriptionAr, descriptionFr,
        image, imageAr, imageFr,
        type, status,
        startDate, endDate
    } = req.body;

    if (!Title) throw new BadRequest("Popup title is required");
    if (!startDate || !endDate) throw new BadRequest("Start date and end date are required");

    const id = uuidv4();

    await db.insert(popup).values({
        id,
        restaurantId,
        Title,
        TitleAr: TitleAr || null,
        TitleFr: TitleFr || null,
        description: description || null,
        descriptionAr: descriptionAr || null,
        descriptionFr: descriptionFr || null,
        image: image || null,
        imageAr: imageAr || null,
        imageFr: imageFr || null,
        type: type || "mykeeto_app",
        status: status || "active",
        startDate: new Date(startDate),
        endDate: new Date(endDate),
    });

    return SuccessResponse(res, { message: "Popup created successfully", data: { id } }, 201);
};

// ==========================================
// 2. Get All Popups (for this restaurant)
// ==========================================
export const getAllPopups = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const allPopups = await db
        .select()
        .from(popup)
        .where(eq(popup.restaurantId, restaurantId));

    return SuccessResponse(res, { message: "Get all popups success", data: allPopups });
};

// ==========================================
// 3. Get Popup by ID
// ==========================================
export const getPopupById = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const [existing] = await db
        .select()
        .from(popup)
        .where(and(eq(popup.id, id), eq(popup.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) throw new NotFound("Popup not found");

    return SuccessResponse(res, { message: "Get popup success", data: existing });
};

// ==========================================
// 4. Update Popup
// ==========================================
export const updatePopup = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const [existing] = await db
        .select()
        .from(popup)
        .where(and(eq(popup.id, id), eq(popup.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) throw new NotFound("Popup not found");

    const {
        Title, TitleAr, TitleFr,
        description, descriptionAr, descriptionFr,
        image, imageAr, imageFr,
        type, status,
        startDate, endDate
    } = req.body;

    const updateData: any = { updatedAt: new Date() };

    if (Title !== undefined) updateData.Title = Title;
    if (TitleAr !== undefined) updateData.TitleAr = TitleAr;
    if (TitleFr !== undefined) updateData.TitleFr = TitleFr;
    if (description !== undefined) updateData.description = description;
    if (descriptionAr !== undefined) updateData.descriptionAr = descriptionAr;
    if (descriptionFr !== undefined) updateData.descriptionFr = descriptionFr;
    if (image !== undefined) updateData.image = image;
    if (imageAr !== undefined) updateData.imageAr = imageAr;
    if (imageFr !== undefined) updateData.imageFr = imageFr;
    if (type !== undefined) updateData.type = type;
    if (status !== undefined) updateData.status = status;
    if (startDate !== undefined) updateData.startDate = new Date(startDate);
    if (endDate !== undefined) updateData.endDate = new Date(endDate);

    await db.update(popup).set(updateData).where(eq(popup.id, id));

    return SuccessResponse(res, { message: "Popup updated successfully" });
};

// ==========================================
// 5. Delete Popup
// ==========================================
export const deletePopup = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const [existing] = await db
        .select()
        .from(popup)
        .where(and(eq(popup.id, id), eq(popup.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) throw new NotFound("Popup not found");

    await db.delete(popup).where(eq(popup.id, id));

    return SuccessResponse(res, { message: "Popup deleted successfully" });
};

// ==========================================
// 6. Toggle Popup Status
// ==========================================
export const togglePopupStatus = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const [existing] = await db
        .select()
        .from(popup)
        .where(and(eq(popup.id, id), eq(popup.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) throw new NotFound("Popup not found");

    const newStatus = existing.status === "active" ? "inactive" : "active";

    await db.update(popup)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(popup.id, id));

    return SuccessResponse(res, {
        message: `Popup ${newStatus === "active" ? "activated" : "deactivated"} successfully`,
        data: { status: newStatus }
    });
};
