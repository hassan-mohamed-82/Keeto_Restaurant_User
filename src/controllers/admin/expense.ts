import { Request, Response, NextFunction } from "express";
import { db } from "../../models/connection";
import { expenss } from "../../models/schema";
import { eq, and } from "drizzle-orm";
import { BadRequest, NotFound } from "../../Errors";
import { SuccessResponse } from "../../utils/response";

export const createExpense = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant context missing");

    const { name, amount, categoryId, shiftId, cashierId, cashiermanId, note, paymentmethodId } = req.body;

    await db.insert(expenss).values({
        restrauntid: restaurantId,
        name,
        amount,
        categoryId,
        shiftId,
        cashierId,
        cashiermanId,
        note,
        paymentmethodId
    });

    return SuccessResponse(res, { message: "Expense created successfully" }, 201);
};

export const getAllExpenses = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant context missing");

    const expenses = await db.select().from(expenss)
        .where(eq(expenss.restrauntid, restaurantId));

    return SuccessResponse(res, { message: "Expenses fetched successfully", data: expenses });
};

export const getExpenseById = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant context missing");

    const { id } = req.params;
    const [expense] = await db.select().from(expenss)
        .where(and(eq(expenss.id, id), eq(expenss.restrauntid, restaurantId)))
        .limit(1);

    if (!expense) throw new NotFound("Expense not found");

    return SuccessResponse(res, { message: "Expense fetched successfully", data: expense });
};

export const updateExpense = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant context missing");

    const { id } = req.params;
    const { name, amount, categoryId, shiftId, cashierId, cashiermanId, note, paymentmethodId } = req.body;

    const [existing] = await db.select().from(expenss)
        .where(and(eq(expenss.id, id), eq(expenss.restrauntid, restaurantId)))
        .limit(1);
    if (!existing) throw new NotFound("Expense not found");

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (amount !== undefined) updateData.amount = amount;
    if (categoryId !== undefined) updateData.categoryId = categoryId;
    if (shiftId !== undefined) updateData.shiftId = shiftId;
    if (cashierId !== undefined) updateData.cashierId = cashierId;
    if (cashiermanId !== undefined) updateData.cashiermanId = cashiermanId;
    if (note !== undefined) updateData.note = note;
    if (paymentmethodId !== undefined) updateData.paymentmethodId = paymentmethodId;

    await db.update(expenss).set(updateData).where(eq(expenss.id, id));

    return SuccessResponse(res, { message: "Expense updated successfully" });
};

export const deleteExpense = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant context missing");

    const { id } = req.params;

    const [existing] = await db.select().from(expenss)
        .where(and(eq(expenss.id, id), eq(expenss.restrauntid, restaurantId)))
        .limit(1);
    if (!existing) throw new NotFound("Expense not found");

    await db.delete(expenss).where(eq(expenss.id, id));

    return SuccessResponse(res, { message: "Expense deleted successfully" });
};
