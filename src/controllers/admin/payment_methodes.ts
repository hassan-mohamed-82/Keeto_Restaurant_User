import { Request, Response } from "express";
import { db } from "../../models/connection";
import { paymentMethods } from "../../models/schema";
import { eq } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors";
import { saveBase64Image, handleImageUpdate } from "../../utils/handleImages";

export const createPaymentMethod = async (req: Request, res: Response) => {
    const { name, image, description, type, isActive, nameAr, nameFr, descriptionAr, descriptionFr } = req.body;
    if(!name  || !description || !type ){
        throw new BadRequest("Missing required fields");
    }

    let savedImage = image;
    if (image && image.startsWith("data:image")) {
        savedImage = await saveBase64Image(image, req, "payment_methods");
    }

    const [paymentMethod] = await db.insert(paymentMethods).values({
        name,
        nameAr,
        nameFr,
        image: savedImage,
        description,
        descriptionAr,
        descriptionFr,
        type,
        isActive:isActive || true,
    })
    return SuccessResponse(res, { data: paymentMethod });
};
export const updatePaymentMethod = async (req: Request, res: Response) => {
    const { id, name, image, description, type, isActive, nameAr, nameFr, descriptionAr, descriptionFr } = req.body;
    const updateData: any = {};
    
    const existing = await db.select().from(paymentMethods).where(eq(paymentMethods.id, id)).limit(1);

    if (name !== undefined) updateData.name = name;
    if (nameAr !== undefined) updateData.nameAr = nameAr;
    if (nameFr !== undefined) updateData.nameFr = nameFr;
    
    if (image && image.startsWith("data:image")) {
        updateData.image = await handleImageUpdate(req, existing[0]?.image, image, "payment_methods");
    } else if (image !== undefined) {
        updateData.image = image;
    }

    if (description !== undefined) updateData.description = description;
    if (descriptionAr !== undefined) updateData.descriptionAr = descriptionAr;
    if (descriptionFr !== undefined) updateData.descriptionFr = descriptionFr;
    if (type !== undefined) updateData.type = type;
    if (isActive !== undefined) updateData.isActive = isActive;
    
    const [paymentMethod] = await db.update(paymentMethods).set(updateData).where(eq(paymentMethods.id, id));
    return SuccessResponse(res, { data: paymentMethod });
};
export const deletePaymentMethod = async (req: Request, res: Response) => {
    const { id } = req.body;
    const [paymentMethod] = await db.delete(paymentMethods).where(eq(paymentMethods.id, id));
    return SuccessResponse(res, { data: paymentMethod });
};
export const getPaymentMethods = async (req: Request, res: Response) => {
    const paymentMethod = await db.select().from(paymentMethods);
    return SuccessResponse(res, { data: paymentMethod });
};
export const getPaymentMethod = async (req: Request, res: Response) => {
    const { id } = req.params;
    const [paymentMethod] = await db.select().from(paymentMethods).where(eq(paymentMethods.id, id));
    return SuccessResponse(res, { data: paymentMethod });
};
