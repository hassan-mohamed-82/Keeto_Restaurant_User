import { Request, Response } from "express";
import { db } from "../../models/connection";
import { policy } from "../../models/schema";
import { eq ,and} from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors";
import { saveBase64Image } from "../../utils/handleImages";

export const createRestaurantPolicy = async (
    req: Request,
    res: Response
) => {

    const { title, description } = req.body;

    const restaurantId =
        req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    if (!title || !description) {
        throw new BadRequest(
            "Missing required fields"
        );
    }

    const [newPolicy] = await db
        .insert(policy)
        .values({

            title,

            description,

            type: "restaurant",

            restaurantId,
        });

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
        message:
            "Restaurant policy updated",
    });
};
export const deleteRestaurantPolicy = async (
    req: Request,
    res: Response
) => {

    const { id } = req.params;

    const restaurantId =
        req.user?.restaurantId || req.user?.id;
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
        message:
            "Restaurant policy deleted",
    });
};
export const getRestaurantPolicies = async (
    req: Request,
    res: Response
) => {

    const { restaurantId } = req.params;

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

    const [policies] = await db
        .select()
        .from(policy)
        .where(
            and(
                eq(policy.id, id),
                eq(policy.type, "restaurant"),
                eq(policy.restaurantId, restaurantId)
            )
        );

    if (!policies) throw new BadRequest("Policy not found");

    return SuccessResponse(res, {
        data: policies,
    });
};

