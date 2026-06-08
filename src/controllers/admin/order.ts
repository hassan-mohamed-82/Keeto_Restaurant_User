import { Request, Response } from "express";
import PDFDocument from "pdfkit";
import { db } from "../../models/connection";
import {
    orders, orderItems, food, users, paymentMethods,
    userWallets, userWalletTransactions,
    restaurantWalletTransactions,
    restaurantWallets,
    branches,
    restaurants,
    foodVariations,
    variationOptions,
    addresses,
    zones
} from "../../models/schema";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";
import { selectReasons } from "../../models/schema/admin/selectReasons";
import { sendPushNotification } from "../../utils/notifications";
import { UnauthorizedError } from "../../Errors";

// ==========================================
// 1. جلب كل الأوردرات الخاصة بالمطعم/الفرع
// ==========================================
export const getRestaurantOrders = async (req: Request, res: Response) => {
    // ✅ التحقق من وجود req.user أولاً
    if (!req.user) {
        throw new UnauthorizedError("Not authenticated");
    }

    const adminRestaurantId = req.user.restaurantId || req.user.id;
    const adminBranchId = req.user.branchId; // لو Null يبقى ده المالك

    if (!adminRestaurantId) {
        throw new BadRequest("Restaurant ID not found");
    }

    // بناء الـ Query الأساسي
    let queryConditions = eq(orders.restaurantId, adminRestaurantId);

    // لو ده مدير فرع، نفلتر الأوردرات لفرعه هو بس بشكل إجباري
    if (adminBranchId) {
        queryConditions = and(queryConditions, eq(orders.branchId, adminBranchId)) as any;
    } 
    // لو ده المالك وبعت branchId في الـ Query عشان يفلتر بيه
    else if (req.query?.branchId) {
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
        note: orders.note,
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
    // ✅ التحقق من وجود req.user أولاً
    if (!req.user) {
        throw new UnauthorizedError("Not authenticated");
    }

    const adminRestaurantId = req.user.restaurantId || req.user.id;
    const adminBranchId = req.user.branchId;

    if (!adminRestaurantId) {
        throw new BadRequest("Restaurant ID not found");
    }

    const conditions: any[] = [
        eq(orders.restaurantId, adminRestaurantId),
        eq(orders.status, status)
    ];

    // لو ده مدير فرع، نفلتر إجباري لفرعه هو بس
    if (adminBranchId) {
        conditions.push(eq(orders.branchId, adminBranchId));
    } 
    // لو ده المالك وبعت branchId يفلتر بيه
    else if (req.query?.branchId) {
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
        note: orders.note,
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
        note: orderItems.note,
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
            note: orderDetail.order.note,
            subtotal: orderDetail.order.subtotal,
            deliveryFee: orderDetail.order.deliveryFee,
            serviceFee: orderDetail.order.serviceFee,
            appCommission: orderDetail.order.appCommission,
            totalAmount: orderDetail.order.totalAmount,
            createdAt: orderDetail.order.createdAt,
            updatedAt: orderDetail.order.updatedAt,
            customer: orderDetail.customer,
            
            // ✅ التعديل هنا: هنقرأ الـ paymentMethod من الـ order مباشرة بناءً على التعديل في الداتا بيز
            paymentMethod: orderDetail.order.paymentMethod, 
            
            branch: orderDetail.branch,
            restaurant: orderDetail.restaurant,
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

    const currentStatus = existingOrder.status as string;

    // 🛡️ حماية ضد التغيير بعد الوصول لحالة نهائية
    const finalStatuses = ["delivered", "cancelled", "rejected", "refund"];
    if (finalStatuses.includes(currentStatus)) {
        throw new BadRequest(`Order is already ${currentStatus} and cannot be changed`);
    }

    // 🛡️ حماية ضد الرجوع خطوة للوراء في مسار الطلب
    const statusFlowOrder: Record<string, number> = {
        "pending": 1,
        "accepted": 2,
        "preparing": 3,
        "out_for_delivery": 4,
        "delivered": 5,
    };

    if (statusFlowOrder[currentStatus] && statusFlowOrder[status]) {
        if (statusFlowOrder[status] === statusFlowOrder[currentStatus]) {
            throw new BadRequest(`Order is already ${currentStatus}`);
        }
        if (statusFlowOrder[status] < statusFlowOrder[currentStatus]) {
            throw new BadRequest(`Cannot revert status from ${currentStatus} to ${status}`);
        }
    } else if (currentStatus === status) {
        throw new BadRequest(`Order is already ${currentStatus}`);
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

        // ==========================================
        // 💰 2. الـ Refund (ترجيع الفلوس للعميل) لو الأوردر اتلغى
        // ==========================================
        if (status === "rejected" || status === "cancelled") {
            // Since paymentMethod is now an enum directly on the order:
            if (existingOrder.paymentMethod === "wallet") {
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
            if (existingOrder.paymentMethod === "cash_on_delivery") {
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
                type: (existingOrder.paymentMethod === "cash_on_delivery") ? "cash_collection" : "order_payment",
                amount: (existingOrder.paymentMethod === "cash_on_delivery") ? totalAmount.toString() : netRestaurantEarning.toString(),
                balanceBefore: (existingOrder.paymentMethod === "cash_on_delivery") ? currentCollectedCash.toString() : currentBalance.toString(),
                balanceAfter: (existingOrder.paymentMethod === "cash_on_delivery") ? newCollectedCash.toString() : newBalance.toString(),
                method: existingOrder.paymentMethod,
                reference: existingOrder.orderNumber,
                note: `Order ${existingOrder.orderNumber} delivered. Commission deducted: ${appCommission}`,
                createdAt: new Date()
            });
        }
    });

    // ==========================================
    // 4. Send Notification to User
    // ==========================================
    let messageBody = `Your order ${existingOrder.orderNumber} is now ${status}.`;
    if (status === "cancelled" || status === "rejected") {
        messageBody = `Your order ${existingOrder.orderNumber} was ${status}. Reason: ${cancelReason || "Not specified"}`;
    }

    await sendPushNotification({
        recipientType: "user",
        recipientId: existingOrder.userId,
        title: "Order Update",
        body: messageBody,
        data: {
            orderId: existingOrder.id,
            orderNumber: existingOrder.orderNumber,
            status: status,
            type: "ORDER_STATUS_UPDATE"
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

// ==========================================
// 5. إنشاء فاتورة (PDF) لطلب معين
// ==========================================
export const generateOrderInvoicePDF = async (req: Request, res: Response) => {
    const { orderId } = req.params;
    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    const adminBranchId = req.user?.branchId;

    // 1. جلب البيانات الأساسية للأوردر
    const [orderDetail] = await db.select({
        order: orders,
        customer: {
            id: users.id,
            name: users.name,
            phone: users.phone,
        },
        branch: {
            id: branches.id,
            name: branches.name,
        },
        restaurant: {
            id: restaurants.id,
            name: restaurants.name,
        },
        address: addresses,
        zone: {
            name: zones.name
        }
    })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .leftJoin(branches, eq(orders.branchId, branches.id))
        .leftJoin(restaurants, eq(orders.restaurantId, restaurants.id))
        .leftJoin(addresses, eq(orders.addressId, addresses.id))
        .leftJoin(zones, eq(addresses.zoneId, zones.id))
        .where(eq(orders.id, orderId))
        .limit(1);

    if (!orderDetail) throw new NotFound("Order not found");

    // 🛡️ حماية الصلاحيات
    if (orderDetail.order.restaurantId !== adminRestaurantId) {
        throw new BadRequest("Unauthorized: Order does not belong to your restaurant");
    }
    if (adminBranchId && orderDetail.order.branchId !== adminBranchId) {
        throw new BadRequest("Unauthorized: Order does not belong to your branch");
    }

    // 2. جلب أصناف الأكل
    const items = await db.select({
        quantity: orderItems.quantity,
        basePrice: orderItems.basePrice,
        totalPrice: orderItems.totalPrice,
        foodName: food.name,
        foodNameAr: food.nameAr,
    })
        .from(orderItems)
        .leftJoin(food, eq(orderItems.foodId, food.id))
        .where(eq(orderItems.orderId, orderId));

    // 3. إنشاء الـ PDF (شكل إيصال حراري / فاتورة)
    const doc = new PDFDocument({ margin: 20, size: [250, 600] }); // حجم إيصال حراري تقريبي

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Receipt_${orderDetail.order.orderNumber}.pdf"`);

    doc.pipe(res);

    // Header
    doc.fontSize(16).text(orderDetail.restaurant?.name || 'Restaurant', { align: 'center' });
    if (orderDetail.branch?.name) {
        doc.fontSize(12).text(orderDetail.branch.name, { align: 'center' });
    }
    
    doc.moveDown(0.5);
    doc.moveTo(10, doc.y).lineTo(240, doc.y).dash(2, { space: 2 }).stroke();
    doc.undash();
    doc.moveDown(0.5);

    // Order Info
    doc.fontSize(10);
    doc.text(`Order #: ${orderDetail.order.orderNumber}`);
    const orderDate = new Date(orderDetail.order.createdAt || new Date());
    doc.text(`Date: ${orderDate.toISOString().split('T')[0]}`);
    doc.text(`Time: ${orderDate.toLocaleTimeString()}`);
    doc.text(`Client: ${orderDetail.customer?.name || 'Guest'}`);
    doc.text(`Phone: ${orderDetail.customer?.phone || 'N/A'}`);
    doc.text(`Order Type: ${orderDetail.order.orderType}`);
    doc.text(`Payment: ${orderDetail.order.paymentMethod}`);
    
    doc.moveDown(0.5);
    doc.moveTo(10, doc.y).lineTo(240, doc.y).dash(2, { space: 2 }).stroke();
    doc.undash();
    doc.moveDown(0.5);

    // Delivery Address if applicable
    if (orderDetail.order.orderType === 'delivery' && orderDetail.address) {
        doc.text('Delivery Address:', { underline: true });
        doc.text(`Zone: ${orderDetail.zone?.name || ''}`);
        doc.text(`Street: ${orderDetail.address.street || ''}`);
        let details = `Bldg: ${orderDetail.address.number || ''}`;
        if (orderDetail.address.floor) details += ` | Floor: ${orderDetail.address.floor}`;
        doc.text(details);
        
        doc.moveDown(0.5);
        doc.moveTo(10, doc.y).lineTo(240, doc.y).dash(2, { space: 2 }).stroke();
        doc.undash();
        doc.moveDown(0.5);
    }

    // Items Header
    const itemStartY = doc.y;
    doc.text('Item', 10, itemStartY, { width: 100 });
    doc.text('Qty', 110, itemStartY, { width: 30, align: 'right' });
    doc.text('Price', 140, itemStartY, { width: 45, align: 'right' });
    doc.text('Total', 185, itemStartY, { width: 55, align: 'right' });
    doc.moveDown(0.2);
    
    doc.moveTo(10, doc.y).lineTo(240, doc.y).stroke();
    doc.moveDown(0.5);

    // Items Loop
    for (const item of items) {
        const y = doc.y;
        const name = item.foodName || item.foodNameAr || 'Item';
        doc.text(name, 10, y, { width: 100 });
        doc.text(item.quantity.toString(), 110, y, { width: 30, align: 'right' });
        doc.text(parseFloat(item.basePrice as string).toFixed(2), 140, y, { width: 45, align: 'right' });
        doc.text(parseFloat(item.totalPrice as string).toFixed(2), 185, y, { width: 55, align: 'right' });
        doc.moveDown(0.5);
    }

    doc.moveTo(10, doc.y).lineTo(240, doc.y).stroke();
    doc.moveDown(0.5);

    // Totals
    const subtotal = parseFloat(orderDetail.order.subtotal as string).toFixed(2);
    const tax = "0.00"; // Assuming 0 for now as tax isn't in DB currently
    const deliveryFee = parseFloat(orderDetail.order.deliveryFee as string).toFixed(2);
    const total = parseFloat(orderDetail.order.totalAmount as string).toFixed(2);

    doc.text(`Total Product Price`, 10, doc.y, { continued: true }).text(`${subtotal}`, { align: 'right' });
    doc.text(`Tax %`, 10, doc.y, { continued: true }).text(`${tax}`, { align: 'right' });
    doc.text(`Delivery Fee`, 10, doc.y, { continued: true }).text(`${deliveryFee}`, { align: 'right' });
    
    doc.moveDown(0.5);
    doc.moveTo(10, doc.y).lineTo(240, doc.y).stroke();
    doc.moveDown(0.5);

    doc.fontSize(14).text(`Grand Total`, 10, doc.y, { continued: true }).text(`${total}`, { align: 'right' });

    doc.moveDown(1);
    doc.fontSize(10).text('Thank you for your order', { align: 'center' });
    doc.fontSize(8).text('Powered by Keeto', { align: 'center' });

    doc.end();
};



export const getallnumbersoforders = async (req: Request, res: Response) => {
    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    if (!adminRestaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    const statusCountsResult = await db
        .select({
            status: orders.status,
            count: sql<number>`count(${orders.id})`,
        })
        .from(orders)
        .where(eq(orders.restaurantId, adminRestaurantId))
        .groupBy(orders.status);

    const totalOrders = statusCountsResult.reduce((acc, curr) => acc + Number(curr.count), 0);

    // Format the status counts as an object for easier consumption
    const statusCounts = statusCountsResult.reduce((acc, curr) => {
        if (curr.status) {
            acc[curr.status] = Number(curr.count);
        }
        return acc;
    }, {} as Record<string, number>);

    return SuccessResponse(res, { 
        data: {
            totalOrders,
            statusCounts
        } 
    });
};