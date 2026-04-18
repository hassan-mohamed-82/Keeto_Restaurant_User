import { Request, Response } from "express";
import { db } from "../../models/connection";
import { restaurantWallets, restaurantWalletTransactions } from "../../models/schema";
import { eq, desc } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";

// ==========================================
// 1. جلب ملخص محفظة المطعم (الأرصدة)
// ==========================================
export const getMyWallet = async (req: Request, res: Response) => {
    // 1. تحديد هوية المطعم
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const branchId = req.user?.branchId; // لو ده موجود، يبقى ده مدير فرع

    if (!restaurantId) throw new BadRequest("Restaurant context missing");

    // 🛡️ حماية مالية: نمنع مديري الفروع من رؤية محفظة المطعم الأساسية
    if (branchId) {
        throw new BadRequest("Unauthorized: Only restaurant owners can view wallet data");
    }

    // 2. جلب بيانات المحفظة
    const [wallet] = await db.select()
        .from(restaurantWallets)
        .where(eq(restaurantWallets.restaurantId, restaurantId))
        .limit(1);

    if (!wallet) {
        throw new NotFound("Wallet not found for this restaurant");
    }

    return SuccessResponse(res, { 
        message: "Get wallet details success", 
        data: wallet 
    });
};

// ==========================================
// 2. جلب سجل حركات المحفظة (Transactions History)
// ==========================================
export const getMyWalletTransactions = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const branchId = req.user?.branchId; 

    if (!restaurantId) throw new BadRequest("Restaurant context missing");

    // 🛡️ حماية مالية: نفس نظام الحماية
    if (branchId) {
        throw new BadRequest("Unauthorized: Only restaurant owners can view transaction history");
    }

    // 2. جلب سجل الحركات وترتيبه من الأحدث للأقدم
    const transactions = await db.select()
        .from(restaurantWalletTransactions)
        .where(eq(restaurantWalletTransactions.restaurantId, restaurantId))
        .orderBy(desc(restaurantWalletTransactions.createdAt));

    return SuccessResponse(res, { 
        message: "Get wallet transactions success", 
        data: transactions 
    });
};