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

    if (startDate) {
        conditions.push(gte(orders.createdAt, new Date(startDate as string)));
    }
    if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        conditions.push(lte(orders.createdAt, end));
    }

    if (branchId) {
        conditions.push(eq(orders.branchId, branchId as string));
    }

    if (req.user.branchId) {
        conditions.push(eq(orders.branchId, req.user.branchId));
    }

    const allOrders = await db
        .select({
            orderId: orders.id,
            orderNumber: orders.orderNumber,
            status: orders.status,
            orderSource: orders.orderSource,
            orderType: orders.orderType,
            paymentMethod: paymentMethods.name,
            subtotal: orders.subtotal,
            deliveryFee: orders.deliveryFee,
            serviceFee: orders.serviceFee,
            appCommission: orders.appCommission,
            totalAmount: orders.totalAmount,
            branchId: orders.branchId,
            branchName: branches.name,
            createdAt: orders.createdAt,
        })
        .from(orders)
        .leftJoin(branches, eq(orders.branchId, branches.id))
        .leftJoin(paymentMethods, eq(orders.paymentMethod, paymentMethods.id))
        .where(and(...conditions))
        .orderBy(desc(orders.createdAt));

    const statusSummary: Record<string, { count: number; totalAmount: number }> = {};
    const allStatuses: OrderStatus[] = ["pending", "accepted", "preparing", "out_for_delivery", "delivered", "cancelled", "rejected", "refund"];
    for (const s of allStatuses) {
        statusSummary[s] = { count: 0, totalAmount: 0 };
    }

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

    const branchSummary: Record<string, {
        branchId: string;
        branchName: string;
        totalOrders: number;
        deliveredOrders: number;
        cancelledOrders: number;
        totalAmount: number;
        deliveredAmount: number;
    }> = {};

    const dailyTrend: Record<string, { date: string; orders: number; revenue: number }> = {};

    let totalOrders = 0;
    let totalRevenue = 0; 
    let totalSubtotal = 0;
    let totalDeliveryFees = 0;
    let totalServiceFees = 0;
    let totalAppCommission = 0;
    let deliveredRevenue = 0; 

    // متغيرات الكاش والديجيتال
    let totalCashCollected = 0;
    let totalDigitalCollected = 0;

    // متغيرات العمولات الدقيقة
    let totalCashCommission = 0;
    let totalDigitalCommission = 0;
    let totalCashServiceFees = 0;
    let totalDigitalServiceFees = 0;

    // 👇 الحالات التي تستحق فيها المنصة عمولة (تشمل الـ Cancelled لأنه تم الإلغاء بعد الـ Accept)
    const commissionableStatuses = ["delivered", "accepted", "preparing", "out_for_delivery", "cancelled"];

    for (const order of allOrders) {
        const amount = parseFloat(order.totalAmount as string || "0");
        const subtotal = parseFloat(order.subtotal as string || "0");
        const dlvFee = parseFloat(order.deliveryFee as string || "0");
        const svcFee = parseFloat(order.serviceFee as string || "0");
        const commission = parseFloat(order.appCommission as string || "0");
        
        const status = order.status || "pending";
        const payment = (order.paymentMethod as PaymentMethod) || "cash_on_delivery";
        const isCash = payment === "cash_on_delivery" || payment === "الدفع عند الاستلام";
        
        const oType = order.orderType || "delivery";
        const oSource = order.orderSource || "online_order";

        totalOrders++;
        totalRevenue += amount;
        totalSubtotal += subtotal;
        totalDeliveryFees += dlvFee;

        // 👇 1. حساب عمولات المنصة للحالات المستحقة فقط
        if (commissionableStatuses.includes(status)) {
            totalAppCommission += commission;
            totalServiceFees += svcFee;

            if (isCash) {
                totalCashCommission += commission;
                totalCashServiceFees += svcFee;
            } else {
                totalDigitalCommission += commission;
                totalDigitalServiceFees += svcFee;
            }
        }

        // 👇 2. حساب الفلوس الفعلية اللي دخلت (للطلبات المكتملة فقط)
        if (status === "delivered") {
            deliveredRevenue += amount;
            
            if (isCash) {
                totalCashCollected += amount;
            } else {
                totalDigitalCollected += amount;
            }
        }

        // تجميعات الإحصائيات للداشبورد
        if (statusSummary[status]) {
            statusSummary[status].count++;
            statusSummary[status].totalAmount += amount;
        }

        const standardPayment = isCash ? "cash_on_delivery" : (payment === "محفظتى" ? "wallet" : "visa");
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
                deliveredOrders: 0,
                cancelledOrders: 0,
                totalAmount: 0,
                deliveredAmount: 0,
            };
        }
        branchSummary[bId].totalOrders++;
        branchSummary[bId].totalAmount += amount;
        if (status === "delivered") {
            branchSummary[bId].deliveredOrders++;
            branchSummary[bId].deliveredAmount += amount;
        }
        if (status === "cancelled") {
            branchSummary[bId].cancelledOrders++;
        }

        if (order.createdAt) {
            const dayKey = new Date(order.createdAt).toISOString().split("T")[0];
            if (!dailyTrend[dayKey]) {
                dailyTrend[dayKey] = { date: dayKey, orders: 0, revenue: 0 };
            }
            dailyTrend[dayKey].orders++;
            if (status === "delivered") {
                dailyTrend[dayKey].revenue += amount;
            }
        }
    }

    const deliveredOrderIds = allOrders
        .filter(o => o.status === "delivered")
        .map(o => o.orderId);

    let topSellingItems: any[] = [];
    if (deliveredOrderIds.length > 0) {
        const batchSize = 500;
        const itemAggregation: Record<string, {
            foodId: string;
            foodName: string;
            totalQuantity: number;
            totalRevenue: number;
        }> = {};

        for (let i = 0; i < deliveredOrderIds.length; i += batchSize) {
            const batch = deliveredOrderIds.slice(i, i + batchSize);
            const items = await db
                .select({
                    foodId: orderItems.foodId,
                    foodName: food.name,
                    quantity: orderItems.quantity,
                    totalPrice: orderItems.totalPrice,
                })
                .from(orderItems)
                .leftJoin(food, eq(orderItems.foodId, food.id))
                .where(inArray(orderItems.orderId, batch)); // 👈 استخدام inArray

            for (const item of items) {
                const fId = item.foodId;
                if (!itemAggregation[fId]) {
                    itemAggregation[fId] = {
                        foodId: fId,
                        foodName: item.foodName || "Unknown",
                        totalQuantity: 0,
                        totalRevenue: 0,
                    };
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

    const [wallet] = await db
        .select()
        .from(restaurantWallets)
        .where(eq(restaurantWallets.restaurantId, restaurantId))
        .limit(1);

    const businessPlans = await db
        .select()
        .from(restaurantBusinessPlans)
        .where(eq(restaurantBusinessPlans.restaurantId, restaurantId));

    const [restaurantInfo] = await db
        .select({
            id: restaurants.id,
            name: restaurants.name,
            logo: restaurants.logo,
            status: restaurants.status,
        })
        .from(restaurants)
        .where(eq(restaurants.id, restaurantId))
        .limit(1);

    // 👇 الـ Net Revenue أصبح يعتمد فقط على الإيراد الفعلي والعمولات المستحقة فعلياً
    const netRevenue = deliveredRevenue - totalAppCommission;

    const cancelledCount = (statusSummary["cancelled"]?.count || 0) + (statusSummary["rejected"]?.count || 0);
    const cancellationRate = totalOrders > 0 ? ((cancelledCount / totalOrders) * 100).toFixed(2) : "0.00";

    const deliveredCount = statusSummary["delivered"]?.count || 0;
    const avgOrderValue = deliveredCount > 0 ? (deliveredRevenue / deliveredCount).toFixed(2) : "0.00";

    // ==========================================
    // 👇 حساب المديونيات الدقيق (Settlement)
    // ==========================================
    
    // المطعم مدين للمنصة بعمولة الطلبات الكاش المستحقة + رسوم الخدمة للطلبات الكاش
    const restaurantOwesPlatform = totalCashCommission + totalCashServiceFees;

    // المنصة مدينة للمطعم بفلوس الطلبات الديجيتال المكتملة - (عمولتها + رسوم خدمتها على الطلبات الديجيتال المستحقة)
    const platformOwesRestaurant = totalDigitalCollected - (totalDigitalCommission + totalDigitalServiceFees);

    const netBalance = platformOwesRestaurant - restaurantOwesPlatform;

    return SuccessResponse(res, {
        message: "Restaurant report generated successfully",
        data: {
            restaurant: restaurantInfo || null,

            overview: {
                totalOrders,
                deliveredOrders: deliveredCount,
                cancelledOrders: cancelledCount,
                cancellationRate: cancellationRate + "%",
                avgOrderValue,
            },

            financials: {
                totalRevenue: totalRevenue.toFixed(2),
                deliveredRevenue: deliveredRevenue.toFixed(2),
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

            ordersByStatus: Object.entries(statusSummary).map(([status, data]) => ({
                status,
                count: data.count,
                totalAmount: data.totalAmount.toFixed(2),
            })),

            ordersByPayment: Object.entries(paymentSummary).map(([method, data]) => ({
                paymentMethod: method,
                count: data.count,
                totalAmount: data.totalAmount.toFixed(2),
            })),

            ordersByType: Object.entries(orderTypeSummary).map(([type, data]) => ({
                orderType: type,
                count: data.count,
                totalAmount: data.totalAmount.toFixed(2),
            })),

            ordersBySource: Object.entries(orderSourceSummary).map(([source, data]) => ({
                orderSource: source,
                count: data.count,
                totalAmount: data.totalAmount.toFixed(2),
            })),

            branchBreakdown: Object.values(branchSummary).map(b => ({
                branchId: b.branchId,
                branchName: b.branchName,
                totalOrders: b.totalOrders,
                deliveredOrders: b.deliveredOrders,
                cancelledOrders: b.cancelledOrders,
                totalAmount: b.totalAmount.toFixed(2),
                deliveredAmount: b.deliveredAmount.toFixed(2),
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