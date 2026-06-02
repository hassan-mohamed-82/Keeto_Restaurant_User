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
import { eq, and, desc, gte, lte, sql, count, sum } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { UnauthorizedError } from "../../Errors";
import { BadRequest } from "../../Errors/BadRequest";

// 1. تعريف الأنواع المسموحة للـ Enums
type OrderStatus = "pending" | "accepted" | "preparing" | "out_for_delivery" | "delivered" | "cancelled" | "rejected" | "refund";
type PaymentMethod = "cash_on_delivery" | "visa" | "wallet";



// ==========================================
// API 2: تقرير المطعم الخاص بيّا (للأدمن بتاع المطعم نفسه)
// ==========================================
export const getMyRestaurantReport = async (req: Request | any, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");

    const restaurantId = req.user.restaurantId || req.user.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID not found");

    const { startDate, endDate, branchId } = req.query;

    // ==========================================
    // 1. بناء شروط الفلترة
    // ==========================================
    const conditions: any[] = [eq(orders.restaurantId, restaurantId)];

    if (startDate) {
        conditions.push(gte(orders.createdAt, new Date(startDate as string)));
    }
    if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        conditions.push(lte(orders.createdAt, end));
    }

    // لو عايز يفلتر بفرع معين
    if (branchId) {
        conditions.push(eq(orders.branchId, branchId as string));
    }

    // لو مدير فرع، يشوف فرعه بس
    if (req.user.branchId) {
        conditions.push(eq(orders.branchId, req.user.branchId));
    }

    // ==========================================
    // 2. جلب كل الأوردرات الخاصة بالمطعم
    // ==========================================
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

    // ==========================================
    // 3. تجميع الإحصائيات
    // ==========================================

    // --- ملخص حسب الحالة ---
    const statusSummary: Record<string, { count: number; totalAmount: number }> = {};
    const allStatuses: OrderStatus[] = ["pending", "accepted", "preparing", "out_for_delivery", "delivered", "cancelled", "rejected", "refund"];
    for (const s of allStatuses) {
        statusSummary[s] = { count: 0, totalAmount: 0 };
    }

    // --- ملخص حسب طريقة الدفع ---
    const paymentSummary: Record<string, { count: number; totalAmount: number }> = {
        cash_on_delivery: { count: 0, totalAmount: 0 },
        visa: { count: 0, totalAmount: 0 },
        wallet: { count: 0, totalAmount: 0 },
    };

    // --- ملخص حسب نوع الأوردر ---
    const orderTypeSummary: Record<string, { count: number; totalAmount: number }> = {
        delivery: { count: 0, totalAmount: 0 },
        takeaway: { count: 0, totalAmount: 0 },
        dine_in: { count: 0, totalAmount: 0 },
    };

    // --- ملخص حسب مصدر الأوردر ---
    const orderSourceSummary: Record<string, { count: number; totalAmount: number }> = {
        online_order: { count: 0, totalAmount: 0 },
        food_aggregator: { count: 0, totalAmount: 0 },
    };

    // --- ملخص حسب الفرع ---
    const branchSummary: Record<string, {
        branchId: string;
        branchName: string;
        totalOrders: number;
        deliveredOrders: number;
        cancelledOrders: number;
        totalAmount: number;
        deliveredAmount: number;
    }> = {};

    // --- ملخص يومي (آخر 30 يوم أو حسب الفلتر) ---
    const dailyTrend: Record<string, { date: string; orders: number; revenue: number }> = {};

    // --- الإجماليات ---
    let totalOrders = 0;
    let totalRevenue = 0; // إجمالي المبلغ
    let totalSubtotal = 0;
    let totalDeliveryFees = 0;
    let totalServiceFees = 0;
    let totalAppCommission = 0;
    let deliveredRevenue = 0; // الإيراد الفعلي (delivered بس)

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
        }

        // حسب الحالة
        if (statusSummary[status]) {
            statusSummary[status].count++;
            statusSummary[status].totalAmount += amount;
        }

        // حسب طريقة الدفع
        if (paymentSummary[payment]) {
            paymentSummary[payment].count++;
            paymentSummary[payment].totalAmount += amount;
        }

        // حسب نوع الأوردر
        if (orderTypeSummary[oType]) {
            orderTypeSummary[oType].count++;
            orderTypeSummary[oType].totalAmount += amount;
        }

        // حسب مصدر الأوردر
        if (orderSourceSummary[oSource]) {
            orderSourceSummary[oSource].count++;
            orderSourceSummary[oSource].totalAmount += amount;
        }

        // حسب الفرع
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

        // الترند اليومي
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

    // ==========================================
    // 4. أكتر الأصناف مبيعاً (Top Selling Items)
    // ==========================================
    // بنجيب الأصناف من الأوردرات المسلمة بس
    const deliveredOrderIds = allOrders
        .filter(o => o.status === "delivered")
        .map(o => o.orderId);

    let topSellingItems: any[] = [];
    if (deliveredOrderIds.length > 0) {
        // نعمل الكويري على دفعات عشان نتجنب مشاكل الـ IN clause الكبيرة
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

    // ==========================================
    // 5. بيانات المحفظة
    // ==========================================
    const [wallet] = await db
        .select()
        .from(restaurantWallets)
        .where(eq(restaurantWallets.restaurantId, restaurantId))
        .limit(1);

    // ==========================================
    // 6. بيانات خطة العمل
    // ==========================================
    const businessPlans = await db
        .select()
        .from(restaurantBusinessPlans)
        .where(eq(restaurantBusinessPlans.restaurantId, restaurantId));

    // ==========================================
    // 7. بيانات المطعم الأساسية
    // ==========================================
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

    // ==========================================
    // 8. حساب صافي الأرباح
    // ==========================================
    const netRevenue = deliveredRevenue - totalAppCommission;

    // ==========================================
    // 9. معدل الإلغاء
    // ==========================================
    const cancelledCount = (statusSummary["cancelled"]?.count || 0) + (statusSummary["rejected"]?.count || 0);
    const cancellationRate = totalOrders > 0 ? ((cancelledCount / totalOrders) * 100).toFixed(2) : "0.00";

    // ==========================================
    // 10. متوسط قيمة الأوردر
    // ==========================================
    const deliveredCount = statusSummary["delivered"]?.count || 0;
    const avgOrderValue = deliveredCount > 0 ? (deliveredRevenue / deliveredCount).toFixed(2) : "0.00";

    // ==========================================
    // الـ Response النهائي
    // ==========================================
    return SuccessResponse(res, {
        message: "Restaurant report generated successfully",
        data: {
            // بيانات المطعم
            restaurant: restaurantInfo || null,

            // ملخص عام
            overview: {
                totalOrders,
                deliveredOrders: deliveredCount,
                cancelledOrders: cancelledCount,
                cancellationRate: cancellationRate + "%",
                avgOrderValue,
            },

            // الماليات
            financials: {
                totalRevenue: totalRevenue.toFixed(2),           // إجمالي كل الأوردرات
                deliveredRevenue: deliveredRevenue.toFixed(2),   // إيراد الأوردرات المسلمة
                totalSubtotal: totalSubtotal.toFixed(2),
                totalDeliveryFees: totalDeliveryFees.toFixed(2),
                totalServiceFees: totalServiceFees.toFixed(2),
                totalAppCommission: totalAppCommission.toFixed(2),
                netRevenue: netRevenue.toFixed(2),               // صافي بعد خصم العمولة
            },

            // تفاصيل حسب الحالة
            ordersByStatus: Object.entries(statusSummary).map(([status, data]) => ({
                status,
                count: data.count,
                totalAmount: data.totalAmount.toFixed(2),
            })),

            // تفاصيل حسب طريقة الدفع
            ordersByPayment: Object.entries(paymentSummary).map(([method, data]) => ({
                paymentMethod: method,
                count: data.count,
                totalAmount: data.totalAmount.toFixed(2),
            })),

            // تفاصيل حسب نوع الأوردر
            ordersByType: Object.entries(orderTypeSummary).map(([type, data]) => ({
                orderType: type,
                count: data.count,
                totalAmount: data.totalAmount.toFixed(2),
            })),

            // تفاصيل حسب مصدر الأوردر
            ordersBySource: Object.entries(orderSourceSummary).map(([source, data]) => ({
                orderSource: source,
                count: data.count,
                totalAmount: data.totalAmount.toFixed(2),
            })),

            // تفاصيل حسب الفروع
            branchBreakdown: Object.values(branchSummary).map(b => ({
                branchId: b.branchId,
                branchName: b.branchName,
                totalOrders: b.totalOrders,
                deliveredOrders: b.deliveredOrders,
                cancelledOrders: b.cancelledOrders,
                totalAmount: b.totalAmount.toFixed(2),
                deliveredAmount: b.deliveredAmount.toFixed(2),
            })),

            // الترند اليومي
            dailyTrend: Object.values(dailyTrend).sort((a, b) => a.date.localeCompare(b.date)),

            // أكتر الأصناف مبيعاً
            topSellingItems,

            // المحفظة
            wallet: wallet ? {
                balance: wallet.balance,
                collectedCash: wallet.collectedCash,
                pendingWithdraw: wallet.pendingWithdraw,
                totalWithdrawn: wallet.totalWithdrawn,
                totalEarning: wallet.totalEarning,
            } : null,

            // خطة العمل
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