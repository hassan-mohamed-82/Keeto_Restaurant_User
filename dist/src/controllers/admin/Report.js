"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFoodReport = exports.getDeliveryManReport = exports.reportVisa = exports.getVisaReport = exports.getDashboardReports = exports.getMyInvoices = exports.downloadSavedInvoicePDF = exports.getOrdersByPaymentMethod = exports.getMyRestaurantReport = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const Errors_1 = require("../../Errors");
const BadRequest_1 = require("../../Errors/BadRequest");
const pdfkit_1 = __importDefault(require("pdfkit"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const invoices_1 = require("../../models/schema/admin/invoices");
const response_1 = require("../../utils/response");
const order_helper_1 = require("../../helpers/order.helper");
const foodConditions_1 = require("../../helpers/foodConditions");
const getMyRestaurantReport = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const restaurantId = req.user.restaurantId || req.user.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID not found");
    const { startDate, endDate, branchId } = req.query;
    const conditions = [
        (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId),
        // ✅ إخفاء طلبات الفيزا المعلقة أو الفاشلة من التقارير — تُحسب فقط لما paymentStatus = 'paid'
        (0, order_helper_1.excludeUnpaidVisaOrders)(),
    ];
    if (startDate)
        conditions.push((0, drizzle_orm_1.gte)(schema_1.orders.createdAt, new Date(startDate)));
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        conditions.push((0, drizzle_orm_1.lte)(schema_1.orders.createdAt, end));
    }
    if (branchId)
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.branchId, branchId));
    if (req.user.branchId)
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.branchId, req.user.branchId));
    // ==========================================
    // 1. جلب كل الأوردرات مع ربط الجداول المطلوبة
    // ==========================================
    const allOrders = await connection_1.db
        .select({
        orderId: schema_1.orders.id,
        orderNumber: schema_1.orders.orderNumber,
        status: schema_1.orders.status,
        orderSource: schema_1.orders.orderSource,
        orderType: schema_1.orders.orderType,
        // 👇 التعديل هنا: جلب اسم طريقة الدفع بدل الـ UUID
        paymentMethodId: schema_1.orders.paymentMethod,
        paymentMethodName: schema_1.paymentMethods.name,
        subtotal: schema_1.orders.subtotal,
        deliveryFee: schema_1.orders.deliveryFee,
        serviceFee: schema_1.orders.serviceFee,
        appCommission: schema_1.orders.appCommission,
        totalAmount: schema_1.orders.totalAmount,
        branchId: schema_1.orders.branchId,
        branchName: schema_1.branches.name,
        createdAt: schema_1.orders.createdAt,
        cancelReasonType: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.orders.cancelReasonType}, ${schema_1.selectReasons.type})`, // نوع الإلغاء
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.orders.branchId, schema_1.branches.id))
        .leftJoin(schema_1.selectReasons, (0, drizzle_orm_1.eq)(schema_1.orders.cancelReasonId, schema_1.selectReasons.id))
        .leftJoin(schema_1.paymentMethods, (0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, schema_1.paymentMethods.id)) // 👈 الربط مع جدول طرق الدفع
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.orders.createdAt));
    // ==========================================
    // 2. تهيئة المتغيرات للإحصائيات
    // ==========================================
    const statusSummary = {};
    const allStatuses = ["pending", "accepted", "preparing", "out_for_delivery", "delivered", "cancelled", "rejected", "refund"];
    for (const s of allStatuses)
        statusSummary[s] = { count: 0, totalAmount: 0 };
    const paymentSummary = {
        cash_on_delivery: { count: 0, totalAmount: 0 },
        visa: { count: 0, totalAmount: 0 },
        wallet: { count: 0, totalAmount: 0 },
    };
    const orderTypeSummary = {
        delivery: { count: 0, totalAmount: 0 },
        takeaway: { count: 0, totalAmount: 0 },
        dine_in: { count: 0, totalAmount: 0 },
    };
    const orderSourceSummary = {};
    const branchSummary = {};
    const dailyTrend = {};
    let totalOrders = 0;
    let validOrdersForFinancials = 0;
    // متغيرات الفلوس
    let grossTotalAllOrders = 0; // ✅ مجموع كل الأوردرات بغض النظر عن الستاتوس
    let totalRevenue = 0;
    let totalSubtotal = 0;
    let totalDeliveryFees = 0;
    let totalServiceFees = 0;
    let totalAppCommission = 0;
    let totalCashCollected = 0;
    let totalDigitalCollected = 0;
    let totalCashCommission = 0;
    let totalDigitalCommission = 0;
    let totalCashServiceFees = 0;
    let totalDigitalServiceFees = 0;
    const validOrderIdsForItems = [];
    // ==========================================
    // 3. حساب الفلوس وتصفية الأوردرات (The Magic Loop)
    // ==========================================
    for (const order of allOrders) {
        totalOrders++;
        const status = order.status || "pending";
        const cancelReasonType = order.cancelReasonType;
        // ✅ جمع مبلغ الأوردر ضمن الإجمالي الكلي بغض النظر عن أي ستاتوس
        grossTotalAllOrders += parseFloat(order.totalAmount || "0");
        // 🛑 الفلتر السحري: هل اليوزر كنسل الطلب؟
        const isCancelledByUser = status === "cancelled" && cancelReasonType === "user";
        if (isCancelledByUser) {
            if (statusSummary[status]) {
                statusSummary[status].count++;
            }
            continue;
        }
        // ✅ الأوردر صالح ماليًا
        validOrdersForFinancials++;
        validOrderIdsForItems.push(order.orderId);
        const amount = parseFloat(order.totalAmount || "0");
        const subtotal = parseFloat(order.subtotal || "0");
        const dlvFee = parseFloat(order.deliveryFee || "0");
        const svcFee = parseFloat(order.serviceFee || "0");
        const commission = parseFloat(order.appCommission || "0");
        // 👇 الاعتماد على الاسم بدل الـ ID
        const payment = (order.paymentMethodName || "").toLowerCase();
        const isCash = payment.includes("cash") || payment.includes("استلام");
        const oType = order.orderType || "delivery";
        const oSource = order.orderSource || "online_order";
        totalRevenue += amount;
        totalSubtotal += subtotal;
        totalDeliveryFees += dlvFee;
        totalServiceFees += svcFee;
        totalAppCommission += commission;
        if (isCash) {
            totalCashCollected += amount;
            totalCashCommission += commission;
            totalCashServiceFees += svcFee;
        }
        else {
            totalDigitalCollected += amount;
            totalDigitalCommission += commission;
            totalDigitalServiceFees += svcFee;
        }
        // --- تجميعات الإحصائيات ---
        if (statusSummary[status]) {
            statusSummary[status].count++;
            statusSummary[status].totalAmount += amount;
        }
        const standardPayment = isCash ? "cash_on_delivery" : (payment.includes("محفظ") || payment.includes("wallet") ? "wallet" : "visa");
        if (paymentSummary[standardPayment]) {
            paymentSummary[standardPayment].count++;
            paymentSummary[standardPayment].totalAmount += amount;
        }
        if (orderTypeSummary[oType]) {
            orderTypeSummary[oType].count++;
            orderTypeSummary[oType].totalAmount += amount;
        }
        if (!orderSourceSummary[oSource]) {
            orderSourceSummary[oSource] = { count: 0, totalAmount: 0 };
        }
        orderSourceSummary[oSource].count++;
        orderSourceSummary[oSource].totalAmount += amount;
        const bId = order.branchId || "unknown";
        const bName = order.branchName || "Unknown Branch";
        if (!branchSummary[bId]) {
            branchSummary[bId] = {
                branchId: bId,
                branchName: bName,
                totalOrders: 0,
                cancelledOrders: 0,
                totalAmount: 0,
            };
        }
        branchSummary[bId].totalOrders++;
        branchSummary[bId].totalAmount += amount;
        if (status === "cancelled") {
            branchSummary[bId].cancelledOrders++;
        }
        if (order.createdAt) {
            const dayKey = new Date(order.createdAt).toISOString().split("T")[0];
            if (!dailyTrend[dayKey]) {
                dailyTrend[dayKey] = { date: dayKey, orders: 0, revenue: 0 };
            }
            dailyTrend[dayKey].orders++;
            dailyTrend[dayKey].revenue += amount;
        }
    }
    // ==========================================
    // 4. جلب المنتجات الأكثر مبيعاً
    // ==========================================
    let topSellingItems = [];
    if (validOrderIdsForItems.length > 0) {
        const batchSize = 500;
        const itemAggregation = {};
        for (let i = 0; i < validOrderIdsForItems.length; i += batchSize) {
            const batch = validOrderIdsForItems.slice(i, i + batchSize);
            const items = await connection_1.db
                .select({
                foodId: schema_1.orderItems.foodId,
                foodName: schema_1.food.name,
                quantity: schema_1.orderItems.quantity,
                totalPrice: schema_1.orderItems.totalPrice,
            })
                .from(schema_1.orderItems)
                .leftJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.orderItems.foodId, schema_1.food.id))
                .where((0, drizzle_orm_1.inArray)(schema_1.orderItems.orderId, batch));
            for (const item of items) {
                const fId = item.foodId;
                if (!itemAggregation[fId]) {
                    itemAggregation[fId] = { foodId: fId, foodName: item.foodName || "Unknown", totalQuantity: 0, totalRevenue: 0 };
                }
                itemAggregation[fId].totalQuantity += item.quantity;
                itemAggregation[fId].totalRevenue += parseFloat(item.totalPrice || "0");
            }
        }
        topSellingItems = Object.values(itemAggregation)
            .sort((a, b) => b.totalQuantity - a.totalQuantity)
            .slice(0, 10)
            .map(item => ({
            foodId: item.foodId,
            foodName: item.foodName,
            totalQuantity: item.totalQuantity,
            totalRevenue: item.totalRevenue.toFixed(2),
        }));
    }
    // ==========================================
    // 5. جلب باقي بيانات المطعم والتسويات
    // ==========================================
    const [wallet] = await connection_1.db.select().from(schema_1.restaurantWallets).where((0, drizzle_orm_1.eq)(schema_1.restaurantWallets.restaurantId, restaurantId)).limit(1);
    const businessPlans = await connection_1.db.select().from(schema_1.restaurantBusinessPlans).where((0, drizzle_orm_1.eq)(schema_1.restaurantBusinessPlans.restaurantId, restaurantId));
    const [restaurantInfo] = await connection_1.db.select({ id: schema_1.restaurants.id, name: schema_1.restaurants.name, logo: schema_1.restaurants.logo, status: schema_1.restaurants.status }).from(schema_1.restaurants).where((0, drizzle_orm_1.eq)(schema_1.restaurants.id, restaurantId)).limit(1);
    const netRevenue = totalRevenue - totalAppCommission - totalServiceFees;
    // حساب المديونيات الدقيق
    const restaurantOwesPlatform = totalCashCommission + totalCashServiceFees;
    const platformOwesRestaurant = totalDigitalCollected - (totalDigitalCommission + totalDigitalServiceFees);
    const netBalance = platformOwesRestaurant - restaurantOwesPlatform;
    // نسب الإلغاء 
    const cancelledCount = (statusSummary["cancelled"]?.count || 0) + (statusSummary["rejected"]?.count || 0);
    const cancellationRate = totalOrders > 0 ? ((cancelledCount / totalOrders) * 100).toFixed(2) : "0.00";
    const avgOrderValue = validOrdersForFinancials > 0 ? (totalRevenue / validOrdersForFinancials).toFixed(2) : "0.00";
    return (0, response_1.SuccessResponse)(res, {
        message: "Restaurant report generated successfully",
        data: {
            restaurant: restaurantInfo || null,
            overview: {
                totalAttemptedOrders: totalOrders,
                validFinancialOrders: validOrdersForFinancials,
                cancelledOrders: cancelledCount,
                cancellationRate: cancellationRate + "%",
                avgOrderValue,
            },
            financials: {
                grossTotalAllOrders: grossTotalAllOrders.toFixed(2), // ✅ مجموع كل الأوردرات سواء اتكنسلت أو لا
                totalRevenue: totalRevenue.toFixed(2),
                totalSubtotal: totalSubtotal.toFixed(2),
                totalDeliveryFees: totalDeliveryFees.toFixed(2),
                totalServiceFees: totalServiceFees.toFixed(2),
                totalAppCommission: totalAppCommission.toFixed(2),
                netRevenue: netRevenue.toFixed(2),
            },
            settlement: {
                cashCollectedByYou: totalCashCollected.toFixed(2),
                digitalCollectedByPlatform: totalDigitalCollected.toFixed(2),
                youOwePlatform: restaurantOwesPlatform.toFixed(2),
                platformOwesYou: platformOwesRestaurant.toFixed(2),
                netBalance: netBalance.toFixed(2),
                status: netBalance > 0
                    ? `Platform owes you ${Math.abs(netBalance).toFixed(2)} EGP`
                    : netBalance < 0
                        ? `You owe platform ${Math.abs(netBalance).toFixed(2)} EGP`
                        : "Accounts are settled",
            },
            ordersByStatus: Object.entries(statusSummary).map(([status, data]) => ({ status, count: data.count, totalAmount: data.totalAmount.toFixed(2) })),
            ordersByPayment: Object.entries(paymentSummary).map(([method, data]) => ({ paymentMethod: method, count: data.count, totalAmount: data.totalAmount.toFixed(2) })),
            ordersByType: Object.entries(orderTypeSummary).map(([type, data]) => ({ orderType: type, count: data.count, totalAmount: data.totalAmount.toFixed(2) })),
            ordersBySource: Object.entries(orderSourceSummary).map(([source, data]) => ({ orderSource: source, count: data.count, totalAmount: data.totalAmount.toFixed(2) })),
            branchBreakdown: Object.values(branchSummary).map(b => ({
                branchId: b.branchId,
                branchName: b.branchName,
                totalOrders: b.totalOrders,
                cancelledOrders: b.cancelledOrders,
                totalAmount: b.totalAmount.toFixed(2),
            })),
            dailyTrend: Object.values(dailyTrend).sort((a, b) => a.date.localeCompare(b.date)),
            topSellingItems,
            wallet: wallet ? {
                balance: wallet.balance,
                collectedCash: wallet.collectedCash,
                pendingWithdraw: wallet.pendingWithdraw,
                totalWithdrawn: wallet.totalWithdrawn,
                totalEarning: wallet.totalEarning,
            } : null,
            businessPlans: businessPlans.map(p => ({
                platformType: p.platformType,
                commissionRate: p.commissionRate || "0.00",
                serviceFee: p.serviceFee || "0.00",
                isMonthlyActive: p.isMonthlyActive,
                monthlyAmount: p.monthlyAmount,
                isQuarterlyActive: p.isQuarterlyActive,
                quarterlyAmount: p.quarterlyAmount,
                isAnnuallyActive: p.isAnnuallyActive,
                annuallyAmount: p.annuallyAmount,
            })),
        },
    });
};
exports.getMyRestaurantReport = getMyRestaurantReport;
const getOrdersByPaymentMethod = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const restaurantId = req.user.restaurantId || req.user.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID not found");
    const { startDate, endDate, branchId, paymentMethodId, paymentMethodName, paymentMethod } = req.query;
    const pMethod = (paymentMethodId || paymentMethod);
    const pName = paymentMethodName;
    // معرفة هل أرسل المستخدم فلتر وسيلة الدفع أم لا
    const hasPaymentFilter = Boolean(pMethod || pName);
    const conditions = [
        (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId),
        // ✅ إخفاء طلبات الفيزا المعلقة أو الفاشلة من تقارير الدفع — تُحسب فقط لما paymentStatus = 'paid'
        (0, order_helper_1.excludeUnpaidVisaOrders)(),
    ];
    // 1. الفلترة حسب التاريخ
    if (startDate)
        conditions.push((0, drizzle_orm_1.gte)(schema_1.orders.createdAt, new Date(startDate)));
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        conditions.push((0, drizzle_orm_1.lte)(schema_1.orders.createdAt, end));
    }
    // 2. الفلترة حسب الفرع
    if (branchId)
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.branchId, branchId));
    if (req.user.branchId)
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.branchId, req.user.branchId));
    // 3. الفلترة حسب طريقة الدفع (إن وجدت)
    if (pMethod) {
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, pMethod), (0, drizzle_orm_1.like)(schema_1.paymentMethods.name, `%${pMethod}%`)));
    }
    else if (pName) {
        conditions.push((0, drizzle_orm_1.like)(schema_1.paymentMethods.name, `%${pName}%`));
    }
    // ==========================================
    // جلب الأوردرات مع بيانات المستخدم
    // ==========================================
    const orderList = await connection_1.db
        .select({
        orderId: schema_1.orders.id,
        orderNumber: schema_1.orders.orderNumber,
        status: schema_1.orders.status,
        orderSource: schema_1.orders.orderSource,
        orderType: schema_1.orders.orderType,
        // 👇 بيانات المستخدم مع معالجة الـ NULLs والـ Guests
        userId: schema_1.orders.userId,
        userName: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.users.name}, 'Guest')`,
        userPhone: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.users.phone}, 'N/A')`,
        userEmail: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.users.email}, 'N/A')`,
        paymentMethodId: schema_1.orders.paymentMethod,
        paymentMethodName: schema_1.paymentMethods.name,
        subtotal: schema_1.orders.subtotal,
        deliveryFee: schema_1.orders.deliveryFee,
        serviceFee: schema_1.orders.serviceFee,
        appCommission: schema_1.orders.appCommission,
        totalAmount: schema_1.orders.totalAmount,
        branchId: schema_1.orders.branchId,
        branchName: schema_1.branches.name,
        createdAt: schema_1.orders.createdAt,
        cancelReasonType: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.orders.cancelReasonType}, ${schema_1.selectReasons.type})`,
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.orders.userId, schema_1.users.id))
        .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.orders.branchId, schema_1.branches.id))
        .leftJoin(schema_1.selectReasons, (0, drizzle_orm_1.eq)(schema_1.orders.cancelReasonId, schema_1.selectReasons.id))
        .leftJoin(schema_1.paymentMethods, (0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, schema_1.paymentMethods.id))
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.orders.createdAt));
    // ==========================================
    // حساب الـ Summary
    // ==========================================
    const paymentSummary = {
        cash_on_delivery: { count: 0, totalAmount: 0 },
        visa: { count: 0, totalAmount: 0 },
        wallet: { count: 0, totalAmount: 0 },
    };
    let totalFilteredOrders = 0;
    let totalFilteredAmount = 0;
    for (const order of orderList) {
        totalFilteredOrders++;
        const amount = parseFloat(order.totalAmount || "0");
        totalFilteredAmount += amount;
        const name = (order.paymentMethodName || "").toLowerCase();
        const isCash = name.includes("cash") || name.includes("استلام");
        const isWallet = name.includes("wallet") || name.includes("محفظ");
        const standardKey = isCash
            ? "cash_on_delivery"
            : isWallet
                ? "wallet"
                : "visa";
        if (paymentSummary[standardKey]) {
            paymentSummary[standardKey].count++;
            paymentSummary[standardKey].totalAmount += amount;
        }
    }
    // تجهيز قائمة الطلبات: تُرجع البيانات فقط إذا تم إرسال طريقة الدفع في الـ Query
    const formattedOrders = hasPaymentFilter
        ? orderList.map(o => ({
            ...o,
            subtotal: parseFloat(o.subtotal || "0").toFixed(2),
            deliveryFee: parseFloat(o.deliveryFee || "0").toFixed(2),
            serviceFee: parseFloat(o.serviceFee || "0").toFixed(2),
            appCommission: parseFloat(o.appCommission || "0").toFixed(2),
            totalAmount: parseFloat(o.totalAmount || "0").toFixed(2),
        }))
        : [];
    return (0, response_1.SuccessResponse)(res, {
        message: "Payment method orders retrieved successfully",
        data: {
            summary: {
                totalOrders: totalFilteredOrders,
                totalAmount: totalFilteredAmount.toFixed(2),
                paymentSummary: {
                    cash_on_delivery: {
                        count: paymentSummary.cash_on_delivery.count,
                        totalAmount: paymentSummary.cash_on_delivery.totalAmount.toFixed(2),
                    },
                    visa: {
                        count: paymentSummary.visa.count,
                        totalAmount: paymentSummary.visa.totalAmount.toFixed(2),
                    },
                    wallet: {
                        count: paymentSummary.wallet.count,
                        totalAmount: paymentSummary.wallet.totalAmount.toFixed(2),
                    },
                },
            },
            orders: formattedOrders, // ستكون [] فارغة إذا لم يتم إرسال وسيلة الدفع
        },
    });
};
exports.getOrdersByPaymentMethod = getOrdersByPaymentMethod;
const downloadSavedInvoicePDF = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const restaurantId = req.user.restaurantId || req.user.id;
    const { invoiceId } = req.params;
    // 1. نجيب الفاتورة من الداتابيز ونتأكد إنها بتاعته
    const [invoice] = await connection_1.db.select().from(invoices_1.invoices)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(invoices_1.invoices.id, invoiceId), (0, drizzle_orm_1.eq)(invoices_1.invoices.restaurantId, restaurantId)));
    if (!invoice)
        throw new BadRequest_1.BadRequest("Invoice not found");
    // 2. نجيب بيانات المطعم عشان اللوجو والاسم (White-labeling)
    const [restaurantInfo] = await connection_1.db.select().from(schema_1.restaurants).where((0, drizzle_orm_1.eq)(schema_1.restaurants.id, restaurantId));
    // 3. نعمل الـ PDF بالبيانات المحفوظة سلفاً
    const doc = new pdfkit_1.default({ margin: 50 });
    const fontPath = path_1.default.join(process.cwd(), 'assets', 'fonts', 'Arial.ttf');
    const cairoPath = path_1.default.join(process.cwd(), 'assets', 'fonts', 'Cairo-Regular.ttf');
    const chosenFontPath = fs_1.default.existsSync(fontPath) ? fontPath : (fs_1.default.existsSync(cairoPath) ? cairoPath : null);
    if (chosenFontPath) {
        doc.registerFont('CairoFont', chosenFontPath);
        doc.font('CairoFont');
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
    doc.pipe(res);
    // Header
    doc.fontSize(24).text(`${restaurantInfo.name}`, { align: 'center' });
    doc.fontSize(14).fillColor('gray').text('Invoice / Financial Statement', { align: 'center' });
    doc.moveDown();
    // Invoice Details
    doc.fontSize(12).fillColor('black').text(`Invoice Number: ${invoice.invoiceNumber}`);
    doc.text(`Status: ${(invoice.status || 'unpaid').toUpperCase()}`);
    doc.text(`Period: ${invoice.startDate.toISOString().split('T')[0]} to ${invoice.endDate.toISOString().split('T')[0]}`);
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();
    // Summary & Settlement
    doc.fontSize(16).text('Financial Summary', { underline: true });
    doc.fontSize(12).text(`Total Sales: ${invoice.totalGrossSales} EGP`);
    doc.text(`Cash Collected: ${invoice.totalCashCollected} EGP`);
    doc.text(`Digital Payments: ${invoice.totalDigitalCollected} EGP`);
    doc.text(`Total Commission Deducted: ${invoice.totalCommission} EGP`);
    doc.moveDown();
    doc.fontSize(16).text('Settlement Details', { underline: true });
    doc.fontSize(12).text(`You owe platform: ${invoice.restaurantOwesPlatform} EGP`);
    doc.text(`Platform owes you: ${invoice.platformOwesRestaurant} EGP`);
    doc.moveDown();
    const net = parseFloat(invoice.netBalance);
    doc.fontSize(14).text('Final Account Balance:', { continued: true });
    if (net > 0) {
        doc.fillColor('green').text(` Platform owes you ${Math.abs(net)} EGP`);
    }
    else if (net < 0) {
        doc.fillColor('red').text(` You owe platform ${Math.abs(net)} EGP`);
    }
    else {
        doc.fillColor('black').text(` Settled (0.00 EGP)`);
    }
    doc.end();
};
exports.downloadSavedInvoicePDF = downloadSavedInvoicePDF;
const getMyInvoices = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const restaurantId = req.user.restaurantId || req.user.id;
    // هيجيب كل فواتيره المحفوظة ويقدر يشوف الـ status بتاعتها
    const myInvoices = await connection_1.db
        .select()
        .from(invoices_1.invoices)
        .where((0, drizzle_orm_1.eq)(invoices_1.invoices.restaurantId, restaurantId))
        .orderBy((0, drizzle_orm_1.desc)(invoices_1.invoices.createdAt));
    return (0, response_1.SuccessResponse)(res, { data: myInvoices });
};
exports.getMyInvoices = getMyInvoices;
// =============================================
// Dashboard Analytics APIs
// =============================================
const getDashboardReports = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const restaurantId = req.user.restaurantId || req.user.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID not found");
    const { startDate, endDate, branchId } = req.query;
    // 1. بناء فلاتر البحث الديناميكية
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId)];
    if (startDate)
        conditions.push((0, drizzle_orm_1.gte)(schema_1.orders.createdAt, new Date(startDate)));
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        conditions.push((0, drizzle_orm_1.lte)(schema_1.orders.createdAt, end));
    }
    // Branch filter: query param takes priority; fall back to user's assigned branch
    if (branchId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.branchId, branchId));
    }
    else if (req.user.branchId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.branchId, req.user.branchId));
    }
    // 2. سحب بيانات الطلبات الأساسية مع الـ Joins المطابقة للـ Schemas
    const rawOrders = await connection_1.db
        .select({
        orderId: schema_1.orders.id,
        status: schema_1.orders.status,
        totalAmount: schema_1.orders.totalAmount,
        subtotal: schema_1.orders.subtotal,
        discountAmount: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.orders.discountAmount}, '0.00')`,
        discountId: schema_1.orders.discountId,
        discountSource: schema_1.orders.discountSource,
        couponCode: schema_1.orders.couponCode,
        couponId: schema_1.orders.couponId,
        orderSource: schema_1.orders.orderSource,
        createdAt: schema_1.orders.createdAt,
        cancelReasonType: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.orders.cancelReasonType}, ${schema_1.selectReasons.type})`,
        branchName: schema_1.branches.name,
        zoneName: schema_1.zones.name,
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.selectReasons, (0, drizzle_orm_1.eq)(schema_1.orders.cancelReasonId, schema_1.selectReasons.id))
        .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.orders.branchId, schema_1.branches.id))
        .leftJoin(schema_1.addresses, (0, drizzle_orm_1.eq)(schema_1.orders.addressId, schema_1.addresses.id)) // للوصول للـ Zone
        .leftJoin(schema_1.zones, (0, drizzle_orm_1.eq)(schema_1.addresses.zoneId, schema_1.zones.id))
        .where((0, drizzle_orm_1.and)(...conditions));
    // ==========================================
    // تجهيز المتغيرات للإحصائيات
    // ==========================================
    let totalRevenue = 0;
    let numberOfOrders = 0;
    const peakHoursObj = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i < 10 ? `0${i}:00` : `${i}:00`, 0]));
    const peakDaysObj = {
        "Sunday": 0, "Monday": 0, "Tuesday": 0, "Wednesday": 0, "Thursday": 0, "Friday": 0, "Saturday": 0
    };
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    let userCancellations = 0;
    let restaurantCancellations = 0;
    let otherCancellations = 0;
    const orderSourcesObj = {};
    const discountEffectivenessMap = {};
    const branchesNetSales = {};
    const couponAnalysis = {};
    const geoMapObj = {};
    const orderIds = [];
    // ==========================================
    // معالجة بيانات الطلبات (Loop)
    // ==========================================
    for (const o of rawOrders) {
        orderIds.push(o.orderId);
        const amount = parseFloat(o.totalAmount || "0");
        const sub = parseFloat(o.subtotal || "0");
        const disc = parseFloat(o.discountAmount || "0");
        if (o.status !== "cancelled" && o.status !== "refund") {
            totalRevenue += amount;
            numberOfOrders++;
            // أوقات وأيام الذروة
            if (o.createdAt) {
                const date = new Date(o.createdAt);
                const h = date.getHours();
                const hourLabel = h < 10 ? `0${h}:00` : `${h}:00`;
                peakHoursObj[hourLabel]++;
                peakDaysObj[dayNames[date.getDay()]] += amount;
            }
            // مبيعات الفروع
            const bName = o.branchName || "Unknown Branch";
            branchesNetSales[bName] = (branchesNetSales[bName] || 0) + amount;
            // مصادر الطلب (Order Source)
            const source = o.orderSource || "unknown";
            const platformName = source === "my_keeto" ? "my_keeto"
                : source === "online_order_web" ? "Website"
                    : source === "online_order_app" ? "App"
                        : source === "food_aggregator" ? "Aggregator"
                            : source;
            orderSourcesObj[platformName] = (orderSourcesObj[platformName] || 0) + 1;
            // الخريطة الجغرافية
            const zName = o.zoneName || "Unknown Zone";
            geoMapObj[zName] = (geoMapObj[zName] || 0) + amount;
        }
        // الإلغاءات
        if (o.status === "cancelled") {
            if (o.cancelReasonType === "user")
                userCancellations++;
            else if (o.cancelReasonType === "restaurant")
                restaurantCancellations++;
            else
                otherCancellations++;
        }
        // تحليل الخصومات والكوبونات (لأي طلب فيه خصم — سواء كوبون أو خصم مباشر)
        const hasDiscount = disc > 0 || Boolean(o.discountId) || Boolean(o.couponId) || Boolean(o.couponCode);
        if (hasDiscount && o.status !== "cancelled" && o.status !== "refund") {
            // إذا discountAmount = 0 لكن في discountId، نحسب الخصم من الفرق
            const effectiveDisc = disc > 0 ? disc : sub - amount > 0 ? sub - amount : 0;
            const revenueBefore = amount + effectiveDisc;
            const discountPct = revenueBefore > 0 && effectiveDisc > 0 ? ((effectiveDisc / revenueBefore) * 100).toFixed(0) : "0";
            if (!discountEffectivenessMap[discountPct])
                discountEffectivenessMap[discountPct] = { revenue: 0, count: 0 };
            discountEffectivenessMap[discountPct].revenue += amount;
            discountEffectivenessMap[discountPct].count++;
        }
        // تحليل الكوبونات (revenue before/after per coupon code or couponId)
        const couponKey = o.couponCode || (o.couponId ? `coupon:${o.couponId}` : null);
        if (couponKey && o.status !== "cancelled" && o.status !== "refund") {
            const effectiveDisc2 = disc > 0 ? disc : sub - amount > 0 ? sub - amount : 0;
            const revenueBefore = amount + effectiveDisc2;
            if (!couponAnalysis[couponKey])
                couponAnalysis[couponKey] = { before: 0, after: 0 };
            couponAnalysis[couponKey].before += revenueBefore;
            couponAnalysis[couponKey].after += amount;
        }
    }
    // ==========================================
    // جلب أصناف الطلبات (Order Items) للـ Top Products & Market Basket
    // ==========================================
    let topProducts = [];
    const combosObj = {};
    const productSales = {};
    if (orderIds.length > 0) {
        const batchSize = 500; // تقسيم الطلبات عشان الـ Query ما تضربش Limit
        for (let i = 0; i < orderIds.length; i += batchSize) {
            const batch = orderIds.slice(i, i + batchSize);
            const oItems = await connection_1.db
                .select({
                orderId: schema_1.orderItems.orderId,
                foodId: schema_1.orderItems.foodId,
                totalPrice: schema_1.orderItems.totalPrice,
                foodName: schema_1.food.name,
            })
                .from(schema_1.orderItems)
                .leftJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.orderItems.foodId, schema_1.food.id))
                .where((0, drizzle_orm_1.inArray)(schema_1.orderItems.orderId, batch));
            const itemsByOrder = {};
            for (const item of oItems) {
                const fName = item.foodName || "Unknown";
                const fId = item.foodId;
                const price = parseFloat(item.totalPrice || "0");
                if (!productSales[fId])
                    productSales[fId] = { name: fName, rev: 0, count: 0 };
                productSales[fId].rev += price;
                productSales[fId].count++;
                if (!itemsByOrder[item.orderId])
                    itemsByOrder[item.orderId] = [];
                // Prevent duplicate item names in the same order combination
                if (!itemsByOrder[item.orderId].find(i => i.id === fId)) {
                    itemsByOrder[item.orderId].push({ id: fId, name: fName });
                }
            }
            // Market Basket Analysis (Combos)
            for (const oId in itemsByOrder) {
                const items = itemsByOrder[oId];
                for (let j = 0; j < items.length; j++) {
                    for (let k = j + 1; k < items.length; k++) {
                        const comboNames = [items[j].name, items[k].name].sort();
                        const key = comboNames.join(" + ");
                        combosObj[key] = (combosObj[key] || 0) + 1;
                    }
                }
            }
        }
        topProducts = Object.values(productSales)
            .sort((a, b) => b.rev - a.rev)
            .slice(0, 5)
            .map(p => ({ productName: p.name, revenue: p.rev.toFixed(2) }));
    }
    const marketBasket = Object.entries(combosObj)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => {
        const confidence = numberOfOrders > 0 ? ((count / numberOfOrders) * 100).toFixed(2) : "0.00";
        return { comboName: name, confidencePercent: confidence };
    });
    // ==========================================
    // جلب التقييمات (Rating)
    // ==========================================
    const ratingConditions = [(0, drizzle_orm_1.eq)(schema_1.restaurantRatings.restaurantId, restaurantId)];
    if (startDate)
        ratingConditions.push((0, drizzle_orm_1.gte)(schema_1.restaurantRatings.createdAt, new Date(startDate)));
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        ratingConditions.push((0, drizzle_orm_1.lte)(schema_1.restaurantRatings.createdAt, end));
    }
    const ratings = await connection_1.db.select({ rating: schema_1.restaurantRatings.rating })
        .from(schema_1.restaurantRatings)
        .where((0, drizzle_orm_1.and)(...ratingConditions));
    let avgRating = "0.00";
    if (ratings.length > 0) {
        const sum = ratings.reduce((acc, r) => acc + (r.rating || 0), 0);
        avgRating = (sum / ratings.length).toFixed(2);
    }
    // ==========================================
    // إجمالي مستخدمي / عملاء المطعم (Total Users)
    // ==========================================
    const [resUsersRow] = await connection_1.db
        .select({ total: (0, drizzle_orm_1.sql) `count(distinct ${schema_1.restaurant_users.userId})` })
        .from(schema_1.restaurant_users)
        .where((0, drizzle_orm_1.eq)(schema_1.restaurant_users.restaurantId, restaurantId));
    let totalUsers = Number(resUsersRow?.total || 0);
    if (totalUsers === 0) {
        const [ordersUsersRow] = await connection_1.db
            .select({ total: (0, drizzle_orm_1.sql) `count(distinct ${schema_1.orders.userId})` })
            .from(schema_1.orders)
            .where((0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId));
        totalUsers = Number(ordersUsersRow?.total || 0);
    }
    // ==========================================
    // إرسال الـ Response
    // ==========================================
    return res.status(200).json({
        success: true,
        message: "Dashboard reports generated",
        data: {
            cards: {
                totalRevenue: totalRevenue.toFixed(2),
                numberOfOrders,
                averageOrderValue: numberOfOrders > 0 ? (totalRevenue / numberOfOrders).toFixed(2) : "0.00",
                totalUsers,
            },
            totalUsers,
            peakHours: Object.entries(peakHoursObj).map(([hour, orders]) => ({ hour, orders })),
            peakDays: Object.entries(peakDaysObj).map(([day, rev]) => ({ day, revenue: rev.toFixed(2) })),
            topProducts,
            cancellations: [
                { type: "User", orders: userCancellations },
                { type: "Restaurant", orders: restaurantCancellations },
                ...(otherCancellations > 0 ? [{ type: "Other", orders: otherCancellations }] : [])
            ],
            discountEffectiveness: Object.entries(discountEffectivenessMap).map(([pct, data]) => ({
                discountPercent: pct,
                revenue: data.revenue.toFixed(2),
                bubbleSize: data.revenue.toFixed(2)
            })),
            branchesNetSales: Object.entries(branchesNetSales).map(([b, rev]) => ({ branch: b, netSales: rev.toFixed(2) })),
            appVsWebsite: Object.entries(orderSourcesObj).map(([platform, orders]) => ({ platform, orders })),
            rating: avgRating,
            geographicMap: Object.entries(geoMapObj).map(([z, rev]) => ({ zone: z, revenue: rev.toFixed(2) })),
            marketBasket,
            couponAnalysis: Object.entries(couponAnalysis).map(([code, revs]) => ({
                couponName: code,
                revenueBeforeDiscount: revs.before.toFixed(2),
                revenueAfterDiscount: revs.after.toFixed(2)
            }))
        }
    });
};
exports.getDashboardReports = getDashboardReports;
const getVisaReport = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const restaurantId = req.user.restaurantId || req.user.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID not found");
    const { startDate, endDate, branchId, status, paymentStatus, payment_status, type, orderNumber } = req.query;
    const rawStatus = (status || paymentStatus || payment_status || type || "");
    const normalizedStatus = rawStatus.trim().toLowerCase();
    const isSuccessFilter = ["success", "succes", "paid"].includes(normalizedStatus);
    const isFailedFilter = ["failed", "faild", "payment_failed"].includes(normalizedStatus);
    // 🔍 معرفة نوع بوابة الدفع للمطعم (SYSTEM أم CUSTOM) وتحديد الاسم
    const [restaurantSetting] = await connection_1.db
        .select({
        paymentGatewayType: schema_1.restaurantSettings.paymentGatewayType,
    })
        .from(schema_1.restaurantSettings)
        .where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, restaurantId))
        .limit(1);
    const [customCred] = await connection_1.db
        .select({
        id: schema_1.restaurantPaymentCredentials.id,
        title: schema_1.restaurantPaymentCredentials.title,
        provider: schema_1.restaurantPaymentCredentials.provider,
    })
        .from(schema_1.restaurantPaymentCredentials)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restaurantPaymentCredentials.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.restaurantPaymentCredentials.isActive, true)))
        .limit(1);
    const gatewayType = restaurantSetting?.paymentGatewayType === "CUSTOM" ? "CUSTOM" : "SYSTEM";
    const gatewayName = gatewayType === "CUSTOM"
        ? (customCred?.title || customCred?.provider || "Custom Visa")
        : "kashier";
    // الشرط الأساسي: أوردرات الفيزا / الدفع الإلكتروني لهذا المطعم
    const conditions = [
        (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId),
        (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, "visa"), (0, drizzle_orm_1.sql) `${schema_1.orders.paymentOrderId} IS NOT NULL`, (0, drizzle_orm_1.sql) `(${schema_1.paymentMethods.name} IS NOT NULL 
                AND LOWER(${schema_1.paymentMethods.name}) NOT LIKE '%cash%' 
                AND ${schema_1.paymentMethods.nameAr} NOT LIKE '%استلام%' 
                AND LOWER(${schema_1.paymentMethods.name}) NOT LIKE '%wallet%' 
                AND ${schema_1.paymentMethods.nameAr} NOT LIKE '%محفظ%')`)
    ];
    // الفلترة حسب التاريخ
    if (startDate)
        conditions.push((0, drizzle_orm_1.gte)(schema_1.orders.createdAt, new Date(startDate)));
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        conditions.push((0, drizzle_orm_1.lte)(schema_1.orders.createdAt, end));
    }
    // الفلترة حسب الفرع
    if (branchId)
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.branchId, branchId));
    if (req.user.branchId)
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.branchId, req.user.branchId));
    // الفلترة برقم الطلب
    if (orderNumber)
        conditions.push((0, drizzle_orm_1.like)(schema_1.orders.orderNumber, `%${orderNumber.trim()}%`));
    // الفلترة بحالة الفيزا (نجاح / فشل) إذا تم تمريرها بالـ Query، وإلا افتراضياً يرجع الكل
    if (isSuccessFilter) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.paymentStatus, "paid"));
    }
    else if (isFailedFilter) {
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.orders.paymentStatus, "payment_failed"), (0, drizzle_orm_1.and)((0, drizzle_orm_1.ne)(schema_1.orders.paymentStatus, "paid"), (0, drizzle_orm_1.eq)(schema_1.orders.status, "cancelled"))));
    }
    const orderList = await connection_1.db
        .select({
        orderId: schema_1.orders.id,
        orderNumber: schema_1.orders.orderNumber,
        dailyOrderNumber: schema_1.orders.dailyOrderNumber,
        status: schema_1.orders.status,
        paymentStatus: schema_1.orders.paymentStatus,
        paymentOrderId: schema_1.orders.paymentOrderId,
        paymentTransactionId: schema_1.orders.paymentTransactionId,
        orderSource: schema_1.orders.orderSource,
        orderType: schema_1.orders.orderType,
        paymentGateway: schema_1.orders.paymentGateway,
        paymentGatewayType: schema_1.orders.paymentGatewayType,
        // بيانات العميل
        userId: schema_1.orders.userId,
        userName: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.users.name}, 'Guest')`,
        userPhone: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.users.phone}, 'N/A')`,
        userEmail: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.users.email}, 'N/A')`,
        // وسيلة الدفع
        paymentMethodId: schema_1.orders.paymentMethod,
        paymentMethodName: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.paymentMethods.name}, 'Visa / Card')`,
        paymentMethodNameAr: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.paymentMethods.nameAr}, 'فيزا / بطاقة')`,
        // المبالغ المالية
        subtotal: schema_1.orders.subtotal,
        deliveryFee: schema_1.orders.deliveryFee,
        serviceFee: schema_1.orders.serviceFee,
        appCommission: schema_1.orders.appCommission,
        discountAmount: schema_1.orders.discountAmount,
        totalAmount: schema_1.orders.totalAmount,
        visaCommission: schema_1.orders.visaCommission,
        // بيانات الفرع
        branchId: schema_1.orders.branchId,
        branchName: schema_1.branches.name,
        branchNameAr: schema_1.branches.nameAr,
        branchNameFr: schema_1.branches.nameFr,
        createdAt: schema_1.orders.createdAt,
        updatedAt: schema_1.orders.updatedAt,
        cancelReason: schema_1.orders.cancelReason,
        cancelReasonType: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.orders.cancelReasonType}, ${schema_1.selectReasons.type})`,
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.orders.userId, schema_1.users.id))
        .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.orders.branchId, schema_1.branches.id))
        .leftJoin(schema_1.selectReasons, (0, drizzle_orm_1.eq)(schema_1.orders.cancelReasonId, schema_1.selectReasons.id))
        .leftJoin(schema_1.paymentMethods, (0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, schema_1.paymentMethods.id))
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.orders.createdAt));
    let totalOrdersCount = 0;
    let totalOrdersAmount = 0;
    let successCount = 0;
    let successAmount = 0;
    let failedCount = 0;
    let failedAmount = 0;
    let totalVisaCommission = 0;
    const formattedOrders = orderList.map(order => {
        const amount = parseFloat(order.totalAmount || "0");
        totalOrdersCount++;
        totalOrdersAmount += amount;
        const isPaid = order.paymentStatus === "paid";
        const isFailed = order.paymentStatus === "payment_failed" || (order.paymentStatus !== "paid" && order.status === "cancelled");
        const visaStatus = isPaid ? "success" : (isFailed ? "failed" : "pending");
        if (isPaid) {
            successCount++;
            successAmount += amount;
            totalVisaCommission += parseFloat(order.visaCommission || "0");
        }
        else if (isFailed) {
            failedCount++;
            failedAmount += amount;
        }
        return {
            ...order,
            visaStatus,
            gatewayType: order.paymentGatewayType || gatewayType,
            gatewayName: order.paymentGateway || gatewayName,
            subtotal: parseFloat(order.subtotal || "0").toFixed(2),
            deliveryFee: parseFloat(order.deliveryFee || "0").toFixed(2),
            serviceFee: parseFloat(order.serviceFee || "0").toFixed(2),
            appCommission: parseFloat(order.appCommission || "0").toFixed(2),
            discountAmount: parseFloat(order.discountAmount || "0").toFixed(2),
            totalAmount: amount.toFixed(2),
            visaCommission: parseFloat(order.visaCommission || "0").toFixed(2),
        };
    });
    return (0, response_1.SuccessResponse)(res, {
        message: "Visa report retrieved successfully",
        data: {
            gateway: {
                type: gatewayType,
                name: gatewayName,
            },
            filter: {
                status: isSuccessFilter ? "success" : (isFailedFilter ? "failed" : "all"),
                startDate: startDate || null,
                endDate: endDate || null,
                branchId: branchId || req.user.branchId || null,
            },
            summary: {
                totalOrders: totalOrdersCount,
                totalAmount: totalOrdersAmount.toFixed(2),
                totalVisaCommission: totalVisaCommission.toFixed(2),
                success: {
                    count: successCount,
                    totalAmount: successAmount.toFixed(2),
                },
                failed: {
                    count: failedCount,
                    totalAmount: failedAmount.toFixed(2),
                },
            },
            orders: formattedOrders,
        }
    });
};
exports.getVisaReport = getVisaReport;
exports.reportVisa = exports.getVisaReport;
const getDeliveryManReport = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const restaurantId = req.user.restaurantId || req.user.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID not found");
    const { deliveryManId, branchId, startDate, endDate, status, paymentMethod, search, page, limit, } = req.query;
    const conditions = [
        (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId),
        (0, drizzle_orm_1.eq)(schema_1.orders.orderType, "delivery"),
        (0, order_helper_1.excludeUnpaidVisaOrders)(),
    ];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const defaultStart = startDate ? new Date(startDate) : today;
    const defaultEnd = endDate ? new Date(endDate) : new Date(today);
    defaultEnd.setHours(23, 59, 59, 999);
    conditions.push((0, drizzle_orm_1.gte)(schema_1.orders.createdAt, defaultStart));
    conditions.push((0, drizzle_orm_1.lte)(schema_1.orders.createdAt, defaultEnd));
    if (branchId)
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.branchId, branchId));
    if (req.user.branchId)
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.branchId, req.user.branchId));
    if (deliveryManId && deliveryManId !== "all") {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.deliveryManId, deliveryManId));
    }
    if (status && status !== "all") {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.status, status));
    }
    if (search) {
        const searchPattern = `%${search.trim()}%`;
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(schema_1.orders.orderNumber, searchPattern), (0, drizzle_orm_1.like)(schema_1.users.name, searchPattern), (0, drizzle_orm_1.like)(schema_1.users.phone, searchPattern), (0, drizzle_orm_1.like)(schema_1.deliveryMen.name, searchPattern), (0, drizzle_orm_1.like)(schema_1.deliveryMen.phone, searchPattern)));
    }
    if (paymentMethod && paymentMethod !== "all") {
        const pm = paymentMethod.toLowerCase().trim();
        if (pm === "cash" || pm === "cash_on_delivery") {
            conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, "cash"), (0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, "cash_on_delivery"), (0, drizzle_orm_1.like)(schema_1.paymentMethods.name, "%cash%"), (0, drizzle_orm_1.like)(schema_1.paymentMethods.nameAr, "%استلام%"), (0, drizzle_orm_1.like)(schema_1.paymentMethods.nameAr, "%كاش%")));
        }
        else if (pm === "visa" || pm === "card" || pm === "online") {
            conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, "visa"), (0, drizzle_orm_1.like)(schema_1.paymentMethods.name, "%visa%"), (0, drizzle_orm_1.like)(schema_1.paymentMethods.name, "%card%"), (0, drizzle_orm_1.like)(schema_1.paymentMethods.nameAr, "%فيزا%"), (0, drizzle_orm_1.like)(schema_1.paymentMethods.nameAr, "%بطاقة%")));
        }
        else {
            conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, paymentMethod), (0, drizzle_orm_1.like)(schema_1.paymentMethods.name, `%${paymentMethod}%`), (0, drizzle_orm_1.like)(schema_1.paymentMethods.nameAr, `%${paymentMethod}%`)));
        }
    }
    const orderList = await connection_1.db
        .select({
        orderId: schema_1.orders.id,
        orderNumber: schema_1.orders.orderNumber,
        dailyOrderNumber: schema_1.orders.dailyOrderNumber,
        status: schema_1.orders.status,
        orderType: schema_1.orders.orderType,
        orderSource: schema_1.orders.orderSource,
        userId: schema_1.orders.userId,
        customerName: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.users.name}, 'Guest')`,
        customerPhone: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.users.phone}, 'N/A')`,
        deliveryManId: schema_1.orders.deliveryManId,
        deliveryManName: (0, drizzle_orm_1.sql) `${schema_1.deliveryMen.name}`,
        deliveryManPhone: (0, drizzle_orm_1.sql) `${schema_1.deliveryMen.phone}`,
        deliveryManImage: (0, drizzle_orm_1.sql) `${schema_1.deliveryMen.image}`,
        branchId: schema_1.orders.branchId,
        branchName: schema_1.branches.name,
        branchNameAr: schema_1.branches.nameAr,
        paymentMethodId: schema_1.orders.paymentMethod,
        paymentMethodName: schema_1.paymentMethods.name,
        paymentMethodNameAr: schema_1.paymentMethods.nameAr,
        paymentStatus: schema_1.orders.paymentStatus,
        isCashCollected: schema_1.orders.isCashCollected,
        cashCollectedAt: schema_1.orders.cashCollectedAt,
        cashCollectedBy: schema_1.orders.cashCollectedBy,
        subtotal: schema_1.orders.subtotal,
        deliveryFee: schema_1.orders.deliveryFee,
        serviceFee: schema_1.orders.serviceFee,
        appCommission: schema_1.orders.appCommission,
        discountAmount: schema_1.orders.discountAmount,
        totalAmount: schema_1.orders.totalAmount,
        shippingAddress: schema_1.orders.shippingAddress,
        note: schema_1.orders.note,
        createdAt: schema_1.orders.createdAt,
        updatedAt: schema_1.orders.updatedAt,
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.deliveryMen, (0, drizzle_orm_1.eq)(schema_1.orders.deliveryManId, schema_1.deliveryMen.id))
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.orders.userId, schema_1.users.id))
        .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.orders.branchId, schema_1.branches.id))
        .leftJoin(schema_1.paymentMethods, (0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, schema_1.paymentMethods.id))
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.orders.createdAt));
    const checkPaymentType = (name, nameAr, raw) => {
        const n = (name || "").toLowerCase();
        const nar = (nameAr || "");
        const r = (raw || "").toLowerCase();
        const isCash = n.includes("cash") || nar.includes("استلام") || nar.includes("كاش") || r.includes("cash") || r.includes("استلام");
        const isWallet = n.includes("wallet") || nar.includes("محفظ") || r.includes("wallet");
        const isVisa = !isCash && !isWallet;
        return { isCash, isVisa, isWallet };
    };
    let totalOrders = 0;
    let totalDeliveredOrders = 0;
    let totalOutForDeliveryOrders = 0;
    let totalPendingOrders = 0;
    let totalCancelledOrders = 0;
    let totalAmount = 0;
    let deliveredAmount = 0;
    let totalCash = 0;
    let totalCashOrders = 0;
    let totalVisa = 0;
    let totalVisaOrders = 0;
    let totalWallet = 0;
    let totalWalletOrders = 0;
    let cashOnHand = 0;
    let cashCollected = 0;
    const deliveryMenMap = new Map();
    const formattedOrders = orderList.map(order => {
        totalOrders++;
        const amount = parseFloat(order.totalAmount || "0");
        const { isCash, isVisa, isWallet } = checkPaymentType(order.paymentMethodName, order.paymentMethodNameAr, order.paymentMethodId);
        const isDelivered = order.status === "delivered";
        const isCashCollected = Boolean(order.isCashCollected);
        totalAmount += amount;
        if (order.status === "delivered") {
            totalDeliveredOrders++;
            deliveredAmount += amount;
            if (isCash) {
                totalCash += amount;
                totalCashOrders++;
                if (isCashCollected) {
                    cashCollected += amount;
                }
                else {
                    cashOnHand += amount;
                }
            }
            else if (isVisa) {
                totalVisa += amount;
                totalVisaOrders++;
            }
            else if (isWallet) {
                totalWallet += amount;
                totalWalletOrders++;
            }
        }
        else if (order.status === "out_for_delivery") {
            totalOutForDeliveryOrders++;
        }
        else if (order.status === "cancelled" || order.status === "failed" || order.status === "refund") {
            totalCancelledOrders++;
        }
        else {
            totalPendingOrders++;
        }
        const dmId = order.deliveryManId || "unassigned";
        const dmName = order.deliveryManName || "Unassigned";
        const dmPhone = order.deliveryManPhone || null;
        const dmImage = order.deliveryManImage || null;
        if (!deliveryMenMap.has(dmId)) {
            deliveryMenMap.set(dmId, {
                deliveryManId: dmId,
                deliveryManName: dmName,
                deliveryManPhone: dmPhone,
                deliveryManImage: dmImage,
                totalOrders: 0,
                deliveredOrdersCount: 0,
                outForDeliveryOrdersCount: 0,
                totalAmount: 0,
                deliveredAmount: 0,
                totalCash: 0,
                totalVisa: 0,
                cashOnHand: 0,
                cashCollected: 0,
                ordersCountByStatus: {},
            });
        }
        const dmGroup = deliveryMenMap.get(dmId);
        dmGroup.totalOrders++;
        dmGroup.totalAmount += amount;
        dmGroup.ordersCountByStatus[order.status || "unknown"] = (dmGroup.ordersCountByStatus[order.status || "unknown"] || 0) + 1;
        if (isDelivered) {
            dmGroup.deliveredOrdersCount++;
            dmGroup.deliveredAmount += amount;
            if (isCash) {
                dmGroup.totalCash += amount;
                if (isCashCollected) {
                    dmGroup.cashCollected += amount;
                }
                else {
                    dmGroup.cashOnHand += amount;
                }
            }
            else if (isVisa) {
                dmGroup.totalVisa += amount;
            }
        }
        else if (order.status === "out_for_delivery") {
            dmGroup.outForDeliveryOrdersCount++;
        }
        return {
            ...order,
            paymentType: isCash ? "cash" : isVisa ? "visa" : "wallet",
            isCash,
            isVisa,
            isWallet,
            isCashCollected,
            subtotal: parseFloat(order.subtotal || "0").toFixed(2),
            deliveryFee: parseFloat(order.deliveryFee || "0").toFixed(2),
            serviceFee: parseFloat(order.serviceFee || "0").toFixed(2),
            appCommission: parseFloat(order.appCommission || "0").toFixed(2),
            discountAmount: parseFloat(order.discountAmount || "0").toFixed(2),
            totalAmount: amount.toFixed(2),
        };
    });
    const deliveryMenBreakdown = Array.from(deliveryMenMap.values()).map(dm => ({
        ...dm,
        totalAmount: dm.totalAmount.toFixed(2),
        deliveredAmount: dm.deliveredAmount.toFixed(2),
        totalCash: dm.totalCash.toFixed(2),
        totalVisa: dm.totalVisa.toFixed(2),
        cashOnHand: dm.cashOnHand.toFixed(2),
        cashCollected: dm.cashCollected.toFixed(2),
        cashWithDeliveryMan: dm.cashOnHand.toFixed(2),
    }));
    let paginatedOrders = formattedOrders;
    let paginationInfo = null;
    if (page && limit) {
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.max(1, parseInt(limit, 10) || 20);
        const startIndex = (pageNum - 1) * limitNum;
        paginatedOrders = formattedOrders.slice(startIndex, startIndex + limitNum);
        paginationInfo = {
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(formattedOrders.length / limitNum),
            totalOrders: formattedOrders.length,
        };
    }
    return (0, response_1.SuccessResponse)(res, {
        message: "Delivery man report retrieved successfully",
        summary: {
            totalOrders,
            totalDeliveredOrders,
            totalOutForDeliveryOrders,
            totalPendingOrders,
            totalCancelledOrders,
            totalAmount: totalAmount.toFixed(2),
            deliveredAmount: deliveredAmount.toFixed(2),
            totalCash: totalCash.toFixed(2),
            totalVisa: totalVisa.toFixed(2),
            totalWallet: totalWallet.toFixed(2),
            cashOnHand: cashOnHand.toFixed(2),
            cashWithDeliveryMan: cashOnHand.toFixed(2),
            cashCollected: cashCollected.toFixed(2),
            totalCashOrders,
            totalVisaOrders,
            totalWalletOrders,
        },
        deliveryMen: deliveryMenBreakdown,
        orders: paginatedOrders,
        ...(paginationInfo ? { pagination: paginationInfo } : {}),
    });
};
exports.getDeliveryManReport = getDeliveryManReport;
// =============================================
// Food & Variations Sales Report API
// =============================================
const getFoodReport = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const restaurantId = req.user.restaurantId || req.user.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID not found");
    const { startDate, endDate, branchId, status, search, categoryId, arrangedType, sortOrder, sort, sortBy, onlySold, page, limit, } = req.query;
    // 1. تحديد النطاق الزمني (الافتراضي هو اليوم الحالي)
    const now = new Date();
    let start;
    let end;
    let isDefaultToday = false;
    if (startDate && endDate) {
        start = new Date(startDate);
        start.setUTCHours(0, 0, 0, 0);
        end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);
    }
    else if (startDate) {
        start = new Date(startDate);
        start.setUTCHours(0, 0, 0, 0);
        end = new Date(startDate);
        end.setUTCHours(23, 59, 59, 999);
    }
    else if (endDate) {
        end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);
        start = new Date(endDate);
        start.setUTCHours(0, 0, 0, 0);
    }
    else {
        isDefaultToday = true;
        start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
        end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    }
    // 2. شروط الطلبات
    const orderConditions = [
        (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId),
        (0, order_helper_1.excludeUnpaidVisaOrders)(),
        (0, drizzle_orm_1.gte)(schema_1.orders.createdAt, start),
        (0, drizzle_orm_1.lte)(schema_1.orders.createdAt, end),
    ];
    if (branchId)
        orderConditions.push((0, drizzle_orm_1.eq)(schema_1.orders.branchId, branchId));
    if (req.user.branchId)
        orderConditions.push((0, drizzle_orm_1.eq)(schema_1.orders.branchId, req.user.branchId));
    if (status) {
        orderConditions.push((0, drizzle_orm_1.eq)(schema_1.orders.status, status));
    }
    else {
        orderConditions.push((0, drizzle_orm_1.and)((0, drizzle_orm_1.ne)(schema_1.orders.status, "cancelled"), (0, drizzle_orm_1.ne)(schema_1.orders.status, "refund"), (0, drizzle_orm_1.ne)(schema_1.orders.status, "failed")));
    }
    // 3. جلب الطلبات المطابقة للشروط
    const matchedOrders = await connection_1.db
        .select({ id: schema_1.orders.id })
        .from(schema_1.orders)
        .where((0, drizzle_orm_1.and)(...orderConditions));
    const orderIds = matchedOrders.map(o => o.id);
    let orderItemsList = [];
    if (orderIds.length > 0) {
        const batchSize = 500;
        for (let i = 0; i < orderIds.length; i += batchSize) {
            const batch = orderIds.slice(i, i + batchSize);
            const items = await connection_1.db
                .select({
                id: schema_1.orderItems.id,
                orderId: schema_1.orderItems.orderId,
                foodId: schema_1.orderItems.foodId,
                quantity: schema_1.orderItems.quantity,
                basePrice: schema_1.orderItems.basePrice,
                variationsPrice: schema_1.orderItems.variationsPrice,
                totalPrice: schema_1.orderItems.totalPrice,
                variations: schema_1.orderItems.variations,
            })
                .from(schema_1.orderItems)
                .where((0, drizzle_orm_1.inArray)(schema_1.orderItems.orderId, batch));
            orderItemsList.push(...items);
        }
    }
    // 4. جلب وجبات المطعم
    const foodConditions = [
        (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId),
        foodConditions_1.activeFoodCondition,
    ];
    if (categoryId)
        foodConditions.push((0, drizzle_orm_1.eq)(schema_1.food.categoryid, categoryId));
    if (search) {
        foodConditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(schema_1.food.name, `%${search}%`), (0, drizzle_orm_1.like)(schema_1.food.nameAr, `%${search}%`)));
    }
    const foodsList = await connection_1.db
        .select({
        id: schema_1.food.id,
        name: schema_1.food.name,
        nameAr: schema_1.food.nameAr,
        nameFr: schema_1.food.nameFr,
        price: schema_1.food.price,
        image: schema_1.food.image,
        categoryid: schema_1.food.categoryid,
        categoryName: schema_1.categories.name,
        categoryNameAr: schema_1.categories.nameAr,
        status: schema_1.food.status,
    })
        .from(schema_1.food)
        .leftJoin(schema_1.categories, (0, drizzle_orm_1.eq)(schema_1.food.categoryid, schema_1.categories.id))
        .where((0, drizzle_orm_1.and)(...foodConditions));
    // في حال بيع وجبات كانت محذوفة مؤخراً أو غير متواجدة في القائمة بدون فلاتر بحث
    const currentFoodIds = new Set(foodsList.map(f => f.id));
    if (!search && !categoryId) {
        const missingFoodIds = [...new Set(orderItemsList.map(i => i.foodId))].filter(id => !currentFoodIds.has(id));
        if (missingFoodIds.length > 0) {
            const missingFoods = await connection_1.db
                .select({
                id: schema_1.food.id,
                name: schema_1.food.name,
                nameAr: schema_1.food.nameAr,
                nameFr: schema_1.food.nameFr,
                price: schema_1.food.price,
                image: schema_1.food.image,
                categoryid: schema_1.food.categoryid,
                categoryName: schema_1.categories.name,
                categoryNameAr: schema_1.categories.nameAr,
                status: schema_1.food.status,
            })
                .from(schema_1.food)
                .leftJoin(schema_1.categories, (0, drizzle_orm_1.eq)(schema_1.food.categoryid, schema_1.categories.id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.food.id, missingFoodIds)));
            foodsList.push(...missingFoods);
        }
    }
    const allFoodIds = foodsList.map(f => f.id);
    let dbVariations = [];
    let dbOptions = [];
    if (allFoodIds.length > 0) {
        dbVariations = await connection_1.db
            .select()
            .from(schema_1.foodVariations)
            .where((0, drizzle_orm_1.inArray)(schema_1.foodVariations.foodId, allFoodIds));
        const varIds = dbVariations.map(v => v.id);
        if (varIds.length > 0) {
            dbOptions = await connection_1.db
                .select()
                .from(schema_1.variationOptions)
                .where((0, drizzle_orm_1.inArray)(schema_1.variationOptions.variationId, varIds));
        }
    }
    // 5. تهيئة خريطة الوجبات مع الفارييشنز والأوبشنز
    const foodMap = new Map();
    for (const f of foodsList) {
        foodMap.set(f.id, {
            foodId: f.id,
            foodName: f.name,
            foodNameAr: f.nameAr,
            foodNameFr: f.nameFr,
            image: f.image,
            category: {
                id: f.categoryid,
                name: f.categoryName,
                nameAr: f.categoryNameAr,
            },
            basePrice: parseFloat(f.price || "0").toFixed(2),
            status: f.status,
            totalSold: 0,
            totalSoldQuantity: 0,
            totalOrdersCount: 0,
            totalRevenue: 0,
            soldWithoutVariations: 0,
            soldWithVariations: 0,
            distinctOrders: new Set(),
            variationsMap: new Map(),
            optionsMap: new Map(),
            optionsByNameMap: new Map(),
        });
    }
    // ربط الـ Variations بكل وجبة
    for (const v of dbVariations) {
        const foodEntry = foodMap.get(v.foodId);
        if (!foodEntry)
            continue;
        const varObj = {
            variationId: v.id,
            variationName: v.name,
            variationNameAr: v.nameAr,
            variationNameFr: v.nameFr,
            selectionType: v.selectionType,
            isRequired: v.isRequired,
            totalVariationSoldCount: 0,
            options: [],
        };
        foodEntry.variationsMap.set(v.id, varObj);
    }
    // ربط الـ Options بكل Variation
    for (const o of dbOptions) {
        for (const foodEntry of foodMap.values()) {
            const varObj = foodEntry.variationsMap.get(o.variationId);
            if (varObj) {
                const optObj = {
                    optionId: o.id,
                    optionName: o.optionName,
                    optionNameAr: o.optionNameAr,
                    optionNameFr: o.optionNameFr,
                    additionalPrice: parseFloat(o.additionalPrice || "0").toFixed(2),
                    soldCount: 0,
                    totalRevenue: 0,
                };
                varObj.options.push(optObj);
                foodEntry.optionsMap.set(o.id, optObj);
                if (o.optionName) {
                    foodEntry.optionsByNameMap.set(o.optionName.trim().toLowerCase(), optObj);
                }
                if (o.optionNameAr) {
                    foodEntry.optionsByNameMap.set(o.optionNameAr.trim().toLowerCase(), optObj);
                }
            }
        }
    }
    // دالة مساعدة لفك تشفير Variations بأمان
    const parseItemVariations = (raw) => {
        if (!raw)
            return [];
        let parsed = raw;
        if (typeof parsed === "string") {
            try {
                parsed = JSON.parse(parsed);
                if (typeof parsed === "string") {
                    parsed = JSON.parse(parsed);
                }
            }
            catch {
                return [];
            }
        }
        if (Array.isArray(parsed))
            return parsed;
        if (parsed && typeof parsed === "object") {
            if (Array.isArray(parsed.variations))
                return parsed.variations;
            return Object.values(parsed);
        }
        return [];
    };
    // 6. حساب المبيعات لكل وجبة وكل خيار
    for (const item of orderItemsList) {
        const foodEntry = foodMap.get(item.foodId);
        if (!foodEntry)
            continue;
        const qty = Math.max(1, item.quantity || 1);
        const itemTotal = parseFloat(item.totalPrice || "0");
        foodEntry.totalSold += qty;
        foodEntry.totalSoldQuantity += qty;
        foodEntry.totalRevenue += itemTotal;
        foodEntry.distinctOrders.add(item.orderId);
        const parsedVars = parseItemVariations(item.variations);
        if (parsedVars.length === 0) {
            foodEntry.soldWithoutVariations += qty;
        }
        else {
            foodEntry.soldWithVariations += qty;
            for (const pv of parsedVars) {
                const optId = pv.optionId || pv.option_id || pv.id || (pv.option && pv.option.id);
                const varId = pv.variationId || pv.variation_id || (pv.variation && pv.variation.id);
                const optName = (pv.optionName || pv.name || pv.value || "").trim();
                const optNameAr = pv.optionNameAr || pv.nameAr || pv.valueAr || "";
                const optPrice = parseFloat(pv.additionalPrice || pv.price || pv.amount || "0");
                let matchedOpt = optId ? foodEntry.optionsMap.get(optId) : null;
                if (!matchedOpt && optName) {
                    matchedOpt = foodEntry.optionsByNameMap.get(optName.toLowerCase());
                }
                if (matchedOpt) {
                    matchedOpt.soldCount += qty;
                    matchedOpt.totalRevenue += (qty * parseFloat(matchedOpt.additionalPrice || "0"));
                    if (varId && foodEntry.variationsMap.has(varId)) {
                        foodEntry.variationsMap.get(varId).totalVariationSoldCount += qty;
                    }
                    else {
                        for (const vObj of foodEntry.variationsMap.values()) {
                            if (vObj.options.some((o) => o.optionId === matchedOpt.optionId)) {
                                vObj.totalVariationSoldCount += qty;
                                break;
                            }
                        }
                    }
                }
                else if (optName || optId) {
                    let targetVar = varId ? foodEntry.variationsMap.get(varId) : null;
                    if (!targetVar) {
                        const fallbackVarName = pv.variationName || pv.name || "Custom Options";
                        for (const vObj of foodEntry.variationsMap.values()) {
                            if (vObj.variationName.toLowerCase() === fallbackVarName.toLowerCase()) {
                                targetVar = vObj;
                                break;
                            }
                        }
                        if (!targetVar) {
                            targetVar = {
                                variationId: varId || "other",
                                variationName: fallbackVarName,
                                variationNameAr: pv.variationNameAr || fallbackVarName,
                                variationNameFr: pv.variationNameFr || fallbackVarName,
                                selectionType: null,
                                isRequired: false,
                                totalVariationSoldCount: 0,
                                options: [],
                            };
                            foodEntry.variationsMap.set(targetVar.variationId, targetVar);
                        }
                    }
                    const newOpt = {
                        optionId: optId || `custom-${optName}`,
                        optionName: optName || "Unnamed Option",
                        optionNameAr: optNameAr || null,
                        optionNameFr: pv.optionNameFr || null,
                        additionalPrice: optPrice.toFixed(2),
                        soldCount: qty,
                        totalRevenue: qty * optPrice,
                    };
                    targetVar.options.push(newOpt);
                    targetVar.totalVariationSoldCount += qty;
                    if (optId)
                        foodEntry.optionsMap.set(optId, newOpt);
                    if (optName)
                        foodEntry.optionsByNameMap.set(optName.toLowerCase(), newOpt);
                }
            }
        }
    }
    // 7. صياغة النتيجة وترتيب الـ Options
    let formattedFoods = Array.from(foodMap.values()).map(f => {
        const variations = Array.from(f.variationsMap.values()).map((v) => {
            const sortedOptions = [...v.options].sort((a, b) => b.soldCount - a.soldCount);
            return {
                variationId: v.variationId,
                variationName: v.variationName,
                variationNameAr: v.variationNameAr,
                variationNameFr: v.variationNameFr,
                selectionType: v.selectionType,
                isRequired: v.isRequired,
                totalVariationSoldCount: v.totalVariationSoldCount,
                options: sortedOptions.map((opt) => ({
                    optionId: opt.optionId,
                    optionName: opt.optionName,
                    optionNameAr: opt.optionNameAr,
                    optionNameFr: opt.optionNameFr,
                    additionalPrice: opt.additionalPrice,
                    soldCount: opt.soldCount,
                    totalRevenue: opt.totalRevenue.toFixed(2),
                })),
            };
        });
        return {
            foodId: f.foodId,
            foodName: f.foodName,
            foodNameAr: f.foodNameAr,
            foodNameFr: f.foodNameFr,
            image: f.image,
            category: f.category,
            basePrice: f.basePrice,
            status: f.status,
            totalSold: f.totalSold,
            totalSoldQuantity: f.totalSoldQuantity,
            totalOrdersCount: f.distinctOrders.size,
            totalRevenue: f.totalRevenue.toFixed(2),
            soldWithoutVariations: f.soldWithoutVariations,
            soldWithVariations: f.soldWithVariations,
            variations,
        };
    });
    // فلترة الأكلات المباعة فقط إذا طُلب ذلك
    if (onlySold === "true" || onlySold === "1") {
        formattedFoods = formattedFoods.filter(f => f.totalSoldQuantity > 0);
    }
    // 8. الترتيب (Arranged Type: ASC or DESC)
    const arrangement = (arrangedType || sortOrder || sort || "desc").toLowerCase().trim();
    const isAsc = arrangement === "asc" || arrangement === "ascn" || arrangement === "ascending";
    const sortField = (sortBy || "totalSold").toLowerCase().trim();
    formattedFoods.sort((a, b) => {
        let diff = 0;
        if (sortField === "totalrevenue" || sortField === "revenue") {
            diff = parseFloat(a.totalRevenue) - parseFloat(b.totalRevenue);
        }
        else if (sortField === "name" || sortField === "foodname") {
            diff = a.foodName.localeCompare(b.foodName);
        }
        else if (sortField === "totalorders" || sortField === "orders") {
            diff = a.totalOrdersCount - b.totalOrdersCount;
        }
        else {
            diff = a.totalSoldQuantity - b.totalSoldQuantity;
        }
        return isAsc ? diff : -diff;
    });
    // 9. ملخص كلي
    let overallSoldQuantity = 0;
    let overallRevenue = 0;
    let foodsWithSalesCount = 0;
    const overallOrdersSet = new Set();
    for (const item of orderItemsList) {
        overallOrdersSet.add(item.orderId);
    }
    for (const f of formattedFoods) {
        overallSoldQuantity += f.totalSoldQuantity;
        overallRevenue += parseFloat(f.totalRevenue);
        if (f.totalSoldQuantity > 0)
            foodsWithSalesCount++;
    }
    // 10. الترقيم (Pagination)
    let paginatedFoods = formattedFoods;
    let paginationInfo = null;
    if (page && limit) {
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.max(1, parseInt(limit, 10) || 20);
        const startIndex = (pageNum - 1) * limitNum;
        paginatedFoods = formattedFoods.slice(startIndex, startIndex + limitNum);
        paginationInfo = {
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(formattedFoods.length / limitNum),
            totalItems: formattedFoods.length,
        };
    }
    return (0, response_1.SuccessResponse)(res, {
        message: "Food report retrieved successfully",
        dateRange: {
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            isDefaultToday,
        },
        filter: {
            branchId: (branchId || req.user.branchId) || null,
            arrangedType: isAsc ? "asc" : "desc",
            sortBy: sortField,
            status: status || "all_non_cancelled",
        },
        summary: {
            totalFoodsCount: formattedFoods.length,
            foodsWithSalesCount,
            totalSoldQuantity: overallSoldQuantity,
            totalRevenue: overallRevenue.toFixed(2),
            totalOrdersCount: overallOrdersSet.size,
        },
        foods: paginatedFoods,
        ...(paginationInfo ? { pagination: paginationInfo } : {}),
    });
};
exports.getFoodReport = getFoodReport;
