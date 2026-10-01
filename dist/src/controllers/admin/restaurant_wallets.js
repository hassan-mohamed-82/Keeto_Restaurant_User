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
            createdAt: schema_1.orders.createdAt,
        }
    })
        .from(schema_1.restaurantWalletTransactions)
        .leftJoin(schema_1.orders, (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.restaurantWalletTransactions.orderId, schema_1.orders.id), (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restaurantWalletTransactions.type, "order_payment"), (0, drizzle_orm_1.eq)(schema_1.restaurantWalletTransactions.reference, schema_1.orders.orderNumber))))
        .where((0, drizzle_orm_1.eq)(schema_1.restaurantWalletTransactions.restaurantId, restaurantId))
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
            createdAt: r.order.createdAt,
        } : null
    }));
}
// ==========================================
// 1. جلب تفاصيل محفظة المطعم الشاملة (الأرصدة + الرسوم + العمولات + الاشتراكات)
// ==========================================
const getMyWallet = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const branchId = req.user?.branchId; // لو موجود يبقى مدير فرع
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant context missing");
    // 🛡️ حماية مالية: نمنع مديري الفروع من رؤية محفظة المطعم الأساسية
    if (branchId) {
        throw new BadRequest_1.BadRequest("Unauthorized: Only restaurant owners can view wallet data");
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
    const totalActiveMonthly = activeSubscriptions.monthly.reduce((acc, s) => acc + parseFloat(s.amount || "0"), 0);
    const totalActiveQuarterly = activeSubscriptions.quarterly.reduce((acc, s) => acc + parseFloat(s.amount || "0"), 0);
    const totalActiveAnnually = activeSubscriptions.annually.reduce((acc, s) => acc + parseFloat(s.amount || "0"), 0);
    // 3. جلب إعدادات بوابات الدفع والسويتش التلقائي
    const [settings] = await connection_1.db
        .select({
        paymentGatewayType: schema_1.restaurantSettings.paymentGatewayType,
        visaSwitchConditionType: schema_1.restaurantSettings.visaSwitchConditionType,
        visaSwitchAmountThreshold: schema_1.restaurantSettings.visaSwitchAmountThreshold,
        visaSwitchDate: schema_1.restaurantSettings.visaSwitchDate,
        visaSwitchApplied: schema_1.restaurantSettings.visaSwitchApplied,
        customGatewayAccumulatedFees: schema_1.restaurantSettings.customGatewayAccumulatedFees,
    })
        .from(schema_1.restaurantSettings)
        .where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, restaurantId))
        .limit(1);
    // 4. جلب آخر الحركات التي كونت هذا الرصيد مع تفاصيل الأوردرات
    const recentTransactions = await getWalletTransactionsWithOrderDetails(restaurantId, 15);
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
            // ملخص الحساب المالي المباشر
            accountSummary: {
                status: accountStatus, // "DUE_ON_RESTAURANT" | "DUE_TO_RESTAURANT" | "SETTLED"
                description: statusDescription, // رسالة واضحة بالعربي
                netAmount: Math.abs(numericBalance).toFixed(2), // المبلغ الصافي المستحق
                balance: wallet.balance, // رصيد المحفظة الأصلي
                collectedCash: wallet.collectedCash, // الكاش الموجود في يد المطعم
                totalEarning: wallet.totalEarning, // إجمالي أرباح ومبيعات المطعم
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
    // 2. جلب سجل الحركات وترتيبه من الأحدث للأقدم مع تفاصيل الأوردرات
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
