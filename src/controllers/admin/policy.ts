import { Request, Response } from "express";
import { db } from "../../models/connection";
import { policy } from "../../models/schema";
import { eq, and } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors";
// قم بإضافة هذه المكتبة لتوليد معرف فريد (إذا كان الـ ID الخاص بك عبارة عن String)
import crypto from "crypto"; 

export const createRestaurantPolicy = async (
    req: Request,
    res: Response
) => {
    const { title, description } = req.body;

    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    if (!title || !description) {
        throw new BadRequest("Missing required fields");
    }

    // توليد معرف جديد (ID) للبوليسي
    const newPolicyId = crypto.randomUUID();

    await db
        .insert(policy)
        .values({
            id: newPolicyId, // إدخال الـ ID هنا
            title,
            description,
            type: "restaurant",
            restaurantId,
        });

    // جلب البوليسي بعد إنشائها لإرجاعها في الـ Response بشكل صحيح
    const [newPolicy] = await db
        .select()
        .from(policy)
        .where(eq(policy.id, newPolicyId));

    return SuccessResponse(res, {
        data: newPolicy,
    });
};

export const updateRestaurantPolicy = async (
    req: Request,
    res: Response
) => {
    const { id } = req.params;
    const { title, description } = req.body;

    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    await db
        .update(policy)
        .set({
            title,
            description,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(policy.id, id),
                eq(policy.type, "restaurant"),
                eq(policy.restaurantId, restaurantId)
            )
        );

    return SuccessResponse(res, {
        message: "Restaurant policy updated",
    });
};

export const deleteRestaurantPolicy = async (
    req: Request,
    res: Response
) => {
    const { id } = req.params;

    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    await db
        .delete(policy)
        .where(
            and(
                eq(policy.id, id),
                eq(policy.type, "restaurant"),
                eq(policy.restaurantId, restaurantId)
            )
        );

    return SuccessResponse(res, {
        message: "Restaurant policy deleted",
    });
};

export const getRestaurantPolicies = async (
    req: Request,
    res: Response
) => {
    // تم التعديل هنا: استخدام req.user بدلاً من req.params لضمان جلب بيانات المطعم الصحيح
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const policies = await db
        .select()
        .from(policy)
        .where(
            and(
                eq(policy.type, "restaurant"),
                eq(policy.restaurantId, restaurantId)
            )
        );

    return SuccessResponse(res, {
        data: policies,
    });
};

export const getRestaurantPolicyById = async (
    req: Request,
    res: Response
) => {
    const { id } = req.params;

    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const [restaurantPolicy] = await db
        .select()
        .from(policy)
        .where(
            and(
                eq(policy.id, id),
                eq(policy.type, "restaurant"),
                eq(policy.restaurantId, restaurantId)
            )
        );

    if (!restaurantPolicy) throw new BadRequest("Policy not found");

    return SuccessResponse(res, {
        data: restaurantPolicy,
    });
};