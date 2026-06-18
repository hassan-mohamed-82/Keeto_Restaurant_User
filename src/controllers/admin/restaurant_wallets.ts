import { Request, Response } from "express";
import { db } from "../../models/connection";
import { restaurantWallets, restaurantWalletTransactions } from "../../models/schema";
import { eq, desc } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";
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


// ==========================================
// 3. REQUEST WITHDRAWAL (Restaurant App)
// ==========================================
export const requestWithdrawal = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const { amount } = req.body;

    if (!restaurantId) throw new BadRequest("Restaurant context missing");

    const requestedAmount = parseFloat(amount);
    if (!requestedAmount || requestedAmount <= 0) {
        throw new BadRequest("Invalid requested amount");
    }

    const [wallet] = await db.select().from(restaurantWallets).where(eq(restaurantWallets.restaurantId, restaurantId)).limit(1);
    if (!wallet) throw new NotFound("Wallet not found");

    const currentBalance = parseFloat(wallet.balance as string || "0");
    const currentPending = parseFloat(wallet.pendingWithdraw as string || "0");

    // 🛡️ لازم نتأكد إن المطعم عنده رصيد إيجابي يغطي المبلغ اللي طالبه
    if (requestedAmount > currentBalance) {
        throw new BadRequest("Insufficient balance to request this withdrawal");
    }

    const newBalance = currentBalance - requestedAmount;
    const newPending = currentPending + requestedAmount;

    await db.transaction(async (tx) => {
        // 1. نخصم من الرصيد الأساسي ونحط في الـ Pending
        await tx.update(restaurantWallets)
            .set({ 
                balance: newBalance.toFixed(2),
                pendingWithdraw: newPending.toFixed(2)
            })
            .where(eq(restaurantWallets.restaurantId, restaurantId));

        // 2. نسجل الحركة
        await tx.insert(restaurantWalletTransactions).values({
            id: uuidv4(),
            restaurantId,
            type: "withdraw_request", // ضيف النوع ده للـ Enum عندك
            amount: `-${requestedAmount.toFixed(2)}`,
            balanceBefore: currentBalance.toFixed(2),
            balanceAfter: newBalance.toFixed(2),
            method: "bank", 
            note: "Restaurant requested a withdrawal",
            createdAt: new Date()
        });
    });

    return SuccessResponse(res, { message: "Withdrawal request submitted successfully" });
};