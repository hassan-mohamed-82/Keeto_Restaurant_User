// controllers/admin/Report.ts
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
} from "../../models/schema";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { UnauthorizedError } from "../../Errors";
import { BadRequest } from "../../Errors/BadRequest";
import PDFDocument from "pdfkit";

type OrderStatus = "pending" | "accepted" | "preparing" | "out_for_delivery" | "delivered" | "cancelled" | "rejected" | "refund";
type PaymentMethod = "cash_on_delivery" | "visa" | "wallet";

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
            paymentMethod: orders.paymentMethod,
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

    // 👇 الإضافات الخاصة بحساب الدفع
    let totalCashCollected = 0;
    let totalDigitalCollected = 0;

    for (const order of allOrders) {
        const amount = parseFloat(order.totalAmount as string || "0");
        const subtotal = parseFloat(order.subtotal as string || "0");
        const dlvFee = parseFloat(order.deliveryFee as string || "0");
        const svcFee = parseFloat(order.serviceFee as string || "0");
        const commission = parseFloat(order.appCommission as string || "0");
        const status = order.status || "pending";
        const payment = order.paymentMethod || "cash_on_delivery";
        const oType = order.orderType || "delivery";
        const oSource = order.orderSource || "online_order";

        totalOrders++;
        totalRevenue += amount;
        totalSubtotal += subtotal;
        totalDeliveryFees += dlvFee;
        totalServiceFees += svcFee;
        totalAppCommission += commission;

        if (status === "delivered") {
            deliveredRevenue += amount;
            
            // 👇 تجميع الكاش والديجيتال
            if (payment === "cash_on_delivery") {
                totalCashCollected += amount;
            } else {
                totalDigitalCollected += amount;
            }
        }

        if (statusSummary[status]) {
            statusSummary[status].count++;
            statusSummary[status].totalAmount += amount;
        }

        if (paymentSummary[payment]) {
            paymentSummary[payment].count++;
            paymentSummary[payment].totalAmount += amount;
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
        if (status === "cancelled" || status === "rejected") {
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
                .where(
                    sql`${orderItems.orderId} IN (${sql.join(batch.map(id => sql`${id}`), sql`, `)})`
                );

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

    const netRevenue = deliveredRevenue - totalAppCommission;

    const cancelledCount = (statusSummary["cancelled"]?.count || 0) + (statusSummary["rejected"]?.count || 0);
    const cancellationRate = totalOrders > 0 ? ((cancelledCount / totalOrders) * 100).toFixed(2) : "0.00";

    const deliveredCount = statusSummary["delivered"]?.count || 0;
    const avgOrderValue = deliveredCount > 0 ? (deliveredRevenue / deliveredCount).toFixed(2) : "0.00";

    // ==========================================
    // 👇 حساب المديونيات (Settlement)
    // ==========================================
    let activeCommissionRate = 0;
    if (businessPlans.length > 0) {
        const onlinePlan = businessPlans.find(p => p.platformType === "online_order") || businessPlans[0];
        activeCommissionRate = parseFloat(onlinePlan.commissionRate || "0");
    }

    const restaurantOwesPlatform = (totalCashCollected * activeCommissionRate) / 100 + 
                                   (totalServiceFees * (totalCashCollected / (deliveredRevenue || 1)));

    const platformOwesRestaurant = totalDigitalCollected - 
                                   (totalDigitalCollected * activeCommissionRate) / 100 - 
                                   (totalServiceFees * (totalDigitalCollected / (deliveredRevenue || 1)));

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

            // 👇 إضافة المديونيات للـ Response
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



export const downloadMyRestaurantInvoicePDF = async (req: Request | any, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");

    const restaurantId = req.user.restaurantId || req.user.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID not found");

    const { startDate, endDate } = req.query;

    const [restaurantInfo] = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, restaurantId))
        .limit(1);

    if (!restaurantInfo) {
        const { NotFound } = await import("../../Errors/NotFound");
        throw new NotFound("Restaurant not found");
    }

    const conditions = [
        eq(orders.restaurantId, restaurantId),
        eq(orders.status, "delivered" as OrderStatus)
    ];

    if (startDate) {
        conditions.push(gte(orders.createdAt, new Date(startDate as string)));
    }
    if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        conditions.push(lte(orders.createdAt, end));
    }

    const deliveredOrders = await db
        .select({
            paymentMethod: orders.paymentMethod,
            subtotal: orders.subtotal,
            deliveryFee: orders.deliveryFee,
            serviceFee: orders.serviceFee,
            appCommission: orders.appCommission,
            totalAmount: orders.totalAmount,
        })
        .from(orders)
        .where(and(...conditions));

    const businessPlans = await db
        .select()
        .from(restaurantBusinessPlans)
        .where(eq(restaurantBusinessPlans.restaurantId, restaurantId));

    let grandTotal = {
        orders: 0,
        revenue: 0,
        cash: 0,
        visa: 0,
        wallet: 0,
        commission: 0,
        serviceFee: 0,
        deliveryFee: 0,
        subtotal: 0,
    };

    for (const order of deliveredOrders) {
        const amount = parseFloat(order.totalAmount as string || "0");
        const subtotal = parseFloat(order.subtotal as string || "0");
        const commission = parseFloat(order.appCommission as string || "0");
        const serviceFee = parseFloat(order.serviceFee as string || "0");
        const deliveryFee = parseFloat(order.deliveryFee as string || "0");

        if (order.paymentMethod === "cash_on_delivery") {
            grandTotal.cash += amount;
        } else if (order.paymentMethod === "visa") {
            grandTotal.visa += amount;
        } else if (order.paymentMethod === "wallet") {
            grandTotal.wallet += amount;
        }

        grandTotal.orders += 1;
        grandTotal.revenue += amount;
        grandTotal.subtotal += subtotal;
        grandTotal.commission += commission;
        grandTotal.serviceFee += serviceFee;
        grandTotal.deliveryFee += deliveryFee;
    }

    let commissionRate = 0;
    if (businessPlans.length > 0) {
        const onlinePlan = businessPlans.find(p => p.platformType === "online_order") || businessPlans[0];
        commissionRate = parseFloat(onlinePlan.commissionRate || "0");
    }

    const restaurantOwes = (grandTotal.cash * commissionRate) / 100 + 
                           (grandTotal.serviceFee * (grandTotal.cash / (grandTotal.revenue || 1)));

    const digitalTotal = grandTotal.visa + grandTotal.wallet;
    const platformOwes = digitalTotal - 
                         (digitalTotal * commissionRate) / 100 - 
                         (grandTotal.serviceFee * (digitalTotal / (grandTotal.revenue || 1)));

    const netBalance = platformOwes - restaurantOwes;

    // ==========================================
    // إنشاء الـ PDF بأسلوب الـ White-labeling
    // ==========================================
    const doc = new PDFDocument({ margin: 50 });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Financial_Statement_${restaurantInfo.name.replace(/\s+/g, '_')}_${Date.now()}.pdf"`);
    
    doc.pipe(res);
    
    // Header (White-labeled - يظهر كأنه سيستم المطعم)
    doc.fontSize(24).text(`${restaurantInfo.name}`, { align: 'center' });
    if (restaurantInfo.nameAr) {
        doc.fontSize(16).text(`${restaurantInfo.nameAr}`, { align: 'center' });
    }
    doc.fontSize(14).fillColor('gray').text('Financial Statement & Settlement', { align: 'center' });
    doc.moveDown();
    
    // Date & Context
    doc.fontSize(12).fillColor('black').text(`Statement Period: ${startDate || 'All Time'} to ${endDate || 'All Time'}`);
    doc.text(`Generated On: ${new Date().toLocaleString()}`);
    doc.moveDown();
    
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    // Summary Statistics
    doc.fontSize(16).text('Sales Overview', { underline: true });
    doc.fontSize(12).text(`Total Delivered Orders: ${grandTotal.orders}`);
    doc.text(`Total Gross Sales: ${grandTotal.revenue.toFixed(2)} EGP`);
    doc.moveDown();

    // Payment Breakdown
    doc.fontSize(14).text('Collection Breakdown', { underline: true });
    doc.fontSize(12).text(`Cash Collected (By You): ${grandTotal.cash.toFixed(2)} EGP`);
    doc.text(`Digital Payments (By Platform): ${digitalTotal.toFixed(2)} EGP`);
    doc.moveDown();

    // Fees
    doc.fontSize(14).text('Platform Fees & Deductions', { underline: true });
    doc.fontSize(12).text(`Agreed Commission Rate: ${commissionRate}%`);
    doc.text(`Total Commission Deducted: ${grandTotal.commission.toFixed(2)} EGP`);
    doc.text(`Total Service Fees Deducted: ${grandTotal.serviceFee.toFixed(2)} EGP`);
    doc.text(`Total Delivery Fees (Earned by You): ${grandTotal.deliveryFee.toFixed(2)} EGP`);
    doc.moveDown();

    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    // Settlement Analysis
    doc.fontSize(16).text('Net Settlement Statement', { underline: true });
    doc.fontSize(12).text(`Fees owed from cash orders (You owe platform): ${restaurantOwes.toFixed(2)} EGP`);
    doc.text(`Net digital payouts (Platform owes you): ${platformOwes.toFixed(2)} EGP`);
    
    doc.moveDown();
    doc.fontSize(14).text('Final Account Balance:', { continued: true });
    
    if (netBalance > 0) {
        doc.fillColor('green').text(` Platform owes you ${Math.abs(netBalance).toFixed(2)} EGP`);
    } else if (netBalance < 0) {
        doc.fillColor('red').text(` You owe platform ${Math.abs(netBalance).toFixed(2)} EGP`);
    } else {
        doc.fillColor('black').text(` Accounts are settled (0.00 EGP)`);
    }
    
    // Footer
    doc.moveDown(3);
    doc.fontSize(10).fillColor('gray').text('This is an automatically generated document.', { align: 'center' });

    doc.end();
};