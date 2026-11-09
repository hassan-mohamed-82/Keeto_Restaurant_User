"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestWithdrawal = exports.getMyWalletTransactions = exports.getMyWallet = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const NotFound_1 = require("../../Errors/NotFound");
const uuid_1 = require("uuid");
const order_helper_1 = require("../../helpers/order.helper");
/**
 * دالة مساعدة لجلب حركات المحفظة مربوطة ببيانات الأوردر (dailyOrderNumber, orderNumber, ...)
 * إذا كان نوع الحركة order_payment
 */
async function getWalletTransactionsWithOrderDetails(restaurantId, limit) {
    const query = connection_1.db
        .select({
        id: schema_1.restaurantWalletTransactions.id,
        restaurantId: schema_1.restaurantWalletTransactions.restaurantId,
        orderId: schema_1.restaurantWalletTransactions.orderId,
        type: schema_1.restaurantWalletTransactions.type,
        amount: schema_1.restaurantWalletTransactions.amount,
        balanceBefore: schema_1.restaurantWalletTransactions.balanceBefore,
        balanceAfter: schema_1.restaurantWalletTransactions.balanceAfter,
        method: schema_1.restaurantWalletTransactions.method,
        reference: schema_1.restaurantWalletTransactions.reference,
        serviceFee: schema_1.restaurantWalletTransactions.serviceFee,
        commission: schema_1.restaurantWalletTransactions.commission,
        orderAmount: schema_1.restaurantWalletTransactions.orderAmount,
        note: schema_1.restaurantWalletTransactions.note,
        createdAt: schema_1.restaurantWalletTransactions.createdAt,
        order: {
            id: schema_1.orders.id,
            orderNumber: schema_1.orders.orderNumber,
            dailyOrderNumber: schema_1.orders.dailyOrderNumber,
            status: schema_1.orders.status,
            orderType: schema_1.orders.orderType,
            orderSource: schema_1.orders.orderSource,
            totalAmount: schema_1.orders.totalAmount,
            paymentStatus: schema_1.orders.paymentStatus,
            createdAt: schema_1.orders.createdAt,
        }
    })
        .from(schema_1.restaurantWalletTransactions)
        .leftJoin(schema_1.orders, (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.restaurantWalletTransactions.orderId, schema_1.orders.id), (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restaurantWalletTransactions.type, "order_payment"), (0, drizzle_orm_1.eq)(schema_1.restaurantWalletTransactions.reference, schema_1.orders.orderNumber))))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restaurantWalletTransactions.restaurantId, restaurantId), 
    // 🚫 استبعاد الحركات اللي الـ service fee والـ commission بتوعها الاتنين = 0 (أو NULL)
    (0, drizzle_orm_1.or)((0, drizzle_orm_1.sql) `COALESCE(${schema_1.restaurantWalletTransactions.serviceFee}, 0) <> 0`, (0, drizzle_orm_1.sql) `COALESCE(${schema_1.restaurantWalletTransactions.commission}, 0) <> 0`), 
    // 🚫 استبعاد حركات طلبات الفيزا المعلقة أو الفاشلة
    (0, drizzle_orm_1.sql) `(${schema_1.orders.id} IS NULL OR ${(0, order_helper_1.excludeUnpaidVisaOrders)()})`))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.restaurantWalletTransactions.createdAt));
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
            paymentStatus: r.order.paymentStatus,
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
];
const getMyWallet = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const branchId = req.user?.branchId; // لو موجود يبقى مدير فرع
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant context missing");
    // 🛡️ حماية مالية: نمنع مديري الفروع من رؤية محفظة المطعم الأساسية
    if (branchId) {
        throw new BadRequest_1.BadRequest("Unauthorized: Only restaurant owners can view wallet data");
    }
    const { startDate, endDate } = req.query;
    let start;
    let end;
    if (startDate) {
        start = new Date(`${startDate}T00:00:00`);
        if (isNaN(start.getTime()))
            throw new BadRequest_1.BadRequest("Invalid startDate");
    }
    if (endDate) {
        end = new Date(`${endDate}T23:59:59.999`); // لحد آخر لحظة في اليوم
        if (isNaN(end.getTime()))
            throw new BadRequest_1.BadRequest("Invalid endDate");
    }
    if (start && end && start > end) {
        throw new BadRequest_1.BadRequest("startDate must be before endDate");
    }
    // 1. جلب بيانات المحفظة
    const [wallet] = await connection_1.db.select()
        .from(schema_1.restaurantWallets)
        .where((0, drizzle_orm_1.eq)(schema_1.restaurantWallets.restaurantId, restaurantId))
        .limit(1);
    if (!wallet) {
        throw new NotFound_1.NotFound("Wallet not found for this restaurant");
    }
    // 2. جلب خطط العمل الفعّالة للمطعم لاستخراج الاشتراكات والعمولات الجارية
    const activePlans = await connection_1.db
        .select({
        platformType: schema_1.restaurantBusinessPlans.platformType,
        isMonthlyActive: schema_1.restaurantBusinessPlans.isMonthlyActive,
        monthlyAmount: schema_1.restaurantBusinessPlans.monthlyAmount,
        isQuarterlyActive: schema_1.restaurantBusinessPlans.isQuarterlyActive,
        quarterlyAmount: schema_1.restaurantBusinessPlans.quarterlyAmount,
        isAnnuallyActive: schema_1.restaurantBusinessPlans.isAnnuallyActive,
        annuallyAmount: schema_1.restaurantBusinessPlans.annuallyAmount,
        commissionRate: schema_1.restaurantBusinessPlans.commissionRate,
        serviceFee: schema_1.restaurantBusinessPlans.serviceFee,
    })
        .from(schema_1.restaurantBusinessPlans)
        .where((0, drizzle_orm_1.eq)(schema_1.restaurantBusinessPlans.restaurantId, restaurantId));
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
    const totalActiveMonthly = activeSubscriptions.monthly.reduce((acc, s) => acc + parseFloat(s.amount || "0"), 0);
    const totalActiveQuarterly = activeSubscriptions.quarterly.reduce((acc, s) => acc + parseFloat(s.amount || "0"), 0);
    const totalActiveAnnually = activeSubscriptions.annually.reduce((acc, s) => acc + parseFloat(s.amount || "0"), 0);
    // 3. جلب إعدادات بوابات الدفع والسويتش التلقائي
    const [settings] = await connection_1.db
        .select({
        paymentGatewayType: schema_1.restaurantSettings.paymentGatewayType,
        visaSwitchConditionType: schema_1.restaurantSettings.visaSwitchConditionType,
        visaSwitchAmountThreshold: schema_1.restaurantSettings.visaSwitchAmountThreshold,
        visaSwitchDayOfWeek: schema_1.restaurantSettings.visaSwitchDayOfWeek,
        visaSwitchDayOfMonth: schema_1.restaurantSettings.visaSwitchDayOfMonth,
        visaSwitchApplied: schema_1.restaurantSettings.visaSwitchApplied,
        customGatewayAccumulatedFees: schema_1.restaurantSettings.customGatewayAccumulatedFees,
    })
        .from(schema_1.restaurantSettings)
        .where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, restaurantId))
        .limit(1);
    // 4. شرط الأوردرات المشترك (مع فلتر التاريخ)
    const ordersWhere = (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId), (0, drizzle_orm_1.notInArray)(schema_1.orders.status, ["cancelled", "failed", "refund"]), (0, order_helper_1.excludeUnpaidVisaOrders)(), start ? (0, drizzle_orm_1.gte)(schema_1.orders.createdAt, start) : undefined, end ? (0, drizzle_orm_1.lte)(schema_1.orders.createdAt, end) : undefined);
    // 5. إجمالي الأوردرات (مع فلتر التاريخ)
    const [orderAggregates] = await connection_1.db
        .select({
        totalOrders: (0, drizzle_orm_1.sql) `COUNT(*)`,
        totalSubtotal: (0, drizzle_orm_1.sql) `COALESCE(SUM(${schema_1.orders.subtotal}), 0)`,
        // إجمالي الأوردر بعد خصم الـ service fees
        totalAmount: (0, drizzle_orm_1.sql) `COALESCE(SUM(${schema_1.orders.totalAmount} - COALESCE(${schema_1.orders.serviceFee}, 0)), 0)`,
        totalDeliveryFees: (0, drizzle_orm_1.sql) `COALESCE(SUM(${schema_1.orders.deliveryFee}), 0)`,
    })
        .from(schema_1.orders)
        .where(ordersWhere);
    // 6. الـ service fees والعمولات grouped by source
    const sourceRows = await connection_1.db
        .select({
        source: schema_1.orders.orderSource,
        totalOrders: (0, drizzle_orm_1.sql) `COUNT(*)`,
        serviceFees: (0, drizzle_orm_1.sql) `COALESCE(SUM(${schema_1.orders.serviceFee}), 0)`,
        appCommission: (0, drizzle_orm_1.sql) `COALESCE(SUM(${schema_1.orders.appCommission}), 0)`,
        visaCommission: (0, drizzle_orm_1.sql) `COALESCE(SUM(${schema_1.orders.visaCommission}), 0)`,
    })
        .from(schema_1.orders)
        .where(ordersWhere)
        .groupBy(schema_1.orders.orderSource);
    // نضمن إن كل source يظهر حتى لو مفيش له أوردرات (بقيم صفر)
    const bySource = Object.fromEntries(ORDER_SOURCES.map((src) => {
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
    }));
    // الإجماليات من نفس البيانات (بدون query إضافي)
    const sumBy = (k) => sourceRows.reduce((acc, r) => acc + parseFloat(r[k] ?? "0"), 0);
    const totalServiceFees = sumBy("serviceFees");
    const totalAppCommission = sumBy("appCommission");
    const totalVisaCommission = sumBy("visaCommission");
    // 7. حالة الحساب
    const numericBalance = parseFloat(wallet.balance || "0");
    const accountStatus = numericBalance < 0
        ? "DUE_ON_RESTAURANT" // المطعم عليه فلوس للمنصة
        : numericBalance > 0
            ? "DUE_TO_RESTAURANT" // المطعم ليه فلوس عند المنصة
            : "SETTLED"; // الحساب متساوي وخالص
    const statusDescription = numericBalance < 0
        ? `المطعم عليه مديونية للمنصة بقيمة ${Math.abs(numericBalance).toFixed(2)} ج.م`
        : numericBalance > 0
            ? `المطعم ليه مستحقات عند المنصة بقيمة ${numericBalance.toFixed(2)} ج.م`
            : "الحساب متوازن وخالص (0.00 ج.م)";
    return (0, response_1.SuccessResponse)(res, {
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
                    .reduce((acc, p) => acc + parseFloat(p.serviceFee || "0"), 0)
                    .toFixed(2),
                totalCommissionRatePercent: activePlans
                    .reduce((acc, p) => acc + parseFloat(p.commissionRate || "0"), 0)
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
                totalSubtotal: parseFloat(orderAggregates?.totalSubtotal ?? "0").toFixed(2),
                totalAmount: parseFloat(orderAggregates?.totalAmount ?? "0").toFixed(2),
                totalDeliveryFees: parseFloat(orderAggregates?.totalDeliveryFees ?? "0").toFixed(2),
            },
            updatedAt: wallet.updatedAt,
        }
    });
};
exports.getMyWallet = getMyWallet;
// ==========================================
// 2. جلب سجل حركات المحفظة (Transactions History)
// ==========================================
const getMyWalletTransactions = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const branchId = req.user?.branchId;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant context missing");
    // 🛡️ حماية مالية: نفس نظام الحماية
    if (branchId) {
        throw new BadRequest_1.BadRequest("Unauthorized: Only restaurant owners can view transaction history");
    }
    // ── Guard 1: Business Plan ──────────────────────────────────────────────
    // إذا كانت جميع رسوم وعمولات خطط العمل = 0 ← لا يوجد نشاط مالي مُعرَّف
    const businessPlans = await connection_1.db
        .select({
        commissionRate: schema_1.restaurantBusinessPlans.commissionRate,
        serviceFee: schema_1.restaurantBusinessPlans.serviceFee,
        monthlyAmount: schema_1.restaurantBusinessPlans.monthlyAmount,
        quarterlyAmount: schema_1.restaurantBusinessPlans.quarterlyAmount,
        annuallyAmount: schema_1.restaurantBusinessPlans.annuallyAmount,
    })
        .from(schema_1.restaurantBusinessPlans)
        .where((0, drizzle_orm_1.eq)(schema_1.restaurantBusinessPlans.restaurantId, restaurantId));
    const allPlansAreZero = businessPlans.length === 0 ||
        businessPlans.every((p) => parseFloat(p.commissionRate || "0") === 0 &&
            parseFloat(p.serviceFee || "0") === 0 &&
            parseFloat(p.monthlyAmount || "0") === 0 &&
            parseFloat(p.quarterlyAmount || "0") === 0 &&
            parseFloat(p.annuallyAmount || "0") === 0);
    if (allPlansAreZero) {
        return (0, response_1.SuccessResponse)(res, {
            message: "Get wallet transactions success",
            data: []
        });
    }
    // ── Guard 2: Transaction Totals ─────────────────────────────────────────
    // إذا كان إجمالي قيم الحركات المسجلة = 0 ← لا يوجد تحريك مالي فعلي
    const [txAggregate] = await connection_1.db
        .select({
        totalAmount: (0, drizzle_orm_1.sql) `COALESCE(SUM(ABS(${schema_1.restaurantWalletTransactions.amount})), 0)`,
    })
        .from(schema_1.restaurantWalletTransactions)
        .leftJoin(schema_1.orders, (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.restaurantWalletTransactions.orderId, schema_1.orders.id), (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restaurantWalletTransactions.type, "order_payment"), (0, drizzle_orm_1.eq)(schema_1.restaurantWalletTransactions.reference, schema_1.orders.orderNumber))))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restaurantWalletTransactions.restaurantId, restaurantId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.sql) `COALESCE(${schema_1.restaurantWalletTransactions.serviceFee}, 0) <> 0`, (0, drizzle_orm_1.sql) `COALESCE(${schema_1.restaurantWalletTransactions.commission}, 0) <> 0`), (0, drizzle_orm_1.sql) `(${schema_1.orders.id} IS NULL OR ${(0, order_helper_1.excludeUnpaidVisaOrders)()})`));
    const totalTxAmount = parseFloat(txAggregate?.totalAmount || "0");
    if (totalTxAmount === 0) {
        return (0, response_1.SuccessResponse)(res, {
            message: "Get wallet transactions success",
            data: []
        });
    }
    // ── جلب سجل الحركات ─────────────────────────────────────────────────────
    const transactions = await getWalletTransactionsWithOrderDetails(restaurantId);
    return (0, response_1.SuccessResponse)(res, {
        message: "Get wallet transactions success",
        data: transactions
    });
};
exports.getMyWalletTransactions = getMyWalletTransactions;
// ==========================================
// 3. REQUEST WITHDRAWAL (Restaurant App)
// ==========================================
const requestWithdrawal = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const { amount } = req.body;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant context missing");
    const requestedAmount = parseFloat(amount);
    if (!requestedAmount || requestedAmount <= 0) {
        throw new BadRequest_1.BadRequest("Invalid requested amount");
    }
    const [wallet] = await connection_1.db.select().from(schema_1.restaurantWallets).where((0, drizzle_orm_1.eq)(schema_1.restaurantWallets.restaurantId, restaurantId)).limit(1);
    if (!wallet)
        throw new NotFound_1.NotFound("Wallet not found");
    const currentBalance = parseFloat(wallet.balance || "0");
    const currentPending = parseFloat(wallet.pendingWithdraw || "0");
    // 🛡️ لازم نتأكد إن المطعم عنده رصيد إيجابي يغطي المبلغ اللي طالبه
    if (requestedAmount > currentBalance) {
        throw new BadRequest_1.BadRequest("Insufficient balance to request this withdrawal");
    }
    const newBalance = currentBalance - requestedAmount;
    const newPending = currentPending + requestedAmount;
    await connection_1.db.transaction(async (tx) => {
        // 1. نخصم من الرصيد الأساسي ونحط في الـ Pending
        await tx.update(schema_1.restaurantWallets)
            .set({
            balance: newBalance.toFixed(2),
            pendingWithdraw: newPending.toFixed(2)
        })
            .where((0, drizzle_orm_1.eq)(schema_1.restaurantWallets.restaurantId, restaurantId));
        // 2. نسجل الحركة
        await tx.insert(schema_1.restaurantWalletTransactions).values({
            id: (0, uuid_1.v4)(),
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
    return (0, response_1.SuccessResponse)(res, { message: "Withdrawal request submitted successfully" });
};
exports.requestWithdrawal = requestWithdrawal;
