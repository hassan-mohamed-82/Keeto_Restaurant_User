import { Request, Response } from "express";
import { db } from "../../models/connection";
import { cashiers,FinancialAccounts } from "../../models/schema";
import { eq, and } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest, NotFound } from "../../Errors";

export const createCashier = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant context missing");

    const { name, ar_name, status, branchid, cashier_active, financialAccountId } = req.body;

    if (!name || !branchid || !financialAccountId) {
        throw new BadRequest("Missing required fields: name, branchid, financialAccountId");
    }

    await db.insert(cashiers).values({
        restaurantid: restaurantId,
        name,
        ar_name,
        status: status || "active",
        branchid,
        cashier_active: cashier_active !== undefined ? cashier_active : true,
          financialAccountId  ,
    });

    return SuccessResponse(res, { message: "Cashier created successfully" }, 201);
};

export const getCashiers = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant context missing");

    const allCashiers = await db.select().from(cashiers)
        .where(eq(cashiers.restaurantid, restaurantId))
        .innerJoin(FinancialAccounts, eq(cashiers.financialAccountId, FinancialAccounts.id));


    return SuccessResponse(res, { message: "Cashiers fetched successfully", data: allCashiers });
};

export const getCashierById = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant context missing");

    const { id } = req.params;
    const [cashier] = await db.select().from(cashiers)
        .where(and(eq(cashiers.id, id), eq(cashiers.restaurantid, restaurantId)))
        .innerJoin(FinancialAccounts, eq(cashiers.financialAccountId, FinancialAccounts.id))
        .limit(1);

    if (!cashier) throw new NotFound("Cashier not found");

    return SuccessResponse(res, { message: "Cashier fetched successfully", data: cashier });
};

export const updateCashier = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant context missing");

    const { id } = req.params;
    const { name, ar_name, status, branchid, cashier_active, paymentmethodid } = req.body;

    const [existing] = await db.select().from(cashiers)
        .where(and(eq(cashiers.id, id), eq(cashiers.restaurantid, restaurantId)))
        .limit(1);
    if (!existing) throw new NotFound("Cashier not found");

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (ar_name !== undefined) updateData.ar_name = ar_name;
    if (status !== undefined) updateData.status = status;
    if (branchid !== undefined) updateData.branchid = branchid;
    if (cashier_active !== undefined) updateData.cashier_active = cashier_active;
    if (paymentmethodid !== undefined) updateData.paymentmethodid = paymentmethodid;

    await db.update(cashiers).set(updateData).where(eq(cashiers.id, id));

    return SuccessResponse(res, { message: "Cashier updated successfully" });
};

export const deleteCashier = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant context missing");

    const { id } = req.params;

    const [existing] = await db.select().from(cashiers)
        .where(and(eq(cashiers.id, id), eq(cashiers.restaurantid, restaurantId)))
        .limit(1);
    if (!existing) throw new NotFound("Cashier not found");

    await db.delete(cashiers).where(eq(cashiers.id, id));

    return SuccessResponse(res, { message: "Cashier deleted successfully" });
};


export const getActiveCashiers = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant context missing");

    const allCashiers = await db.select().from(cashiers)
        .where(and(eq(cashiers.restaurantid, restaurantId), eq(cashiers.status, "active")));

    const activefinicialaccounts=await db.select().from(FinancialAccounts)
        .where(and(eq(FinancialAccounts.restaurantId, restaurantId), eq(FinancialAccounts.isActive, true)));
    return SuccessResponse(res, { message: "Cashiers fetched successfully", data: {allCashiers,activefinicialaccounts} });
};