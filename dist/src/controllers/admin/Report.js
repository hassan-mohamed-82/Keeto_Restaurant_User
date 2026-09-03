"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboardReports = exports.getMyInvoices = exports.downloadSavedInvoicePDF = exports.getMyRestaurantReport = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm"); // 👈 تمت إضافة inArray
const response_1 = require("../../utils/response");
const Errors_1 = require("../../Errors");
const BadRequest_1 = require("../../Errors/BadRequest");
const pdfkit_1 = __importDefault(require("pdfkit"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
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
    if (branchId)
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.branchId, branchId));
    if (req.user.branchId)
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.branchId, req.user.branchId));
    // 2. سحب بيانات الطلبات الأساسية مع الـ Joins المطابقة للـ Schemas
    const rawOrders = await connection_1.db
        .select({
        orderId: schema_1.orders.id,
        status: schema_1.orders.status,
        totalAmount: schema_1.orders.totalAmount,
        subtotal: schema_1.orders.subtotal,
        discountAmount: schema_1.orders.discountAmount,
        couponCode: schema_1.orders.couponCode,
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
        // تحليل الكوبونات
        if (o.couponCode && o.status !== "cancelled") {
            const revenueBefore = amount + disc;
            if (!couponAnalysis[o.couponCode])
                couponAnalysis[o.couponCode] = { before: 0, after: 0 };
            couponAnalysis[o.couponCode].before += revenueBefore;
            couponAnalysis[o.couponCode].after += amount;
            const discountPct = revenueBefore > 0 ? ((disc / revenueBefore) * 100).toFixed(0) : "0";
            if (!discountEffectivenessMap[discountPct])
                discountEffectivenessMap[discountPct] = { revenue: 0, count: 0 };
            discountEffectivenessMap[discountPct].revenue += amount;
            discountEffectivenessMap[discountPct].count++;
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
            },
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
