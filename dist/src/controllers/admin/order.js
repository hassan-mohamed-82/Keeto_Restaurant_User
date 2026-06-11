"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getallnumbersoforders = exports.generateOrderInvoicePDF = exports.getReasons = exports.updateOrderStatus = exports.getRestaurantOrderById = exports.getRefundOrders = exports.getRejectedOrders = exports.getCancelledOrders = exports.getDeliveredOrders = exports.getOutForDeliveryOrders = exports.getPreparingOrders = exports.getAcceptedOrders = exports.getPendingOrders = exports.getRestaurantOrders = void 0;
const pdfkit_1 = __importDefault(require("pdfkit"));
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const NotFound_1 = require("../../Errors/NotFound");
const uuid_1 = require("uuid");
const selectReasons_1 = require("../../models/schema/admin/selectReasons");
const notifications_1 = require("../../utils/notifications");
const Errors_1 = require("../../Errors");
// ==========================================
// 1. جلب كل الأوردرات الخاصة بالمطعم/الفرع
// ==========================================
const getRestaurantOrders = async (req, res) => {
    // ✅ التحقق من وجود req.user أولاً
    if (!req.user) {
        throw new Errors_1.UnauthorizedError("Not authenticated");
    }
    const adminRestaurantId = req.user.restaurantId || req.user.id;
    const adminBranchId = req.user.branchId; // لو Null يبقى ده المالك
    if (!adminRestaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID not found");
    }
    // بناء الـ Query الأساسي
    let queryConditions = (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, adminRestaurantId);
    // لو ده مدير فرع، نفلتر الأوردرات لفرعه هو بس بشكل إجباري
    if (adminBranchId) {
        queryConditions = (0, drizzle_orm_1.and)(queryConditions, (0, drizzle_orm_1.eq)(schema_1.orders.branchId, adminBranchId));
    }
    // لو ده المالك وبعت branchId في الـ Query عشان يفلتر بيه
    else if (req.query?.branchId) {
        queryConditions = (0, drizzle_orm_1.and)(queryConditions, (0, drizzle_orm_1.eq)(schema_1.orders.branchId, req.query.branchId));
    }
    const restaurantOrders = await connection_1.db.select({
        id: schema_1.orders.id,
        orderNumber: schema_1.orders.orderNumber,
        customerName: schema_1.users.name,
        customerPhone: schema_1.users.phone,
        orderType: schema_1.orders.orderType,
        totalAmount: schema_1.orders.totalAmount,
        status: schema_1.orders.status,
        note: schema_1.orders.note,
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
    // ✅ التحقق من وجود req.user أولاً
    if (!req.user) {
        throw new Errors_1.UnauthorizedError("Not authenticated");
    }
    const adminRestaurantId = req.user.restaurantId || req.user.id;
    const adminBranchId = req.user.branchId;
    if (!adminRestaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID not found");
    }
    const conditions = [
        (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, adminRestaurantId),
        (0, drizzle_orm_1.eq)(schema_1.orders.status, status)
    ];
    // لو ده مدير فرع، نفلتر إجباري لفرعه هو بس
    if (adminBranchId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.branchId, adminBranchId));
    }
    // لو ده المالك وبعت branchId يفلتر بيه
    else if (req.query?.branchId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.branchId, req.query.branchId));
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
        note: schema_1.orders.note,
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
    // 1. جلب البيانات الأساسية للأوردر
    const [orderDetail] = await connection_1.db.select({
        order: schema_1.orders,
        customer: {
            id: schema_1.users.id,
            name: schema_1.users.name,
            phone: schema_1.users.phone,
            email: schema_1.users.email,
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
    // 2. جلب أصناف الأكل (Order Items)
    const items = await connection_1.db.select({
        id: schema_1.orderItems.id,
        foodId: schema_1.orderItems.foodId,
        quantity: schema_1.orderItems.quantity,
        basePrice: schema_1.orderItems.basePrice,
        variationsPrice: schema_1.orderItems.variationsPrice,
        totalPrice: schema_1.orderItems.totalPrice,
        note: schema_1.orderItems.note,
        variations: schema_1.orderItems.variations,
        foodName: schema_1.food.name,
        foodNameAr: schema_1.food.nameAr,
        foodNameFr: schema_1.food.nameFr,
        foodImage: schema_1.food.image,
        foodDescription: schema_1.food.description,
    })
        .from(schema_1.orderItems)
        .leftJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.orderItems.foodId, schema_1.food.id))
        .where((0, drizzle_orm_1.eq)(schema_1.orderItems.orderId, id));
    // ✅ تنظيف وتعديل الـ Variations عشان ترجع JSON حقيقي بدل String
    const formattedItems = items.map(item => {
        let cleanVariations = item.variations;
        if (typeof cleanVariations === 'string') {
            try {
                cleanVariations = JSON.parse(cleanVariations);
                // معالجة الـ Double Stringify لو الفرونت إند باعتها متكررة
                if (typeof cleanVariations === 'string') {
                    cleanVariations = JSON.parse(cleanVariations);
                }
            }
            catch (error) {
                console.error("Error parsing variations for item ID:", item.id);
            }
        }
        return {
            ...item,
            variations: cleanVariations
        };
    });
    // جلب بيانات وسيلة الدفع من جدول payment_methods إذا كانت UUID، أو تعيينها بناءً على الـ Enum
    let pmDetails = null;
    const pmValue = orderDetail.order.paymentMethod;
    if (pmValue && pmValue.length === 36) {
        try {
            const [pm] = await connection_1.db.select().from(schema_1.paymentMethods).where((0, drizzle_orm_1.eq)(schema_1.paymentMethods.id, pmValue)).limit(1);
            if (pm) {
                pmDetails = {
                    id: pm.id,
                    name: pm.name,
                    nameAr: pm.nameAr || pm.name,
                    nameFr: pm.nameFr || pm.name
                };
            }
            else {
                pmDetails = pmValue;
            }
        }
        catch (error) {
            console.error("Error fetching payment method:", error);
            pmDetails = pmValue;
        }
    }
    else {
        switch (pmValue) {
            case "cash_on_delivery":
                pmDetails = { id: pmValue, name: "Cash on Delivery", nameAr: "الدفع عند الاستلام", nameFr: "Paiement à la livraison" };
                break;
            case "visa":
                pmDetails = { id: pmValue, name: "Credit Card", nameAr: "بطاقة ائتمانية", nameFr: "Carte de crédit" };
                break;
            case "wallet":
                pmDetails = { id: pmValue, name: "Wallet", nameAr: "محفظة", nameFr: "Portefeuille" };
                break;
            default:
                pmDetails = pmValue;
        }
    }
    return (0, response_1.SuccessResponse)(res, {
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
            paymentMethod: pmDetails,
            branch: orderDetail.branch,
            restaurant: orderDetail.restaurant,
            items: formattedItems // ✅ استخدام المصفوفة بعد التنظيف
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
    const currentStatus = existingOrder.status;
    // 🛡️ حماية ضد التغيير بعد الوصول لحالة نهائية
    const finalStatuses = ["delivered", "cancelled", "rejected", "refund"];
    if (finalStatuses.includes(currentStatus)) {
        throw new BadRequest_1.BadRequest(`Order is already ${currentStatus} and cannot be changed`);
    }
    // 🛡️ حماية ضد الرجوع خطوة للوراء في مسار الطلب
    const statusFlowOrder = {
        "pending": 1,
        "accepted": 2,
        "preparing": 3,
        "out_for_delivery": 4,
        "delivered": 5,
    };
    if (statusFlowOrder[currentStatus] && statusFlowOrder[status]) {
        if (statusFlowOrder[status] === statusFlowOrder[currentStatus]) {
            throw new BadRequest_1.BadRequest(`Order is already ${currentStatus}`);
        }
        if (statusFlowOrder[status] < statusFlowOrder[currentStatus]) {
            throw new BadRequest_1.BadRequest(`Cannot revert status from ${currentStatus} to ${status}`);
        }
    }
    else if (currentStatus === status) {
        throw new BadRequest_1.BadRequest(`Order is already ${currentStatus}`);
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
        // ==========================================
        // 💰 2. الـ Refund (ترجيع الفلوس للعميل) لو الأوردر اتلغى
        // ==========================================
        if (status === "rejected" || status === "cancelled") {
            // Since paymentMethod is now an enum directly on the order:
            if (existingOrder.paymentMethod === "wallet") {
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
            if (existingOrder.paymentMethod === "cash_on_delivery") {
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
    await (0, notifications_1.sendPushNotification)({
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
    return (0, response_1.SuccessResponse)(res, { message: `Order status successfully updated to ${status} and financials settled` });
};
exports.updateOrderStatus = updateOrderStatus;
const getReasons = async (req, res) => {
    const reasons = await connection_1.db
        .select()
        .from(selectReasons_1.selectReasons)
        .where((0, drizzle_orm_1.eq)(selectReasons_1.selectReasons.status, "active"));
    return (0, response_1.SuccessResponse)(res, {
        message: "Active reasons fetched successfully",
        data: reasons
    });
};
exports.getReasons = getReasons;
// ==========================================
// 5. إنشاء فاتورة (PDF) لطلب معين
// ==========================================
const generateOrderInvoicePDF = async (req, res) => {
    const { orderId } = req.params;
    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    const adminBranchId = req.user?.branchId;
    // 1. جلب البيانات الأساسية للأوردر
    const [orderDetail] = await connection_1.db.select({
        order: schema_1.orders,
        customer: {
            id: schema_1.users.id,
            name: schema_1.users.name,
            phone: schema_1.users.phone,
        },
        branch: {
            id: schema_1.branches.id,
            name: schema_1.branches.name,
        },
        restaurant: {
            id: schema_1.restaurants.id,
            name: schema_1.restaurants.name,
        },
        address: schema_1.addresses,
        zone: {
            name: schema_1.zones.name
        }
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.orders.userId, schema_1.users.id))
        .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.orders.branchId, schema_1.branches.id))
        .leftJoin(schema_1.restaurants, (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, schema_1.restaurants.id))
        .leftJoin(schema_1.addresses, (0, drizzle_orm_1.eq)(schema_1.orders.addressId, schema_1.addresses.id))
        .leftJoin(schema_1.zones, (0, drizzle_orm_1.eq)(schema_1.addresses.zoneId, schema_1.zones.id))
        .where((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId))
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
    // 2. جلب أصناف الأكل
    const items = await connection_1.db.select({
        quantity: schema_1.orderItems.quantity,
        basePrice: schema_1.orderItems.basePrice,
        totalPrice: schema_1.orderItems.totalPrice,
        foodName: schema_1.food.name,
        foodNameAr: schema_1.food.nameAr,
    })
        .from(schema_1.orderItems)
        .leftJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.orderItems.foodId, schema_1.food.id))
        .where((0, drizzle_orm_1.eq)(schema_1.orderItems.orderId, orderId));
    // 3. إنشاء الـ PDF (شكل إيصال حراري / فاتورة)
    const doc = new pdfkit_1.default({ margin: 20, size: [250, 600] }); // حجم إيصال حراري تقريبي
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
        if (orderDetail.address.floor)
            details += ` | Floor: ${orderDetail.address.floor}`;
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
        doc.text(parseFloat(item.basePrice).toFixed(2), 140, y, { width: 45, align: 'right' });
        doc.text(parseFloat(item.totalPrice).toFixed(2), 185, y, { width: 55, align: 'right' });
        doc.moveDown(0.5);
    }
    doc.moveTo(10, doc.y).lineTo(240, doc.y).stroke();
    doc.moveDown(0.5);
    // Totals
    const subtotal = parseFloat(orderDetail.order.subtotal).toFixed(2);
    const tax = "0.00"; // Assuming 0 for now as tax isn't in DB currently
    const deliveryFee = parseFloat(orderDetail.order.deliveryFee).toFixed(2);
    const total = parseFloat(orderDetail.order.totalAmount).toFixed(2);
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
exports.generateOrderInvoicePDF = generateOrderInvoicePDF;
const getallnumbersoforders = async (req, res) => {
    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    if (!adminRestaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const statusCountsResult = await connection_1.db
        .select({
        status: schema_1.orders.status,
        count: (0, drizzle_orm_1.sql) `count(${schema_1.orders.id})`,
    })
        .from(schema_1.orders)
        .where((0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, adminRestaurantId))
        .groupBy(schema_1.orders.status);
    const totalOrders = statusCountsResult.reduce((acc, curr) => acc + Number(curr.count), 0);
    // Format the status counts as an object for easier consumption
    const statusCounts = statusCountsResult.reduce((acc, curr) => {
        if (curr.status) {
            acc[curr.status] = Number(curr.count);
        }
        return acc;
    }, {});
    return (0, response_1.SuccessResponse)(res, {
        data: {
            totalOrders,
            statusCounts
        }
    });
};
exports.getallnumbersoforders = getallnumbersoforders;
