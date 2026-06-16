"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyInvoices = exports.downloadSavedInvoicePDF = exports.getMyRestaurantReport = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm"); // 👈 تمت إضافة inArray
const response_1 = require("../../utils/response");
const Errors_1 = require("../../Errors");
const BadRequest_1 = require("../../Errors/BadRequest");
const pdfkit_1 = __importDefault(require("pdfkit"));
const invoices_1 = require("../../models/schema/admin/invoices");
const getMyRestaurantReport = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const restaurantId = req.user.restaurantId || req.user.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID not found");
    const { startDate, endDate, branchId } = req.query;
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId)];
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
    const allOrders = await connection_1.db
        .select({
        orderId: schema_1.orders.id,
        orderNumber: schema_1.orders.orderNumber,
        status: schema_1.orders.status,
        orderSource: schema_1.orders.orderSource,
        orderType: schema_1.orders.orderType,
        paymentMethod: schema_1.orders.paymentMethod, // 👈 قراءة مباشرة بما إنها varchar
        subtotal: schema_1.orders.subtotal,
        deliveryFee: schema_1.orders.deliveryFee,
        serviceFee: schema_1.orders.serviceFee,
        appCommission: schema_1.orders.appCommission,
        totalAmount: schema_1.orders.totalAmount,
        branchId: schema_1.orders.branchId,
        branchName: schema_1.branches.name,
        createdAt: schema_1.orders.createdAt,
        cancelReasonType: schema_1.selectReasons.type, // 👈 نوع الإلغاء
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.orders.branchId, schema_1.branches.id))
        .leftJoin(schema_1.selectReasons, (0, drizzle_orm_1.eq)(schema_1.orders.cancelReasonId, schema_1.selectReasons.id))
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.orders.createdAt));
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
    const orderSourceSummary = {
        online_order: { count: 0, totalAmount: 0 },
        food_aggregator: { count: 0, totalAmount: 0 },
    };
    const branchSummary = {};
    const dailyTrend = {};
    let totalOrders = 0; // إجمالي كل الطلبات للإحصائيات فقط
    let validOrdersForFinancials = 0; // إجمالي الطلبات اللي دخلت الحسبة المالية
    // متغيرات الفلوس
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
    const validOrderIdsForItems = []; // هنحفظ فيها الـ IDs بتاعت الأوردرات الصالحة للـ Top Selling
    for (const order of allOrders) {
        totalOrders++; // بنعد كل الأوردرات للإحصائيات العامة
        const status = order.status || "pending";
        const cancelReasonType = order.cancelReasonType;
        // 🛑 الفلتر السحري
        const isCancelledByUser = status === "cancelled" && cancelReasonType === "user";
        // لو اليوزر لغاه، هنحسبه بس في إحصائيات الـ status ونعمل continue للفلوس
        if (isCancelledByUser) {
            if (statusSummary[status]) {
                statusSummary[status].count++;
                // متعمد مش هضيف totalAmount هنا عشان المبالغ الملغية متلخبطش الحسابات
            }
            continue;
        }
        // =====================================
        // ✅ الأوردر صالح ماليًا
        // =====================================
        validOrdersForFinancials++;
        validOrderIdsForItems.push(order.orderId);
        const amount = parseFloat(order.totalAmount || "0");
        const subtotal = parseFloat(order.subtotal || "0");
        const dlvFee = parseFloat(order.deliveryFee || "0");
        const svcFee = parseFloat(order.serviceFee || "0");
        const commission = parseFloat(order.appCommission || "0");
        const payment = (order.paymentMethod || "").toLowerCase();
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
        // --- تجميعات الإحصائيات (للأوردرات الصالحة فقط) ---
        if (statusSummary[status]) {
            statusSummary[status].count++;
            statusSummary[status].totalAmount += amount;
        }
        const standardPayment = isCash ? "cash_on_delivery" : (payment.includes("محفظ") ? "wallet" : "visa");
        if (paymentSummary[standardPayment]) {
            paymentSummary[standardPayment].count++;
            paymentSummary[standardPayment].totalAmount += amount;
        }
        if (orderTypeSummary[oType]) {
            orderTypeSummary[oType].count++;
            orderTypeSummary[oType].totalAmount += amount;
        }
        if (orderSourceSummary[oSource]) {
            orderSourceSummary[oSource].count++;
            orderSourceSummary[oSource].totalAmount += amount;
        }
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
    // جلب المنتجات الأكثر مبيعاً (للأوردرات الصالحة مالياً فقط)
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
    const [wallet] = await connection_1.db.select().from(schema_1.restaurantWallets).where((0, drizzle_orm_1.eq)(schema_1.restaurantWallets.restaurantId, restaurantId)).limit(1);
    const businessPlans = await connection_1.db.select().from(schema_1.restaurantBusinessPlans).where((0, drizzle_orm_1.eq)(schema_1.restaurantBusinessPlans.restaurantId, restaurantId));
    const [restaurantInfo] = await connection_1.db.select({ id: schema_1.restaurants.id, name: schema_1.restaurants.name, logo: schema_1.restaurants.logo, status: schema_1.restaurants.status }).from(schema_1.restaurants).where((0, drizzle_orm_1.eq)(schema_1.restaurants.id, restaurantId)).limit(1);
    const netRevenue = totalRevenue - totalAppCommission - totalServiceFees;
    // حساب المديونيات الدقيق (نفس اللوجيك بتاع السوبر أدمن)
    const restaurantOwesPlatform = totalCashCommission + totalCashServiceFees;
    const platformOwesRestaurant = totalDigitalCollected - (totalDigitalCommission + totalDigitalServiceFees);
    const netBalance = platformOwesRestaurant - restaurantOwesPlatform;
    // نسب الإلغاء (بناء على كل الطلبات)
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
                totalRevenue: totalRevenue.toFixed(2), // ده الإيراد من كل الأوردرات الصالحة
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
// controllers/restaurant/RestaurantInvoiceController.ts
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
