import { Request, Response } from "express";
import { db } from "../../models/connection";
import {
    restaurantWallets,
    restaurantWalletTransactions,
    restaurantBusinessPlans,
    restaurantSettings,
    orders
} from "../../models/schema";
import { eq, desc, or, and, sql, notInArray, gte, lte } from "drizzle-orm";
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
        .where(and(
            eq(restaurantWalletTransactions.restaurantId, restaurantId),
            // 🚫 استبعاد الحركات اللي الـ service fee والـ commission بتوعها الاتنين = 0 (أو NULL)
            or(
                sql`COALESCE(${restaurantWalletTransactions.serviceFee}, 0) <> 0`,
                sql`COALESCE(${restaurantWalletTransactions.commission}, 0) <> 0`,
            ),
        ))
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
// مصادر الأوردرات (زي orders.orderSource)
const ORDER_SOURCES = [
    "online_order_web",
    "online_order_app",
    "food_aggregator",
    "my_keeto",
    "pos",
] as const;

export const getMyWallet = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const branchId = req.user?.branchId; // لو موجود يبقى مدير فرع

    if (!restaurantId) throw new BadRequest("Restaurant context missing");

    // 🛡️ حماية مالية: نمنع مديري الفروع من رؤية محفظة المطعم الأساسية
    if (branchId) {
        throw new BadRequest("Unauthorized: Only restaurant owners can view wallet data");
    }

    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

    let start: Date | undefined;
    let end: Date | undefined;

    if (startDate) {
        start = new Date(`${startDate}T00:00:00`);
        if (isNaN(start.getTime())) throw new BadRequest("Invalid startDate");
    }
    if (endDate) {
        end = new Date(`${endDate}T23:59:59.999`); // لحد آخر لحظة في اليوم
        if (isNaN(end.getTime())) throw new BadRequest("Invalid endDate");
    }
    if (start && end && start > end) {
        throw new BadRequest("startDate must be before endDate");
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
            .map((p) => ({ platformType: p.platformType, amount: p.monthlyAmount })),
        quarterly: activePlans
            .filter((p) => p.isQuarterlyActive)
            .map((p) => ({ platformType: p.platformType, amount: p.quarterlyAmount })),
        annually: activePlans
            .filter((p) => p.isAnnuallyActive)
            .map((p) => ({ platformType: p.platformType, amount: p.annuallyAmount })),
    };

    // إجمالي المبالغ المستحقة لكل دورة
    const totalActiveMonthly = activeSubscriptions.monthly.reduce(
        (acc, s) => acc + parseFloat((s.amount as string) || "0"), 0
    );
    const totalActiveQuarterly = activeSubscriptions.quarterly.reduce(
        (acc, s) => acc + parseFloat((s.amount as string) || "0"), 0
    );
    const totalActiveAnnually = activeSubscriptions.annually.reduce(
        (acc, s) => acc + parseFloat((s.amount as string) || "0"), 0
    );

    // 3. جلب إعدادات بوابات الدفع والسويتش التلقائي
    const [settings] = await db
        .select({
            paymentGatewayType: restaurantSettings.paymentGatewayType,
            visaSwitchConditionType: restaurantSettings.visaSwitchConditionType,
            visaSwitchAmountThreshold: restaurantSettings.visaSwitchAmountThreshold,
            visaSwitchDayOfWeek: restaurantSettings.visaSwitchDayOfWeek,
            visaSwitchDayOfMonth: restaurantSettings.visaSwitchDayOfMonth,
            visaSwitchApplied: restaurantSettings.visaSwitchApplied,
            customGatewayAccumulatedFees: restaurantSettings.customGatewayAccumulatedFees,
        })
        .from(restaurantSettings)
        .where(eq(restaurantSettings.restaurantId, restaurantId))
        .limit(1);

    // 4. شرط الأوردرات المشترك (مع فلتر التاريخ)
    const ordersWhere = and(
        eq(orders.restaurantId, restaurantId),
        notInArray(orders.status, ["cancelled", "failed", "refund"]),
        start ? gte(orders.createdAt, start) : undefined,
        end ? lte(orders.createdAt, end) : undefined,
    );

    // 5. إجمالي الأوردرات (مع فلتر التاريخ)
    const [orderAggregates] = await db
        .select({
            totalOrders: sql<number>`COUNT(*)`,
            totalSubtotal: sql<string>`COALESCE(SUM(${orders.subtotal}), 0)`,
            // إجمالي الأوردر بعد خصم الـ service fees
            totalAmount: sql<string>`COALESCE(SUM(${orders.totalAmount} - COALESCE(${orders.serviceFee}, 0)), 0)`,
            totalDeliveryFees: sql<string>`COALESCE(SUM(${orders.deliveryFee}), 0)`,
        })
        .from(orders)
        .where(ordersWhere);

    // 6. الـ service fees والعمولات grouped by source
    const sourceRows = await db
        .select({
            source: orders.orderSource,
            totalOrders: sql<number>`COUNT(*)`,
            serviceFees: sql<string>`COALESCE(SUM(${orders.serviceFee}), 0)`,
            appCommission: sql<string>`COALESCE(SUM(${orders.appCommission}), 0)`,
            visaCommission: sql<string>`COALESCE(SUM(${orders.visaCommission}), 0)`,
        })
        .from(orders)
        .where(ordersWhere)
        .groupBy(orders.orderSource);

    // نضمن إن كل source يظهر حتى لو مفيش له أوردرات (بقيم صفر)
    const bySource = Object.fromEntries(
        ORDER_SOURCES.map((src) => {
            const r = sourceRows.find((x) => x.source === src);
            const service = parseFloat(r?.serviceFees ?? "0");
            const app = parseFloat(r?.appCommission ?? "0");
            const visa = parseFloat(r?.visaCommission ?? "0");
            return [src, {
                totalOrders: Number(r?.totalOrders ?? 0),
                serviceFees: service.toFixed(2),
                appCommission: app.toFixed(2),
                visaCommission: visa.toFixed(2),
                totalCommission: (app + visa).toFixed(2),
            }];
        })
    );

    // الإجماليات من نفس البيانات (بدون query إضافي)
    const sumBy = (k: "serviceFees" | "appCommission" | "visaCommission") =>
        sourceRows.reduce((acc, r) => acc + parseFloat(r[k] ?? "0"), 0);

    const totalServiceFees = sumBy("serviceFees");
    const totalAppCommission = sumBy("appCommission");
    const totalVisaCommission = sumBy("visaCommission");

    // 7. حالة الحساب
    const numericBalance = parseFloat((wallet.balance as string) || "0");
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
            // ملخص الحساب المالي (تراكمي، غير متأثر بفلتر التاريخ)
            accountSummary: {
                status: accountStatus,
                description: statusDescription,
                netAmount: Math.abs(numericBalance).toFixed(2),
                balance: wallet.balance,
                collectedCash: wallet.collectedCash,
                totalEarning: wallet.totalEarning,
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

            // الرسوم والعمولات الفعلية من الأوردرات خلال الفترة (إجمالي + حسب المصدر)
            feesAndCommissions: {
                period: {
                    startDate: startDate ?? null,
                    endDate: endDate ?? null,
                },
                totals: {
                    serviceFees: totalServiceFees.toFixed(2),
                    appCommission: totalAppCommission.toFixed(2),
                    visaCommission: totalVisaCommission.toFixed(2),
                    totalCommission: (totalAppCommission + totalVisaCommission).toFixed(2),
                },
                bySource,
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
                    .reduce((acc, p) => acc + parseFloat((p.serviceFee as string) || "0"), 0)
                    .toFixed(2),
                totalCommissionRatePercent: activePlans
                    .reduce((acc, p) => acc + parseFloat((p.commissionRate as string) || "0"), 0)
                    .toFixed(2),
            },

            // حالة بوابة الدفع ونظام التحويل التلقائي
            paymentGatewaySettings: settings ? {
                gatewayType: settings.paymentGatewayType,
                switchCondition: settings.visaSwitchConditionType,
                amountThreshold: settings.visaSwitchAmountThreshold,
                dayOfWeek: settings.visaSwitchDayOfWeek,
                dayOfMonth: settings.visaSwitchDayOfMonth,
                accumulatedFeesOnCustom: settings.customGatewayAccumulatedFees,
                isSwitchApplied: settings.visaSwitchApplied,
            } : null,

            // إجمالي الأوردرات خلال الفترة المختارة
            foodOrdersSummary: {
                period: {
                    startDate: startDate ?? null,
                    endDate: endDate ?? null,
                },
                totalOrders: Number(orderAggregates?.totalOrders ?? 0),
                totalSubtotal: parseFloat((orderAggregates?.totalSubtotal as string) ?? "0").toFixed(2),
                totalAmount: parseFloat((orderAggregates?.totalAmount as string) ?? "0").toFixed(2),
                totalDeliveryFees: parseFloat((orderAggregates?.totalDeliveryFees as string) ?? "0").toFixed(2),
            },

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

    // ── Guard 1: Business Plan ──────────────────────────────────────────────
    // إذا كانت جميع رسوم وعمولات خطط العمل = 0 ← لا يوجد نشاط مالي مُعرَّف
    const businessPlans = await db
        .select({
            commissionRate: restaurantBusinessPlans.commissionRate,
            serviceFee: restaurantBusinessPlans.serviceFee,
            monthlyAmount: restaurantBusinessPlans.monthlyAmount,
            quarterlyAmount: restaurantBusinessPlans.quarterlyAmount,
            annuallyAmount: restaurantBusinessPlans.annuallyAmount,
        })
        .from(restaurantBusinessPlans)
        .where(eq(restaurantBusinessPlans.restaurantId, restaurantId));

    const allPlansAreZero =
        businessPlans.length === 0 ||
        businessPlans.every((p) =>
            parseFloat(p.commissionRate as string || "0") === 0 &&
            parseFloat(p.serviceFee as string || "0") === 0 &&
            parseFloat(p.monthlyAmount as string || "0") === 0 &&
            parseFloat(p.quarterlyAmount as string || "0") === 0 &&
            parseFloat(p.annuallyAmount as string || "0") === 0
        );

    if (allPlansAreZero) {
        return SuccessResponse(res, {
            message: "Get wallet transactions success",
            data: []
        });
    }

    // ── Guard 2: Transaction Totals ─────────────────────────────────────────
    // إذا كان إجمالي قيم الحركات المسجلة = 0 ← لا يوجد تحريك مالي فعلي
    const [txAggregate] = await db
        .select({
            totalAmount: sql<string>`COALESCE(SUM(ABS(${restaurantWalletTransactions.amount})), 0)`,
        })
        .from(restaurantWalletTransactions)
        .where(eq(restaurantWalletTransactions.restaurantId, restaurantId));

    const totalTxAmount = parseFloat(txAggregate?.totalAmount as string || "0");

    if (totalTxAmount === 0) {
        return SuccessResponse(res, {
            message: "Get wallet transactions success",
            data: []
        });
    }

    // ── جلب سجل الحركات ─────────────────────────────────────────────────────
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