import { Request, Response } from "express";
import { FinancialAccounts, branches, restaurants } from "../../models/schema";
import { db } from "../../models/connection";
import { eq, and } from "drizzle-orm"; // تم إضافة and هنا
import { NotFound } from "../../Errors";
import { BadRequest } from "../../Errors";
import { SuccessResponse } from "../../utils/response";
import { saveBase64Image, handleImageUpdate } from "../../utils/handleImages";
import { UnauthorizedError } from "../../Errors";

export const createFinancialAccount = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id; 
    if (!restaurantId) throw new UnauthorizedError("Unauthorized");
    
    const { name, branchId, isActive, imageUrl, balance, in_POS } = req.body;

    if (!name || !restaurantId || !branchId) {
        throw new BadRequest("Missing required fields");
    }
    
    let FinalImage = imageUrl;
    if (imageUrl && imageUrl.startsWith("data:image")) {
        FinalImage = await saveBase64Image(imageUrl, req, "financialAccounts");
    }

    const financialAccount = await db.insert(FinancialAccounts).values({
        name,
        restaurantId,
        branchId,
        isActive: isActive ?? true,
        imageUrl: FinalImage,
        balance: balance ?? 0,
        in_POS: in_POS ?? true
    });
    
    SuccessResponse(res, financialAccount);
}

export const updateFinancialAccount = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id; 
    if (!restaurantId) throw new UnauthorizedError("Unauthorized");
    
    const { id, name, branchId, isActive, imageUrl, balance, in_POS } = req.body;

    if (!id || !name || !branchId ) {
        throw new BadRequest("Missing required fields");
    }
    
    let FinalImage = imageUrl;
    if (imageUrl && imageUrl.startsWith("data:image")) {
        FinalImage = await saveBase64Image(imageUrl, req, "financialAccounts");
    }

    // تم إضافة شرط and للتأكد من ملكية المطعم
    const financialAccount = await db.update(FinancialAccounts).set({
        name,
        branchId,
        isActive: isActive ?? true,
        imageUrl: FinalImage,
        balance: balance ?? 0,
        in_POS: in_POS ?? true
    }).where(
        and(
            eq(FinancialAccounts.id, id),
            eq(FinancialAccounts.restaurantId, restaurantId)
        )
    );
    
    SuccessResponse(res, financialAccount);
}

export const updateFinancialAccountStatus = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id; 
    if (!restaurantId) throw new UnauthorizedError("Unauthorized");
    
    const { id } = req.params;
    const { isActive } = req.body;

    if (isActive === undefined) {
        throw new BadRequest("Missing required field: isActive");
    }

    const financialAccount = await db.update(FinancialAccounts).set({
        isActive
    }).where(
        and(
            eq(FinancialAccounts.id, id),
            eq(FinancialAccounts.restaurantId, restaurantId)
        )
    );
    
    SuccessResponse(res, { message: "Status updated successfully", data: financialAccount });
}


export const getAllFinancialAccounts = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id; 
    if (!restaurantId) throw new UnauthorizedError("Unauthorized");
    
    const financialAccounts = await db
        .select({
            account: FinancialAccounts,
            branch: branches,
            restaurant: restaurants
        })
        .from(FinancialAccounts)
        .leftJoin(branches, eq(FinancialAccounts.branchId, branches.id))
        .leftJoin(restaurants, eq(FinancialAccounts.restaurantId, restaurants.id))
        .where(eq(FinancialAccounts.restaurantId, restaurantId));
        
    SuccessResponse(res, financialAccounts);
}

export const getFinancialAccount = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new UnauthorizedError("Unauthorized");
    
    const { id } = req.params;
    
    const financialAccount = await db
        .select({
            account: FinancialAccounts,
            branch: branches,
            restaurant: restaurants
        })
        .from(FinancialAccounts)
        .leftJoin(branches, eq(FinancialAccounts.branchId, branches.id))
        .leftJoin(restaurants, eq(FinancialAccounts.restaurantId, restaurants.id))
        .where(
            and(
                eq(FinancialAccounts.id, id),
                eq(FinancialAccounts.restaurantId, restaurantId)
            )
        );
    
    SuccessResponse(res, financialAccount);
}
export const deleteFinancialAccount = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id; 
    if (!restaurantId) throw new UnauthorizedError("Unauthorized");
    
    const { id } = req.params;
    
    // تم إضافة شرط and للتأكد من ملكية المطعم
    const financialAccount = await db.delete(FinancialAccounts).where(
        and(
            eq(FinancialAccounts.id, id),
            eq(FinancialAccounts.restaurantId, restaurantId)
        )
    );
    
    SuccessResponse(res, financialAccount);
}

export const selectbranch = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id; 
    if (!restaurantId) throw new UnauthorizedError("Unauthorized");
    
    const branch = await db.select().from(branches).where(eq(branches.restaurantId, restaurantId));
    SuccessResponse(res, branch);
}