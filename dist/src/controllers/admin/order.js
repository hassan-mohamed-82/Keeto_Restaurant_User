"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateOrderStatus = exports.getRestaurantOrderById = exports.getRefundOrders = exports.getRejectedOrders = exports.getCancelledOrders = exports.getDeliveredOrders = exports.getOutForDeliveryOrders = exports.getPreparingOrders = exports.getAcceptedOrders = exports.getPendingOrders = exports.getRestaurantOrders = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const NotFound_1 = require("../../Errors/NotFound");
const uuid_1 = require("uuid");
// ==========================================
// 1. جلب كل الأوردرات الخاصة بالمطعم/الفرع
// ==========================================
const getRestaurantOrders = async (req, res) => {
    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    const adminBranchId = req.user?.branchId; // لو Null يبقى ده المالك
    if (!adminRestaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    // بناء الـ Query الأساسي
    let queryConditions = (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, adminRestaurantId);
    // لو ده مدير فرع، نفلتر الأوردرات لفرعه هو بس
    if (adminBranchId) {
        queryConditions = (0, drizzle_orm_1.and)(queryConditions, (0, drizzle_orm_1.eq)(schema_1.orders.branchId, adminBranchId));
    }
    const restaurantOrders = await connection_1.db.select({
        id: schema_1.orders.id,
        orderNumber: schema_1.orders.orderNumber,
        customerName: schema_1.users.name,
        customerPhone: schema_1.users.phone,
        orderType: schema_1.orders.orderType,
        totalAmount: schema_1.orders.totalAmount,
        status: schema_1.orders.status,
        createdAt: schema_1.orders.createdAt,
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.orders.userId, schema_1.users.id))
        .where(queryConditions)
        .orderBy((0, drizzle_orm_1.desc)(schema_1.orders.createdAt)); // ترتيب من الأحدث للأقدم
    return (0, response_1.SuccessResponse)(res, { message: "Get orders success", data: restaurantOrders });
};
exports.getRestaurantOrders = getRestaurantOrders;
// ==========================================
// Helper: جلب أوردرات بحالة معينة
// ==========================================
const getOrdersByStatus = async (req, res, status) => {
    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    const adminBranchId = req.user?.branchId;
    if (!adminRestaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const conditions = [
        (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, adminRestaurantId),
        (0, drizzle_orm_1.eq)(schema_1.orders.status, status)
    ];
    if (adminBranchId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.branchId, adminBranchId));
    }
    const result = await connection_1.db.select({
        id: schema_1.orders.id,
        orderNumber: schema_1.orders.orderNumber,
        customerName: schema_1.users.name,
        customerPhone: schema_1.users.phone,
        orderType: schema_1.orders.orderType,
        orderSource: schema_1.orders.orderSource,
        subtotal: schema_1.orders.subtotal,
        deliveryFee: schema_1.orders.deliveryFee,
        totalAmount: schema_1.orders.totalAmount,
        status: schema_1.orders.status,
        branchName: schema_1.branches.name,
        createdAt: schema_1.orders.createdAt,
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.orders.userId, schema_1.users.id))
        .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.orders.branchId, schema_1.branches.id))
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.orders.createdAt));
    return (0, response_1.SuccessResponse)(res, { message: `Get ${status} orders success`, data: result });
};
// ==========================================
// APIs لكل حالة أوردر
// ==========================================
const getPendingOrders = async (req, res) => getOrdersByStatus(req, res, "pending");
exports.getPendingOrders = getPendingOrders;
const getAcceptedOrders = async (req, res) => getOrdersByStatus(req, res, "accepted");
exports.getAcceptedOrders = getAcceptedOrders;
const getPreparingOrders = async (req, res) => getOrdersByStatus(req, res, "preparing");
exports.getPreparingOrders = getPreparingOrders;
const getOutForDeliveryOrders = async (req, res) => getOrdersByStatus(req, res, "out_for_delivery");
exports.getOutForDeliveryOrders = getOutForDeliveryOrders;
const getDeliveredOrders = async (req, res) => getOrdersByStatus(req, res, "delivered");
exports.getDeliveredOrders = getDeliveredOrders;
const getCancelledOrders = async (req, res) => getOrdersByStatus(req, res, "cancelled");
exports.getCancelledOrders = getCancelledOrders;
const getRejectedOrders = async (req, res) => getOrdersByStatus(req, res, "rejected");
exports.getRejectedOrders = getRejectedOrders;
const getRefundOrders = async (req, res) => getOrdersByStatus(req, res, "refund");
exports.getRefundOrders = getRefundOrders;
// ==========================================
// 2. جلب تفاصيل أوردر معين بالـ ID (كامل)
// ==========================================
const getRestaurantOrderById = async (req, res) => {
    const { id } = req.params;
    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    const adminBranchId = req.user?.branchId;
    // 1. جلب البيانات الأساسية للأوردر مع كل التفاصيل
    const [orderDetail] = await connection_1.db.select({
        order: schema_1.orders,
        customer: {
            id: schema_1.users.id,
            name: schema_1.users.name,
            phone: schema_1.users.phone,
            email: schema_1.users.email,
        },
        paymentMethod: {
            id: schema_1.paymentMethods.id,
            name: schema_1.paymentMethods.name,
            type: schema_1.paymentMethods.type,
        },
        branch: {
            id: schema_1.branches.id,
            name: schema_1.branches.name,
        },
        restaurant: {
            id: schema_1.restaurants.id,
            name: schema_1.restaurants.name,
        }
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.orders.userId, schema_1.users.id))
        .leftJoin(schema_1.paymentMethods, (0, drizzle_orm_1.eq)(schema_1.orders.paymentMethodId, schema_1.paymentMethods.id))
        .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.orders.branchId, schema_1.branches.id))
        .leftJoin(schema_1.restaurants, (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, schema_1.restaurants.id))
        .where((0, drizzle_orm_1.eq)(schema_1.orders.id, id))
        .limit(1);
    if (!orderDetail)
        throw new NotFound_1.NotFound("Order not found");
    // 🛡️ حماية الصلاحيات
    if (orderDetail.order.restaurantId !== adminRestaurantId) {
        throw new BadRequest_1.BadRequest("Unauthorized: Order does not belong to your restaurant");
    }
    if (adminBranchId && orderDetail.order.branchId !== adminBranchId) {
        throw new BadRequest_1.BadRequest("Unauthorized: Order does not belong to your branch");
    }
    // 2. جلب أصناف الأكل اللي جوه الأوردر ده (Order Items) مع تفاصيل كاملة
    const items = await connection_1.db.select({
        id: schema_1.orderItems.id,
        foodId: schema_1.orderItems.foodId,
        quantity: schema_1.orderItems.quantity,
        basePrice: schema_1.orderItems.basePrice,
        variationsPrice: schema_1.orderItems.variationsPrice,
        totalPrice: schema_1.orderItems.totalPrice,
        foodName: schema_1.food.name,
        foodNameAr: schema_1.food.nameAr,
        foodNameFr: schema_1.food.nameFr,
        foodImage: schema_1.food.image,
        foodDescription: schema_1.food.description,
    })
        .from(schema_1.orderItems)
        .leftJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.orderItems.foodId, schema_1.food.id))
        .where((0, drizzle_orm_1.eq)(schema_1.orderItems.orderId, id));
    return (0, response_1.SuccessResponse)(res, {
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
            paymentMethod: orderDetail.paymentMethod,
            branch: orderDetail.branch,
            restaurant: orderDetail.restaurant,
            items
        }
    });
};
exports.getRestaurantOrderById = getRestaurantOrderById;
// ==========================================
// 3. تحديث حالة الأوردر (مع إرجاع الفلوس لو اترفض)
// ==========================================
const updateOrderStatus = async (req, res) => {
    const { orderId } = req.params;
    const { status, cancelReason } = req.body;
    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    const adminBranchId = req.user?.branchId;
    if (!status)
        throw new BadRequest_1.BadRequest("Status is required");
    // إجبار الموظف يكتب سبب لو كنسل الأوردر
    if ((status === "rejected" || status === "cancelled") && !cancelReason) {
        throw new BadRequest_1.BadRequest("Cancel reason is required when rejecting or cancelling an order");
    }
    const [existingOrder] = await connection_1.db.select().from(schema_1.orders).where((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId)).limit(1);
    if (!existingOrder)
        throw new NotFound_1.NotFound("Order not found");
    // 🛡️ حماية الصلاحيات
    if (existingOrder.restaurantId !== adminRestaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    if (adminBranchId && existingOrder.branchId !== adminBranchId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    // 🛡️ حماية مالية: منع تكرار العملية لو الطلب متسلم أو ملغي مسبقاً
    if (existingOrder.status === "delivered" && status === "delivered") {
        throw new BadRequest_1.BadRequest("Order is already delivered and settled");
    }
    if ((existingOrder.status === "cancelled" || existingOrder.status === "rejected") && (status === "cancelled" || status === "rejected")) {
        throw new BadRequest_1.BadRequest("Order is already cancelled/rejected");
    }
    // Transaction لتحديث الحالة وتنفيذ العمليات المالية
    await connection_1.db.transaction(async (tx) => {
        // 1. تحديث الحالة
        await tx.update(schema_1.orders)
            .set({
            status,
            cancelReason: (status === "rejected" || status === "cancelled") ? cancelReason : null,
            updatedAt: new Date()
        })
            .where((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId));
        // جلب وسيلة الدفع لاستخدامها في العمليات المالية
        const [paymentMethod] = await tx.select().from(schema_1.paymentMethods)
            .where((0, drizzle_orm_1.eq)(schema_1.paymentMethods.id, existingOrder.paymentMethodId)).limit(1);
        // ==========================================
        // 💰 2. الـ Refund (ترجيع الفلوس للعميل) لو الأوردر اتلغى
        // ==========================================
        if (status === "rejected" || status === "cancelled") {
            if (paymentMethod && paymentMethod.type === "wallet") {
                const [userWallet] = await tx.select().from(schema_1.userWallets)
                    .where((0, drizzle_orm_1.eq)(schema_1.userWallets.userId, existingOrder.userId)).limit(1);
                if (userWallet) {
                    const balanceBefore = parseFloat(userWallet.balance);
                    const amountToRefund = parseFloat(existingOrder.totalAmount);
                    const newBalance = balanceBefore + amountToRefund;
                    // إرجاع الفلوس
                    await tx.update(schema_1.userWallets)
                        .set({ balance: newBalance.toString(), updatedAt: new Date() })
                        .where((0, drizzle_orm_1.eq)(schema_1.userWallets.id, userWallet.id));
                    // تسجيل الحركة كـ Credit
                    await tx.insert(schema_1.userWalletTransactions).values({
                        id: (0, uuid_1.v4)(),
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
            const totalAmount = parseFloat(existingOrder.totalAmount);
            const appCommission = parseFloat(existingOrder.appCommission);
            const netRestaurantEarning = totalAmount - appCommission; // الصافي للمطعم
            // جلب محفظة المطعم (أو إنشائها لو مش موجودة)
            let [restWallet] = await tx.select().from(schema_1.restaurantWallets).where((0, drizzle_orm_1.eq)(schema_1.restaurantWallets.restaurantId, restaurantId)).limit(1);
            if (!restWallet) {
                await tx.insert(schema_1.restaurantWallets).values({ id: (0, uuid_1.v4)(), restaurantId });
                [restWallet] = await tx.select().from(schema_1.restaurantWallets).where((0, drizzle_orm_1.eq)(schema_1.restaurantWallets.restaurantId, restaurantId)).limit(1);
            }
            const currentBalance = parseFloat(restWallet.balance);
            const currentCollectedCash = parseFloat(restWallet.collectedCash);
            const currentTotalEarning = parseFloat(restWallet.totalEarning);
            let newBalance = currentBalance;
            let newCollectedCash = currentCollectedCash;
            // توجيه الأموال بناءً على طريقة الدفع
            if (paymentMethod && paymentMethod.type === "cash") {
                newCollectedCash = currentCollectedCash + totalAmount; // كاش في إيد المطعم
            }
            else {
                newBalance = currentBalance + netRestaurantEarning; // أونلاين، نزود رصيد المطعم
            }
            // تحديث محفظة المطعم
            await tx.update(schema_1.restaurantWallets)
                .set({
                balance: newBalance.toString(),
                collectedCash: newCollectedCash.toString(),
                totalEarning: (currentTotalEarning + netRestaurantEarning).toString(),
                updatedAt: new Date()
            })
                .where((0, drizzle_orm_1.eq)(schema_1.restaurantWallets.restaurantId, restaurantId));
            // تسجيل ترانزكشن المطعم
            await tx.insert(schema_1.restaurantWalletTransactions).values({
                id: (0, uuid_1.v4)(),
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
    return (0, response_1.SuccessResponse)(res, { message: `Order status successfully updated to ${status} and financials settled` });
};
exports.updateOrderStatus = updateOrderStatus;
