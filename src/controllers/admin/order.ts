import { Request, Response } from "express";
import { db } from "../../models/connection";
import {
    orders, orderItems, food, users, paymentMethods,
    userWallets, userWalletTransactions,
    restaurantWalletTransactions,
    restaurantWallets,
    branches,
    restaurants,
    foodVariations,
    variationOptions
} from "../../models/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";
import { selectReasons } from "../../models/schema/admin/selectReasons";

// ==========================================
// 1. جلب كل الأوردرات الخاصة بالمطعم/الفرع
// ==========================================
export const getRestaurantOrders = async (req: Request, res: Response) => {
    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    const adminBranchId = req.user?.branchId; // لو Null يبقى ده المالك

    if (!adminRestaurantId) throw new BadRequest("Unauthorized");

    // بناء الـ Query الأساسي
    let queryConditions = eq(orders.restaurantId, adminRestaurantId);

    // لو ده مدير فرع، نفلتر الأوردرات لفرعه هو بس بشكل إجباري
    if (adminBranchId) {
        queryConditions = and(queryConditions, eq(orders.branchId, adminBranchId)) as any;
    } 
    // لو ده المالك وبعت branchId في الـ Query عشان يفلتر بيه
    else if (req.query.branchId) {
        queryConditions = and(queryConditions, eq(orders.branchId, req.query.branchId as string)) as any;
    }

    const restaurantOrders = await db.select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        customerName: users.name,
        customerPhone: users.phone,
        orderType: orders.orderType,
        totalAmount: orders.totalAmount,
        status: orders.status,
        createdAt: orders.createdAt,
    })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .where(queryConditions)
        .orderBy(desc(orders.createdAt)); // ترتيب من الأحدث للأقدم

    return SuccessResponse(res, { message: "Get orders success", data: restaurantOrders });
};

// ==========================================
// Helper: جلب أوردرات بحالة معينة
// ==========================================
const getOrdersByStatus = async (req: Request, res: Response, status: "pending" | "accepted" | "preparing" | "out_for_delivery" | "delivered" | "cancelled" | "rejected" | "refund") => {
    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    const adminBranchId = req.user?.branchId;

    if (!adminRestaurantId) throw new BadRequest("Unauthorized");

    const conditions: any[] = [
        eq(orders.restaurantId, adminRestaurantId),
        eq(orders.status, status)
    ];

    // لو ده مدير فرع، نفلتر إجباري لفرعه هو بس
    if (adminBranchId) {
        conditions.push(eq(orders.branchId, adminBranchId));
    } 
    // لو ده المالك وبعت branchId يفلتر بيه
    else if (req.query.branchId) {
        conditions.push(eq(orders.branchId, req.query.branchId as string));
    }

    const result = await db.select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        customerName: users.name,
        customerPhone: users.phone,
        orderType: orders.orderType,
        orderSource: orders.orderSource,
        subtotal: orders.subtotal,
        deliveryFee: orders.deliveryFee,
        totalAmount: orders.totalAmount,
        status: orders.status,
        branchName: branches.name,
        createdAt: orders.createdAt,
    })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .leftJoin(branches, eq(orders.branchId, branches.id))
        .where(and(...conditions))
        .orderBy(desc(orders.createdAt));

    return SuccessResponse(res, { message: `Get ${status} orders success`, data: result });
};

// ==========================================
// APIs لكل حالة أوردر
// ==========================================
export const getPendingOrders = async (req: Request, res: Response) => getOrdersByStatus(req, res, "pending");
export const getAcceptedOrders = async (req: Request, res: Response) => getOrdersByStatus(req, res, "accepted");
export const getPreparingOrders = async (req: Request, res: Response) => getOrdersByStatus(req, res, "preparing");
export const getOutForDeliveryOrders = async (req: Request, res: Response) => getOrdersByStatus(req, res, "out_for_delivery");
export const getDeliveredOrders = async (req: Request, res: Response) => getOrdersByStatus(req, res, "delivered");
export const getCancelledOrders = async (req: Request, res: Response) => getOrdersByStatus(req, res, "cancelled");
export const getRejectedOrders = async (req: Request, res: Response) => getOrdersByStatus(req, res, "rejected");
export const getRefundOrders = async (req: Request, res: Response) => getOrdersByStatus(req, res, "refund");

// ==========================================
// 2. جلب تفاصيل أوردر معين بالـ ID (كامل)
// ==========================================
export const getRestaurantOrderById = async (req: Request, res: Response) => {
    const { id } = req.params;
    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    const adminBranchId = req.user?.branchId;

    // 1. جلب البيانات الأساسية للأوردر
    const [orderDetail] = await db.select({
        order: orders,
        customer: {
            id: users.id,
            name: users.name,
            phone: users.phone,
            email: users.email,
        },
        // ❌ شيلنا الـ paymentMethod من هنا لأنها بقت جوه الـ order نفسه
        branch: {
            id: branches.id,
            name: branches.name,
        },
        restaurant: {
            id: restaurants.id,
            name: restaurants.name,
        }
    })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        // ❌ شيلنا الـ leftJoin بتاع جدول payment_methods من هنا
        .leftJoin(branches, eq(orders.branchId, branches.id))
        .leftJoin(restaurants, eq(orders.restaurantId, restaurants.id))
        .where(eq(orders.id, id))
        .limit(1);

    if (!orderDetail) throw new NotFound("Order not found");

    // 🛡️ حماية الصلاحيات
    if (orderDetail.order.restaurantId !== adminRestaurantId) {
        throw new BadRequest("Unauthorized: Order does not belong to your restaurant");
    }
    if (adminBranchId && orderDetail.order.branchId !== adminBranchId) {
        throw new BadRequest("Unauthorized: Order does not belong to your branch");
    }

    // 2. جلب أصناف الأكل (Order Items)
    const items = await db.select({
        id: orderItems.id,
        foodId: orderItems.foodId,
        quantity: orderItems.quantity,
        basePrice: orderItems.basePrice,
        variationsPrice: orderItems.variationsPrice,
        totalPrice: orderItems.totalPrice,
        foodName: food.name,
        foodNameAr: food.nameAr,
        foodNameFr: food.nameFr,
        foodImage: food.image,
        foodDescription: food.description,
    })
        .from(orderItems)
        .leftJoin(food, eq(orderItems.foodId, food.id))
        .where(eq(orderItems.orderId, id));

    return SuccessResponse(res, {
        message: "Get order details success",
        data: {
            id: orderDetail.order.id,
            orderNumber: orderDetail.order.orderNumber,
            orderType: orderDetail.order.orderType,
            orderSource: orderDetail.order.orderSource,
            status: orderDetail.order.status,
            cancelReason: orderDetail.order.cancelReason,
            subtotal: orderDetail.order.subtotal,
            deliveryFee: orderDetail.order.deliveryFee,
            serviceFee: orderDetail.order.serviceFee,
            appCommission: orderDetail.order.appCommission,
            totalAmount: orderDetail.order.totalAmount,
            createdAt: orderDetail.order.createdAt,
            updatedAt: orderDetail.order.updatedAt,
            customer: orderDetail.customer,
            
            // ✅ التعديل هنا: هنقرأ الـ paymentMethodId من الـ order مباشرة
            paymentMethodId: orderDetail.order.paymentMethodId, 
            
            branch: orderDetail.branch,
            restaurant: orderDetail.restaurant,
            // (addressId removed because it does not exist on the order schema)
            items
        }
    });
};
// ==========================================
// 3. تحديث حالة الأوردر (مع إرجاع الفلوس لو اترفض)
// ==========================================
export const updateOrderStatus = async (req: Request, res: Response) => {
    const { orderId } = req.params;
    const { status, cancelReason } = req.body;

    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    const adminBranchId = req.user?.branchId;

    if (!status) throw new BadRequest("Status is required");

    // إجبار الموظف يكتب سبب لو كنسل الأوردر
    if ((status === "rejected" || status === "cancelled") && !cancelReason) {
        throw new BadRequest("Cancel reason is required when rejecting or cancelling an order");
    }

    const [existingOrder] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!existingOrder) throw new NotFound("Order not found");

    // 🛡️ حماية الصلاحيات
    if (existingOrder.restaurantId !== adminRestaurantId) throw new BadRequest("Unauthorized");
    if (adminBranchId && existingOrder.branchId !== adminBranchId) throw new BadRequest("Unauthorized");

    // 🛡️ حماية مالية: منع تكرار العملية لو الطلب متسلم أو ملغي مسبقاً
    if (existingOrder.status === "delivered" && status === "delivered") {
        throw new BadRequest("Order is already delivered and settled");
    }
    if ((existingOrder.status === "cancelled" || existingOrder.status === "rejected") && (status === "cancelled" || status === "rejected")) {
        throw new BadRequest("Order is already cancelled/rejected");
    }

    // Transaction لتحديث الحالة وتنفيذ العمليات المالية
    await db.transaction(async (tx) => {
        // 1. تحديث الحالة
        await tx.update(orders)
            .set({
                status,
                cancelReason: (status === "rejected" || status === "cancelled") ? cancelReason : null,
                updatedAt: new Date()
            })
            .where(eq(orders.id, orderId));

        // جلب وسيلة الدفع لاستخدامها في العمليات المالية
        const [paymentMethod] = await tx.select().from(paymentMethods)
            .where(eq(paymentMethods.id, existingOrder.paymentMethodId)).limit(1);

        // ==========================================
        // 💰 2. الـ Refund (ترجيع الفلوس للعميل) لو الأوردر اتلغى
        // ==========================================
        if (status === "rejected" || status === "cancelled") {
            if (paymentMethod && paymentMethod.type === "wallet") {
                const [userWallet] = await tx.select().from(userWallets)
                    .where(eq(userWallets.userId, existingOrder.userId)).limit(1);

                if (userWallet) {
                    const balanceBefore = parseFloat(userWallet.balance as string);
                    const amountToRefund = parseFloat(existingOrder.totalAmount as string);
                    const newBalance = balanceBefore + amountToRefund;

                    // إرجاع الفلوس
                    await tx.update(userWallets)
                        .set({ balance: newBalance.toString(), updatedAt: new Date() })
                        .where(eq(userWallets.id, userWallet.id));

                    // تسجيل الحركة كـ Credit
                    await tx.insert(userWalletTransactions).values({
                        id: uuidv4(),
                        userId: existingOrder.userId,
                        paymentMethodId: existingOrder.paymentMethodId,
                        type: "credit",
                        transactionType: "refund",
                        amount: amountToRefund.toString(),
                        balanceBefore: balanceBefore.toString(),
                        reference: existingOrder.orderNumber,
                        status: "approved"
                    });
                }
            }
        }

        // ==========================================
        // 📈 3. الـ Settlement (إضافة الأرباح للمطعم) لو الأوردر اتسلم
        // ==========================================
        if (status === "delivered") {
            const restaurantId = existingOrder.restaurantId;
            const totalAmount = parseFloat(existingOrder.totalAmount as string);
            const appCommission = parseFloat(existingOrder.appCommission as string);
            const netRestaurantEarning = totalAmount - appCommission; // الصافي للمطعم

            // جلب محفظة المطعم (أو إنشائها لو مش موجودة)
            let [restWallet] = await tx.select().from(restaurantWallets).where(eq(restaurantWallets.restaurantId, restaurantId)).limit(1);
            if (!restWallet) {
                await tx.insert(restaurantWallets).values({ id: uuidv4(), restaurantId });
                [restWallet] = await tx.select().from(restaurantWallets).where(eq(restaurantWallets.restaurantId, restaurantId)).limit(1);
            }

            const currentBalance = parseFloat(restWallet.balance as string);
            const currentCollectedCash = parseFloat(restWallet.collectedCash as string);
            const currentTotalEarning = parseFloat(restWallet.totalEarning as string);

            let newBalance = currentBalance;
            let newCollectedCash = currentCollectedCash;

            // توجيه الأموال بناءً على طريقة الدفع
            if (paymentMethod && paymentMethod.type === "cash") {
                newCollectedCash = currentCollectedCash + totalAmount; // كاش في إيد المطعم
            } else {
                newBalance = currentBalance + netRestaurantEarning; // أونلاين، نزود رصيد المطعم
            }

            // تحديث محفظة المطعم
            await tx.update(restaurantWallets)
                .set({
                    balance: newBalance.toString(),
                    collectedCash: newCollectedCash.toString(),
                    totalEarning: (currentTotalEarning + netRestaurantEarning).toString(),
                    updatedAt: new Date()
                })
                .where(eq(restaurantWallets.restaurantId, restaurantId));

            // تسجيل ترانزكشن المطعم
            await tx.insert(restaurantWalletTransactions).values({
                id: uuidv4(),
                restaurantId: restaurantId,
                type: (paymentMethod && paymentMethod.type === "cash") ? "cash_collection" : "order_payment",
                amount: (paymentMethod && paymentMethod.type === "cash") ? totalAmount.toString() : netRestaurantEarning.toString(),
                balanceBefore: (paymentMethod && paymentMethod.type === "cash") ? currentCollectedCash.toString() : currentBalance.toString(),
                balanceAfter: (paymentMethod && paymentMethod.type === "cash") ? newCollectedCash.toString() : newBalance.toString(),
                method: paymentMethod ? paymentMethod.type : "unknown",
                reference: existingOrder.orderNumber,
                note: `Order ${existingOrder.orderNumber} delivered. Commission deducted: ${appCommission}`,
                createdAt: new Date()
            });
        }
    });

    return SuccessResponse(res, { message: `Order status successfully updated to ${status} and financials settled` });
};

export const getReasons = async (req: Request, res: Response) => {
    const reasons = await db
        .select()
        .from(selectReasons)
        .where(eq(selectReasons.status, "active"));

    return SuccessResponse(res, { 
        message: "Active reasons fetched successfully", 
        data: reasons 
    });
};