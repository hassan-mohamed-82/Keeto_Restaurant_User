import { Request, Response } from "express";
import { db } from "../../models/connection";
import {
    orders,
    orderItems,
    food,
    restaurants,
    branches,
    restaurantBusinessPlans,
    restaurantWallets,
    users,
    paymentMethods,
    selectReasons,
} from "../../models/schema";
import { eq, and, desc, gte, lte, sql, inArray } from "drizzle-orm"; // 👈 تمت إضافة inArray
import { SuccessResponse } from "../../utils/response";
import { UnauthorizedError } from "../../Errors";
import { BadRequest } from "../../Errors/BadRequest";
import PDFDocument from "pdfkit";
import { invoices } from "../../models/schema/admin/invoices";

type OrderStatus = "pending" | "accepted" | "preparing" | "out_for_delivery" | "delivered" | "cancelled" | "rejected" | "refund";
type PaymentMethod = "cash_on_delivery" | "visa" | "wallet" | "الدفع عند الاستلام" | "بطاقة" | "محفظتى";

export const getMyRestaurantReport = async (req: Request | any, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");

    const restaurantId = req.user.restaurantId || req.user.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID not found");

    const { startDate, endDate, branchId } = req.query;

    const conditions: any[] = [eq(orders.restaurantId, restaurantId)];

    if (startDate) conditions.push(gte(orders.createdAt, new Date(startDate as string)));
    if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        conditions.push(lte(orders.createdAt, end));
    }
    if (branchId) conditions.push(eq(orders.branchId, branchId as string));
    if (req.user.branchId) conditions.push(eq(orders.branchId, req.user.branchId));

    const allOrders = await db
        .select({
            orderId: orders.id,
            orderNumber: orders.orderNumber,
            status: orders.status,
            orderSource: orders.orderSource,
            orderType: orders.orderType,
            paymentMethod: orders.paymentMethod, // 👈 قراءة مباشرة بما إنها varchar
            subtotal: orders.subtotal,
            deliveryFee: orders.deliveryFee,
            serviceFee: orders.serviceFee,
            appCommission: orders.appCommission,
            totalAmount: orders.totalAmount,
            branchId: orders.branchId,
            branchName: branches.name,
            createdAt: orders.createdAt,
            cancelReasonType: selectReasons.type, // 👈 نوع الإلغاء
        })
        .from(orders)
        .leftJoin(branches, eq(orders.branchId, branches.id))
        .leftJoin(selectReasons, eq(orders.cancelReasonId, selectReasons.id))
        .where(and(...conditions))
        .orderBy(desc(orders.createdAt));

    const statusSummary: Record<string, { count: number; totalAmount: number }> = {};
    const allStatuses: OrderStatus[] = ["pending", "accepted", "preparing", "out_for_delivery", "delivered", "cancelled", "rejected", "refund"];
    for (const s of allStatuses) statusSummary[s] = { count: 0, totalAmount: 0 };

    const paymentSummary: Record<string, { count: number; totalAmount: number }> = {
        cash_on_delivery: { count: 0, totalAmount: 0 },
        visa: { count: 0, totalAmount: 0 },
        wallet: { count: 0, totalAmount: 0 },
    };

    const orderTypeSummary: Record<string, { count: number; totalAmount: number }> = {
        delivery: { count: 0, totalAmount: 0 },
        takeaway: { count: 0, totalAmount: 0 },
        dine_in: { count: 0, totalAmount: 0 },
    };

    const orderSourceSummary: Record<string, { count: number; totalAmount: number }> = {
        online_order: { count: 0, totalAmount: 0 },
        food_aggregator: { count: 0, totalAmount: 0 },
    };

    const branchSummary: Record<string, any> = {};
    const dailyTrend: Record<string, { date: string; orders: number; revenue: number }> = {};

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

    const validOrderIdsForItems: string[] = []; // هنحفظ فيها الـ IDs بتاعت الأوردرات الصالحة للـ Top Selling

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

        const amount = parseFloat(order.totalAmount as string || "0");
        const subtotal = parseFloat(order.subtotal as string || "0");
        const dlvFee = parseFloat(order.deliveryFee as string || "0");
        const svcFee = parseFloat(order.serviceFee as string || "0");
        const commission = parseFloat(order.appCommission as string || "0");
        
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
        } else {
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
        if (status === "cancelled" ) {
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
    let topSellingItems: any[] = [];
    if (validOrderIdsForItems.length > 0) {
        const batchSize = 500;
        const itemAggregation: Record<string, { foodId: string; foodName: string; totalQuantity: number; totalRevenue: number }> = {};

        for (let i = 0; i < validOrderIdsForItems.length; i += batchSize) {
            const batch = validOrderIdsForItems.slice(i, i + batchSize);
            const items = await db
                .select({
                    foodId: orderItems.foodId,
                    foodName: food.name,
                    quantity: orderItems.quantity,
                    totalPrice: orderItems.totalPrice,
                })
                .from(orderItems)
                .leftJoin(food, eq(orderItems.foodId, food.id))
                .where(inArray(orderItems.orderId, batch));

            for (const item of items) {
                const fId = item.foodId;
                if (!itemAggregation[fId]) {
                    itemAggregation[fId] = { foodId: fId, foodName: item.foodName || "Unknown", totalQuantity: 0, totalRevenue: 0 };
                }
                itemAggregation[fId].totalQuantity += item.quantity;
                itemAggregation[fId].totalRevenue += parseFloat(item.totalPrice as string || "0");
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

    const [wallet] = await db.select().from(restaurantWallets).where(eq(restaurantWallets.restaurantId, restaurantId)).limit(1);
    const businessPlans = await db.select().from(restaurantBusinessPlans).where(eq(restaurantBusinessPlans.restaurantId, restaurantId));
    const [restaurantInfo] = await db.select({ id: restaurants.id, name: restaurants.name, logo: restaurants.logo, status: restaurants.status }).from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);

    const netRevenue = totalRevenue - totalAppCommission - totalServiceFees;
    
    // حساب المديونيات الدقيق (نفس اللوجيك بتاع السوبر أدمن)
    const restaurantOwesPlatform = totalCashCommission + totalCashServiceFees;
    const platformOwesRestaurant = totalDigitalCollected - (totalDigitalCommission + totalDigitalServiceFees);
    const netBalance = platformOwesRestaurant - restaurantOwesPlatform;

    // نسب الإلغاء (بناء على كل الطلبات)
    const cancelledCount = (statusSummary["cancelled"]?.count || 0) + (statusSummary["rejected"]?.count || 0);
    const cancellationRate = totalOrders > 0 ? ((cancelledCount / totalOrders) * 100).toFixed(2) : "0.00";
    const avgOrderValue = validOrdersForFinancials > 0 ? (totalRevenue / validOrdersForFinancials).toFixed(2) : "0.00";

    return SuccessResponse(res, {
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

export const downloadSavedInvoicePDF = async (req: Request | any, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");
    
    const restaurantId = req.user.restaurantId || req.user.id;
    const { invoiceId } = req.params;

    // 1. نجيب الفاتورة من الداتابيز ونتأكد إنها بتاعته
    const [invoice] = await db.select().from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.restaurantId, restaurantId)));

    if (!invoice) throw new BadRequest("Invoice not found");

    // 2. نجيب بيانات المطعم عشان اللوجو والاسم (White-labeling)
    const [restaurantInfo] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId));

    // 3. نعمل الـ PDF بالبيانات المحفوظة سلفاً
    const doc = new PDFDocument({ margin: 50 });
    
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
    const net = parseFloat(invoice.netBalance as string);
    doc.fontSize(14).text('Final Account Balance:', { continued: true });
    
    if (net > 0) {
        doc.fillColor('green').text(` Platform owes you ${Math.abs(net)} EGP`);
    } else if (net < 0) {
        doc.fillColor('red').text(` You owe platform ${Math.abs(net)} EGP`);
    } else {
        doc.fillColor('black').text(` Settled (0.00 EGP)`);
    }
    
    doc.end();
};

// controllers/restaurant/RestaurantInvoiceController.ts

export const getMyInvoices = async (req: Request | any, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");
    const restaurantId = req.user.restaurantId || req.user.id;

    // هيجيب كل فواتيره المحفوظة ويقدر يشوف الـ status بتاعتها
    const myInvoices = await db
        .select()
        .from(invoices)
        .where(eq(invoices.restaurantId, restaurantId))
        .orderBy(desc(invoices.createdAt));

    return SuccessResponse(res, { data: myInvoices });
};