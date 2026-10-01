import { Request, Response } from "express";
import { db } from "../../models/connection";
import {
    restaurantWallets,
    restaurantWalletTransactions,
    restaurantBusinessPlans,
    restaurantSettings,
    orders
} from "../../models/schema";
import { eq, desc, or, and } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";

/**
 * دالة مساعدة لجلب حركات المحفظة مربوطة ببيانات الأوردر (dailyOrderNumber, orderNumber, ...)
 * إذا كان نوع الحركة order_payment
 */
async function getWalletTransactionsWithOrderDetails(restaurantId: string, limit?: number) {
    const query = db
        .select({
            id: restaurantWalletTransactions.id,
            restaurantId: restaurantWalletTransactions.restaurantId,
            orderId: restaurantWalletTransactions.orderId,
            type: restaurantWalletTransactions.type,
            amount: restaurantWalletTransactions.amount,
            balanceBefore: restaurantWalletTransactions.balanceBefore,
            balanceAfter: restaurantWalletTransactions.balanceAfter,
            method: restaurantWalletTransactions.method,
            reference: restaurantWalletTransactions.reference,
            serviceFee: restaurantWalletTransactions.serviceFee,
            commission: restaurantWalletTransactions.commission,
            orderAmount: restaurantWalletTransactions.orderAmount,
            note: restaurantWalletTransactions.note,
            createdAt: restaurantWalletTransactions.createdAt,
            order: {
                id: orders.id,
                orderNumber: orders.orderNumber,
                dailyOrderNumber: orders.dailyOrderNumber,
                status: orders.status,
                orderType: orders.orderType,
                orderSource: orders.orderSource,
                totalAmount: orders.totalAmount,
                createdAt: orders.createdAt,
            }
        })
        .from(restaurantWalletTransactions)
        .leftJoin(orders, or(
            eq(restaurantWalletTransactions.orderId, orders.id),
            and(
                eq(restaurantWalletTransactions.type, "order_payment"),
                eq(restaurantWalletTransactions.reference, orders.orderNumber)
            )
        ))
        .where(eq(restaurantWalletTransactions.restaurantId, restaurantId))
        .orderBy(desc(restaurantWalletTransactions.createdAt));

    const rows = limit ? await query.limit(limit) : await query;

    return rows.map(r => ({
        id: r.id,
        restaurantId: r.restaurantId,
        orderId: r.orderId || (r.order?.id ?? null),
        type: r.type,
        amount: r.amount,
        balanceBefore: r.balanceBefore,
        balanceAfter: r.balanceAfter,
        method: r.method,
        reference: r.reference,
        serviceFee: r.serviceFee,
        commission: r.commission,
        orderAmount: r.orderAmount,
        note: r.note,
        createdAt: r.createdAt,
        // إذا كان نوع الحركة order_payment يتم إرجاع تفاصيل الأوردر مع dailyOrderNumber
        order: (r.type === "order_payment" && r.order?.id) ? {
            id: r.order.id,
            orderNumber: r.order.orderNumber,
            dailyOrderNumber: r.order.dailyOrderNumber,
            status: r.order.status,
            orderType: r.order.orderType,
            orderSource: r.order.orderSource,
            totalAmount: r.order.totalAmount,
            createdAt: r.order.createdAt,
        } : null
    }));
}

// ==========================================
// 1. جلب تفاصيل محفظة المطعم الشاملة (الأرصدة + الرسوم + العمولات + الاشتراكات)
// ==========================================
export const getMyWallet = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const branchId = req.user?.branchId; // لو موجود يبقى مدير فرع

    if (!restaurantId) throw new BadRequest("Restaurant context missing");

    // 🛡️ حماية مالية: نمنع مديري الفروع من رؤية محفظة المطعم الأساسية
    if (branchId) {
        throw new BadRequest("Unauthorized: Only restaurant owners can view wallet data");
    }

    // 1. جلب بيانات المحفظة
    const [wallet] = await db.select()
        .from(restaurantWallets)
        .where(eq(restaurantWallets.restaurantId, restaurantId))
        .limit(1);

    if (!wallet) {
        throw new NotFound("Wallet not found for this restaurant");
    }

    // 2. جلب خطط العمل الفعّالة للمطعم لاستخراج الاشتراكات والعمولات الجارية
    const activePlans = await db
        .select({
            platformType: restaurantBusinessPlans.platformType,
            isMonthlyActive: restaurantBusinessPlans.isMonthlyActive,
            monthlyAmount: restaurantBusinessPlans.monthlyAmount,
            isQuarterlyActive: restaurantBusinessPlans.isQuarterlyActive,
            quarterlyAmount: restaurantBusinessPlans.quarterlyAmount,
            isAnnuallyActive: restaurantBusinessPlans.isAnnuallyActive,
            annuallyAmount: restaurantBusinessPlans.annuallyAmount,
            commissionRate: restaurantBusinessPlans.commissionRate,
            serviceFee: restaurantBusinessPlans.serviceFee,
        })
        .from(restaurantBusinessPlans)
        .where(eq(restaurantBusinessPlans.restaurantId, restaurantId));

    // تجميع الاشتراكات الفعّالة حسب دورتها
    const activeSubscriptions = {
        monthly: activePlans
            .filter((p) => p.isMonthlyActive)
            .map((p) => ({
                platformType: p.platformType,
                amount: p.monthlyAmount,
            })),
        quarterly: activePlans
            .filter((p) => p.isQuarterlyActive)
            .map((p) => ({
                platformType: p.platformType,
                amount: p.quarterlyAmount,
            })),
        annually: activePlans
            .filter((p) => p.isAnnuallyActive)
            .map((p) => ({
                platformType: p.platformType,
                amount: p.annuallyAmount,
            })),
    };

    // إجمالي المبالغ المستحقة لكل دورة
    const totalActiveMonthly = activeSubscriptions.monthly.reduce(
        (acc, s) => acc + parseFloat(s.amount as string || "0"), 0
    );
    const totalActiveQuarterly = activeSubscriptions.quarterly.reduce(
        (acc, s) => acc + parseFloat(s.amount as string || "0"), 0
    );
    const totalActiveAnnually = activeSubscriptions.annually.reduce(
        (acc, s) => acc + parseFloat(s.amount as string || "0"), 0
    );

    // 3. جلب إعدادات بوابات الدفع والسويتش التلقائي
    const [settings] = await db
        .select({
            paymentGatewayType: restaurantSettings.paymentGatewayType,
            visaSwitchConditionType: restaurantSettings.visaSwitchConditionType,
            visaSwitchAmountThreshold: restaurantSettings.visaSwitchAmountThreshold,
            visaSwitchDate: restaurantSettings.visaSwitchDate,
            visaSwitchApplied: restaurantSettings.visaSwitchApplied,
            customGatewayAccumulatedFees: restaurantSettings.customGatewayAccumulatedFees,
        })
        .from(restaurantSettings)
        .where(eq(restaurantSettings.restaurantId, restaurantId))
        .limit(1);

    // 4. جلب آخر الحركات التي كونت هذا الرصيد مع تفاصيل الأوردرات
    const recentTransactions = await getWalletTransactionsWithOrderDetails(restaurantId, 15);

    const numericBalance = parseFloat(wallet.balance as string || "0");
    const accountStatus = numericBalance < 0
        ? "DUE_ON_RESTAURANT"   // المطعم عليه فلوس للمنصة
        : numericBalance > 0
            ? "DUE_TO_RESTAURANT"  // المطعم ليه فلوس عند المنصة
            : "SETTLED";           // الحساب متساوي وخالص

    const statusDescription = numericBalance < 0
        ? `المطعم عليه مديونية للمنصة بقيمة ${Math.abs(numericBalance).toFixed(2)} ج.م`
        : numericBalance > 0
            ? `المطعم ليه مستحقات عند المنصة بقيمة ${numericBalance.toFixed(2)} ج.م`
            : "الحساب متوازن وخالص (0.00 ج.م)";

    return SuccessResponse(res, {
        message: "Get wallet details success",
        data: {
            // ملخص الحساب المالي المباشر
            accountSummary: {
                status: accountStatus,               // "DUE_ON_RESTAURANT" | "DUE_TO_RESTAURANT" | "SETTLED"
                description: statusDescription,       // رسالة واضحة بالعربي
                netAmount: Math.abs(numericBalance).toFixed(2), // المبلغ الصافي المستحق
                balance: wallet.balance,             // رصيد المحفظة الأصلي
                collectedCash: wallet.collectedCash, // الكاش الموجود في يد المطعم
                totalEarning: wallet.totalEarning,   // إجمالي أرباح ومبيعات المطعم
            },

            // الرسوم والعمولات المتراكمة
            fees: {
                totalServiceFeesRecorded: wallet.totalServiceFees,
                totalCommissionRecorded: wallet.totalCommission,
                totalSubscriptionsRecorded: wallet.totalSubscriptions,
                lastMonthlySubscription: wallet.lastMonthlySubscription,
                lastQuarterlySubscription: wallet.lastQuarterlySubscription,
                lastAnnuallySubscription: wallet.lastAnnuallySubscription,
            },

            // الاشتراكات الفعّالة الجارية
            activeSubscriptions: {
                monthly: {
                    plans: activeSubscriptions.monthly,
                    totalPerCycle: totalActiveMonthly.toFixed(2),
                },
                quarterly: {
                    plans: activeSubscriptions.quarterly,
                    totalPerCycle: totalActiveQuarterly.toFixed(2),
                },
                annually: {
                    plans: activeSubscriptions.annually,
                    totalPerCycle: totalActiveAnnually.toFixed(2),
                },
            },

            // الرسوم والعمولات الحالية لكل طلب
            currentPlanFees: {
                totalServiceFeePerOrder: activePlans
                    .reduce((acc, p) => acc + parseFloat(p.serviceFee as string || "0"), 0)
                    .toFixed(2),
                totalCommissionRatePercent: activePlans
                    .reduce((acc, p) => acc + parseFloat(p.commissionRate as string || "0"), 0)
                    .toFixed(2),
            },

            // حالة بوابة الدفع ونظام التحويل التلقائي
            paymentGatewaySettings: settings ? {
                gatewayType: settings.paymentGatewayType,
                switchCondition: settings.visaSwitchConditionType,
                amountThreshold: settings.visaSwitchAmountThreshold,
                switchDate: settings.visaSwitchDate,
                accumulatedFeesOnCustom: settings.customGatewayAccumulatedFees,
                isSwitchApplied: settings.visaSwitchApplied,
            } : null,

            // سجل الأوردرات والعمليات التي كونت هذا الحساب
            recentTransactions,

            updatedAt: wallet.updatedAt,
        }
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

    // 2. جلب سجل الحركات وترتيبه من الأحدث للأقدم مع تفاصيل الأوردرات
    const transactions = await getWalletTransactionsWithOrderDetails(restaurantId);

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
            type: "withdraw",
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