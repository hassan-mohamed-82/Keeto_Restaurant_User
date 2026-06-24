import { Request, Response } from "express";
import { db } from "../../models/connection";
import { expensscategory } from "../../models/schema/admin/expensscategory";
import { eq, and } from "drizzle-orm";
import { BadRequest, NotFound } from "../../Errors";
import { SuccessResponse } from "../../utils/response";

export const createExpenseCategory = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant context missing");

    const { name, arName } = req.body;

    await db.insert(expensscategory).values({
        restaurantid: restaurantId,
        name,
        arName,
    });

    return SuccessResponse(res, { message: "Expense category created successfully" }, 201);
};

export const getAllExpenseCategories = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant context missing");

    const categories = await db.select().from(expensscategory)
        .where(eq(expensscategory.restaurantid, restaurantId));

    return SuccessResponse(res, { message: "Expense categories fetched successfully", data: categories });
};

export const getExpenseCategoryById = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant context missing");

    const { id } = req.params;
    const [category] = await db.select().from(expensscategory)
        .where(and(eq(expensscategory.id, id), eq(expensscategory.restaurantid, restaurantId)))
        .limit(1);

    if (!category) throw new NotFound("Category not found");

    return SuccessResponse(res, { message: "Expense category fetched successfully", data: category });
};

export const updateExpenseCategory = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant context missing");

    const { id } = req.params;
    const { name, arName } = req.body;

    const [existing] = await db.select().from(expensscategory)
        .where(and(eq(expensscategory.id, id), eq(expensscategory.restaurantid, restaurantId)))
        .limit(1);
    if (!existing) throw new NotFound("Category not found");

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (arName !== undefined) updateData.arName = arName;

    await db.update(expensscategory).set(updateData).where(eq(expensscategory.id, id));

    return SuccessResponse(res, { message: "Expense category updated successfully" });
};

export const deleteExpenseCategory = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant context missing");

    const { id } = req.params;

    const [existing] = await db.select().from(expensscategory)
        .where(and(eq(expensscategory.id, id), eq(expensscategory.restaurantid, restaurantId)))
        .limit(1);
    if (!existing) throw new NotFound("Category not found");

    await db.delete(expensscategory).where(eq(expensscategory.id, id));

    return SuccessResponse(res, { message: "Expense category deleted successfully" });
};
