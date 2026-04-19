"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateOrderStatus = exports.getRestaurantOrderById = exports.getRestaurantOrders = void 0;
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
// 2. جلب تفاصيل أوردر معين (بالـ ID)
// ==========================================
const getRestaurantOrderById = async (req, res) => {
    const { id } = req.params;
    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    const adminBranchId = req.user?.branchId;
    // 1. جلب البيانات الأساسية للأوردر
    const [orderDetail] = await connection_1.db.select({
        order: schema_1.orders,
        customer: {
            name: schema_1.users.name,
            phone: schema_1.users.phone,
            email: schema_1.users.email,
        },
        paymentMethod: {
            name: schema_1.paymentMethods.name,
            type: schema_1.paymentMethods.type,
        }
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.orders.userId, schema_1.users.id))
        .leftJoin(schema_1.paymentMethods, (0, drizzle_orm_1.eq)(schema_1.orders.paymentMethodId, schema_1.paymentMethods.id))
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
    // 2. جلب أصناف الأكل اللي جوه الأوردر ده (Order Items)
    const items = await connection_1.db.select({
        id: schema_1.orderItems.id,
        quantity: schema_1.orderItems.quantity,
        basePrice: schema_1.orderItems.basePrice,
        variationsPrice: schema_1.orderItems.variationsPrice,
        totalPrice: schema_1.orderItems.totalPrice,
        foodName: schema_1.food.name,
        foodImage: schema_1.food.image,
    })
        .from(schema_1.orderItems)
        .leftJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.orderItems.foodId, schema_1.food.id))
        .where((0, drizzle_orm_1.eq)(schema_1.orderItems.orderId, id));
    return (0, response_1.SuccessResponse)(res, {
        message: "Get order details success",
        data: {
            ...orderDetail.order,
            customer: orderDetail.customer,
            paymentMethod: orderDetail.paymentMethod,
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
    // 🛡️ حماية
    if (existingOrder.restaurantId !== adminRestaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    if (adminBranchId && existingOrder.branchId !== adminBranchId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    // Transaction لتحديث الحالة وإرجاع فلوس المحفظة لو لزم الأمر
    await connection_1.db.transaction(async (tx) => {
        // تحديث الحالة
        await tx.update(schema_1.orders)
            .set({
            status,
            cancelReason: (status === "rejected" || status === "cancelled") ? cancelReason : null,
            updatedAt: new Date()
        })
            .where((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId));
        // الـ Refund (ترجيع الفلوس) لو الأوردر اتلغى وكان مدفوع بالمحفظة
        if (status === "rejected" || status === "cancelled") {
            const [paymentMethod] = await tx.select().from(schema_1.paymentMethods)
                .where((0, drizzle_orm_1.eq)(schema_1.paymentMethods.id, existingOrder.paymentMethodId)).limit(1);
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
    });
    return (0, response_1.SuccessResponse)(res, { message: `Order status successfully updated to ${status}` });
};
exports.updateOrderStatus = updateOrderStatus;
