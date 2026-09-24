"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectDeliveryCash = exports.getDeliveryCashOrders = exports.getDeliveryOrders = exports.getDeliveryMenWithOrders = exports.assignOrdersToDeliveryMan = exports.getPendingOrders = exports.deleteDeliveryMan = exports.updateDeliveryMan = exports.getDeliveryManById = exports.getDeliveryMen = exports.createDeliveryMan = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const NotFound_1 = require("../../Errors/NotFound");
const uuid_1 = require("uuid");
const bcrypt_1 = __importDefault(require("bcrypt"));
const createDeliveryMan = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing");
    const { branchId, name, phone, email, password, image, isActive } = req.body;
    if (!name || !phone) {
        throw new BadRequest_1.BadRequest("Missing required fields (name, phone)");
    }
    const id = (0, uuid_1.v4)();
    let hashedPassword = null;
    if (password) {
        hashedPassword = await bcrypt_1.default.hash(password, 10);
    }
    await connection_1.db.insert(schema_1.deliveryMen).values({
        id,
        restaurantId,
        branchId: branchId || null,
        name,
        phone,
        email: email || null,
        password: hashedPassword,
        image: image || null,
        isActive: isActive ?? true,
    });
    return (0, response_1.SuccessResponse)(res, { message: "Delivery man created successfully", data: { id } }, 201);
};
exports.createDeliveryMan = createDeliveryMan;
const getDeliveryMen = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing");
    const { branchId } = req.query;
    let condition = (0, drizzle_orm_1.eq)(schema_1.deliveryMen.restaurantId, restaurantId);
    if (branchId) {
        condition = (0, drizzle_orm_1.and)(condition, (0, drizzle_orm_1.eq)(schema_1.deliveryMen.branchId, branchId));
    }
    const allDeliveryMen = await connection_1.db.select({
        id: schema_1.deliveryMen.id,
        restaurantId: schema_1.deliveryMen.restaurantId,
        branchId: schema_1.deliveryMen.branchId,
        name: schema_1.deliveryMen.name,
        phone: schema_1.deliveryMen.phone,
        email: schema_1.deliveryMen.email,
        image: schema_1.deliveryMen.image,
        isActive: schema_1.deliveryMen.isActive,
        createdAt: schema_1.deliveryMen.createdAt,
        updatedAt: schema_1.deliveryMen.updatedAt,
    })
        .from(schema_1.deliveryMen)
        .where(condition);
    return (0, response_1.SuccessResponse)(res, { message: "Get delivery men success", data: allDeliveryMen });
};
exports.getDeliveryMen = getDeliveryMen;
const getDeliveryManById = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing");
    const deliveryMan = await connection_1.db.select({
        id: schema_1.deliveryMen.id,
        restaurantId: schema_1.deliveryMen.restaurantId,
        branchId: schema_1.deliveryMen.branchId,
        name: schema_1.deliveryMen.name,
        phone: schema_1.deliveryMen.phone,
        email: schema_1.deliveryMen.email,
        image: schema_1.deliveryMen.image,
        isActive: schema_1.deliveryMen.isActive,
        createdAt: schema_1.deliveryMen.createdAt,
        updatedAt: schema_1.deliveryMen.updatedAt,
    })
        .from(schema_1.deliveryMen)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.deliveryMen.id, id), (0, drizzle_orm_1.eq)(schema_1.deliveryMen.restaurantId, restaurantId)))
        .limit(1);
    if (!deliveryMan[0])
        throw new NotFound_1.NotFound("Delivery man not found or does not belong to your restaurant");
    return (0, response_1.SuccessResponse)(res, { message: "Get delivery man by id success", data: deliveryMan[0] });
};
exports.getDeliveryManById = getDeliveryManById;
const updateDeliveryMan = async (req, res) => {
    const { id } = req.params;
    const { branchId, name, phone, email, password, image, isActive } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing");
    const existing = await connection_1.db
        .select()
        .from(schema_1.deliveryMen)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.deliveryMen.id, id), (0, drizzle_orm_1.eq)(schema_1.deliveryMen.restaurantId, restaurantId)))
        .limit(1);
    if (!existing[0])
        throw new NotFound_1.NotFound("Delivery man not found or you don't have permission to edit it");
    const updateData = {};
    if (branchId !== undefined)
        updateData.branchId = branchId || null;
    if (name)
        updateData.name = name;
    if (phone)
        updateData.phone = phone;
    if (email !== undefined)
        updateData.email = email || null;
    if (image !== undefined)
        updateData.image = image || null;
    if (password) {
        updateData.password = await bcrypt_1.default.hash(password, 10);
    }
    if (isActive !== undefined)
        updateData.isActive = isActive;
    await connection_1.db
        .update(schema_1.deliveryMen)
        .set(updateData)
        .where((0, drizzle_orm_1.eq)(schema_1.deliveryMen.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Delivery man updated successfully" });
};
exports.updateDeliveryMan = updateDeliveryMan;
const deleteDeliveryMan = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing");
    const existing = await connection_1.db
        .select()
        .from(schema_1.deliveryMen)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.deliveryMen.id, id), (0, drizzle_orm_1.eq)(schema_1.deliveryMen.restaurantId, restaurantId)))
        .limit(1);
    if (!existing[0])
        throw new NotFound_1.NotFound("Delivery man not found or you don't have permission to delete it");
    await connection_1.db.delete(schema_1.deliveryMen).where((0, drizzle_orm_1.eq)(schema_1.deliveryMen.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Delivery man deleted successfully" });
};
exports.deleteDeliveryMan = deleteDeliveryMan;
// ==========================================
// الطلبات القابلة للإسناد (pending / accepted / preparing)
// ==========================================
/**
 * GET /delivery-men/pending-orders
 * يجلب كل الطلبات التي يمكن إسنادها لعامل توصيل
 * (حالتها: pending, accepted, preparing)
 */
const getPendingOrders = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing");
    const { branchId } = req.query;
    const assignableStatuses = ["pending", "accepted", "preparing"];
    let conditions = (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.orders.status, [...assignableStatuses]));
    if (branchId) {
        conditions = (0, drizzle_orm_1.and)(conditions, (0, drizzle_orm_1.eq)(schema_1.orders.branchId, branchId));
    }
    const pendingOrders = await connection_1.db
        .select({
        id: schema_1.orders.id,
        orderNumber: schema_1.orders.orderNumber,
        dailyOrderNumber: schema_1.orders.dailyOrderNumber,
        status: schema_1.orders.status,
        orderType: schema_1.orders.orderType,
        totalAmount: schema_1.orders.totalAmount,
        subtotal: schema_1.orders.subtotal,
        deliveryFee: schema_1.orders.deliveryFee,
        paymentMethod: schema_1.orders.paymentMethod,
        note: schema_1.orders.note,
        shippingAddress: schema_1.orders.shippingAddress,
        branchSnapshot: schema_1.orders.branchSnapshot,
        deliveryManId: schema_1.orders.deliveryManId,
        createdAt: schema_1.orders.createdAt,
        // بيانات العميل
        customerId: schema_1.users.id,
        customerName: schema_1.users.name,
        customerPhone: schema_1.users.phone,
        customerEmail: schema_1.users.email,
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.orders.userId, schema_1.users.id))
        .where(conditions)
        .orderBy(schema_1.orders.createdAt);
    return (0, response_1.SuccessResponse)(res, {
        message: "Assignable orders fetched successfully",
        total: pendingOrders.length,
        data: pendingOrders,
    });
};
exports.getPendingOrders = getPendingOrders;
// ==========================================
// إسناد طلبات لعامل توصيل
// ==========================================
/**
 * POST /delivery-men/assign-orders
 * body: { deliveryManId: string, orderIds: string[] }
 * يُسند مصفوفة من الطلبات لعامل توصيل محدد
 */
const assignOrdersToDeliveryMan = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing");
    const { deliveryManId, orderIds } = req.body;
    // 1. التحقق من وجود عامل التوصيل وانتمائه للمطعم
    const [existingDeliveryMan] = await connection_1.db
        .select({ id: schema_1.deliveryMen.id, name: schema_1.deliveryMen.name })
        .from(schema_1.deliveryMen)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.deliveryMen.id, deliveryManId), (0, drizzle_orm_1.eq)(schema_1.deliveryMen.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.deliveryMen.isDeleted, false)))
        .limit(1);
    if (!existingDeliveryMan) {
        throw new NotFound_1.NotFound("Delivery man not found or does not belong to your restaurant");
    }
    // 2. التحقق من أن كل الطلبات موجودة وقابلة للإسناد (pending/accepted/preparing)
    const assignableStatuses = ["pending", "accepted", "preparing"];
    const eligibleOrders = await connection_1.db
        .select({ id: schema_1.orders.id, orderNumber: schema_1.orders.orderNumber, status: schema_1.orders.status })
        .from(schema_1.orders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.orders.id, orderIds), (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.orders.status, [...assignableStatuses])));
    if (eligibleOrders.length !== orderIds.length) {
        const foundIds = new Set(eligibleOrders.map(o => o.id));
        const invalidIds = orderIds.filter(id => !foundIds.has(id));
        throw new BadRequest_1.BadRequest(`The following order IDs are invalid or not in an assignable status (pending/accepted/preparing): ${invalidIds.join(", ")}`);
    }
    // 3. تحديث الطلبات بـ deliveryManId
    await connection_1.db
        .update(schema_1.orders)
        .set({ deliveryManId })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.orders.id, orderIds), (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: `Successfully assigned ${eligibleOrders.length} order(s) to ${existingDeliveryMan.name}`,
        data: {
            deliveryManId,
            deliveryManName: existingDeliveryMan.name,
            assignedOrdersCount: eligibleOrders.length,
            assignedOrders: eligibleOrders,
        },
    });
};
exports.assignOrdersToDeliveryMan = assignOrdersToDeliveryMan;
// ==========================================
// عمال التوصيل مع طلباتهم المُسندة
// ==========================================
/**
 * GET /delivery-men/assigned-orders
 * يجلب كل عمال التوصيل مع الطلبات المسندة لكل منهم
 * + إجمالي عدد الطلبات + إجمالي المبلغ لكل عامل
 */
const getDeliveryMenWithOrders = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing");
    const { branchId } = req.query;
    // 1. جلب كل عمال التوصيل
    let deliveryMenCondition = (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.deliveryMen.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.deliveryMen.isDeleted, false));
    if (branchId) {
        deliveryMenCondition = (0, drizzle_orm_1.and)(deliveryMenCondition, (0, drizzle_orm_1.eq)(schema_1.deliveryMen.branchId, branchId));
    }
    const allDeliveryMen = await connection_1.db
        .select({
        id: schema_1.deliveryMen.id,
        name: schema_1.deliveryMen.name,
        phone: schema_1.deliveryMen.phone,
        email: schema_1.deliveryMen.email,
        image: schema_1.deliveryMen.image,
        branchId: schema_1.deliveryMen.branchId,
        isActive: schema_1.deliveryMen.isActive,
    })
        .from(schema_1.deliveryMen)
        .where(deliveryMenCondition);
    if (allDeliveryMen.length === 0) {
        return (0, response_1.SuccessResponse)(res, {
            message: "No delivery men found",
            total: 0,
            data: [],
        });
    }
    // 2. جلب الطلبات المُسندة لهؤلاء العمال (بحالات النشطة فقط)
    const deliveryMenIds = allDeliveryMen.map(dm => dm.id);
    const activeStatuses = ["pending", "accepted", "preparing", "out_for_delivery"];
    const assignedOrders = await connection_1.db
        .select({
        id: schema_1.orders.id,
        orderNumber: schema_1.orders.orderNumber,
        dailyOrderNumber: schema_1.orders.dailyOrderNumber,
        status: schema_1.orders.status,
        orderType: schema_1.orders.orderType,
        totalAmount: schema_1.orders.totalAmount,
        subtotal: schema_1.orders.subtotal,
        deliveryFee: schema_1.orders.deliveryFee,
        paymentMethod: schema_1.orders.paymentMethod,
        note: schema_1.orders.note,
        shippingAddress: schema_1.orders.shippingAddress,
        deliveryManId: schema_1.orders.deliveryManId,
        createdAt: schema_1.orders.createdAt,
        // بيانات العميل
        customerId: schema_1.users.id,
        customerName: schema_1.users.name,
        customerPhone: schema_1.users.phone,
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.orders.userId, schema_1.users.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.orders.deliveryManId, deliveryMenIds), (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.orders.status, [...activeStatuses])))
        .orderBy(schema_1.orders.createdAt);
    // 3. تجميع الطلبات حسب deliveryManId
    const ordersMap = new Map();
    for (const order of assignedOrders) {
        const dmId = order.deliveryManId;
        if (!ordersMap.has(dmId))
            ordersMap.set(dmId, []);
        ordersMap.get(dmId).push(order);
    }
    // 4. تجميع النتيجة النهائية
    const result = allDeliveryMen.map(dm => {
        const dmOrders = ordersMap.get(dm.id) ?? [];
        const totalAmount = dmOrders.reduce((sum, o) => sum + parseFloat(o.totalAmount ?? "0"), 0);
        return {
            ...dm,
            totalOrders: dmOrders.length,
            totalAmount: totalAmount.toFixed(2),
            orders: dmOrders,
        };
    });
    return (0, response_1.SuccessResponse)(res, {
        message: "Delivery men with assigned orders fetched successfully",
        total: result.length,
        data: result,
    });
};
exports.getDeliveryMenWithOrders = getDeliveryMenWithOrders;
// ==========================================
// طلبات التوصيل (out_for_delivery / delivered) مع الحسابات والكاش
// ==========================================
/**
 * GET /delivery-men/delivery-orders
 * query params:
 * - deliveryManId: string (UUID or "all")
 * - status: "out_for_delivery" | "delivered" | "all"
 * - branchId: string (UUID)
 * - startDate: string (ISO)
 * - endDate: string (ISO)
 *
 * يجلب الطلبات بحالة out_for_delivery أو delivered
 * مع إمكانية الفلترة بمندوب توصيل محدد أو للكل
 * ويحسب:
 * - إجمالي عدد الطلبات (totalOrders)
 * - إجمالي الطلبات المستلمة (totalDeliveredOrders)
 * - إجمالي المبلغ المحصل (totalDeliveredAmount)
 * - الكاش في يد المندوب لتسليمه للإدارة (cashOnHand)
 */
const getDeliveryOrders = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing");
    const { deliveryManId, status, branchId, startDate, endDate } = req.query;
    let targetStatuses = ["out_for_delivery", "delivered"];
    if (status === "out_for_delivery" || status === "delivered") {
        targetStatuses = [status];
    }
    const conditions = [
        (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId),
        (0, drizzle_orm_1.inArray)(schema_1.orders.status, targetStatuses),
    ];
    if (branchId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.branchId, branchId));
    }
    if (startDate) {
        conditions.push((0, drizzle_orm_1.gte)(schema_1.orders.createdAt, new Date(startDate)));
    }
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        conditions.push((0, drizzle_orm_1.lte)(schema_1.orders.createdAt, end));
    }
    let targetDeliveryMan = null;
    if (deliveryManId && deliveryManId !== "all") {
        const [dm] = await connection_1.db
            .select({
            id: schema_1.deliveryMen.id,
            name: schema_1.deliveryMen.name,
            phone: schema_1.deliveryMen.phone,
            email: schema_1.deliveryMen.email,
            image: schema_1.deliveryMen.image,
            branchId: schema_1.deliveryMen.branchId,
            isActive: schema_1.deliveryMen.isActive,
        })
            .from(schema_1.deliveryMen)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.deliveryMen.id, deliveryManId), (0, drizzle_orm_1.eq)(schema_1.deliveryMen.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.deliveryMen.isDeleted, false)))
            .limit(1);
        if (!dm) {
            throw new NotFound_1.NotFound("Delivery man not found or does not belong to your restaurant");
        }
        targetDeliveryMan = dm;
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.deliveryManId, deliveryManId));
    }
    const rawOrders = await connection_1.db
        .select({
        id: schema_1.orders.id,
        orderNumber: schema_1.orders.orderNumber,
        dailyOrderNumber: schema_1.orders.dailyOrderNumber,
        status: schema_1.orders.status,
        orderType: schema_1.orders.orderType,
        totalAmount: schema_1.orders.totalAmount,
        subtotal: schema_1.orders.subtotal,
        deliveryFee: schema_1.orders.deliveryFee,
        paymentMethod: schema_1.orders.paymentMethod,
        paymentMethodName: schema_1.paymentMethods.name,
        paymentMethodNameAr: schema_1.paymentMethods.nameAr,
        note: schema_1.orders.note,
        shippingAddress: schema_1.orders.shippingAddress,
        deliveryManId: schema_1.orders.deliveryManId,
        deliveryManName: schema_1.deliveryMen.name,
        deliveryManPhone: schema_1.deliveryMen.phone,
        isCashCollected: schema_1.orders.isCashCollected,
        cashCollectedAt: schema_1.orders.cashCollectedAt,
        cashCollectedBy: schema_1.orders.cashCollectedBy,
        customerId: schema_1.users.id,
        customerName: schema_1.users.name,
        customerPhone: schema_1.users.phone,
        createdAt: schema_1.orders.createdAt,
        updatedAt: schema_1.orders.updatedAt,
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.deliveryMen, (0, drizzle_orm_1.eq)(schema_1.orders.deliveryManId, schema_1.deliveryMen.id))
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.orders.userId, schema_1.users.id))
        .leftJoin(schema_1.paymentMethods, (0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, schema_1.paymentMethods.id))
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.orders.createdAt));
    const checkIsCash = (name, nameAr, raw) => {
        const n = (name || "").toLowerCase();
        const nar = (nameAr || "");
        const r = (raw || "").toLowerCase();
        return (n.includes("cash") ||
            nar.includes("استلام") ||
            nar.includes("كاش") ||
            r.includes("cash") ||
            r.includes("استلام"));
    };
    let totalOrders = rawOrders.length;
    let totalDeliveredOrders = 0;
    let totalOutForDeliveryOrders = 0;
    let totalDeliveredAmount = 0;
    let totalDeliveredCash = 0;
    let cashOnHand = 0; // 👈 الفلوس الكاش التي استلمتها الإدارة وتوردت للمطعم (isCashCollected === true)
    let cashWithDeliveryMan = 0; // 👈 الفلوس الكاش التي ما زالت مع المندوب ومطلوب توريدها (isCashCollected === false)
    let digitalCollectedAmount = 0;
    const formattedOrders = rawOrders.map(order => {
        const isCash = checkIsCash(order.paymentMethodName, order.paymentMethodNameAr, order.paymentMethod);
        const amount = parseFloat(order.totalAmount || "0");
        const isCashCollected = Boolean(order.isCashCollected);
        if (order.status === "delivered") {
            totalDeliveredOrders++;
            totalDeliveredAmount += amount;
            if (isCash) {
                totalDeliveredCash += amount;
                if (isCashCollected) {
                    cashOnHand += amount; // 👈 اتسلمت للمطعم خلاص
                }
                else {
                    cashWithDeliveryMan += amount; // 👈 لسه مع الديلفري
                }
            }
            else {
                digitalCollectedAmount += amount;
            }
        }
        else if (order.status === "out_for_delivery") {
            totalOutForDeliveryOrders++;
        }
        return {
            ...order,
            isCash,
            isCashCollected,
            paymentMethodDisplay: {
                id: order.paymentMethod,
                name: order.paymentMethodName || (isCash ? "Cash on Delivery" : order.paymentMethod || "Unknown"),
                nameAr: order.paymentMethodNameAr || (isCash ? "الدفع عند الاستلام" : order.paymentMethod || "غير معروف"),
            },
        };
    });
    // تجميع حسب عمال التوصيل في حال كان الاستعلام للكل
    if (!targetDeliveryMan) {
        const deliveryMenMap = new Map();
        for (const order of formattedOrders) {
            const dmId = order.deliveryManId || "unassigned";
            const dmName = order.deliveryManName || "Unassigned";
            const dmPhone = order.deliveryManPhone || null;
            if (!deliveryMenMap.has(dmId)) {
                deliveryMenMap.set(dmId, {
                    deliveryManId: dmId,
                    deliveryManName: dmName,
                    deliveryManPhone: dmPhone,
                    totalOrders: 0,
                    deliveredOrdersCount: 0,
                    outForDeliveryOrdersCount: 0,
                    totalDeliveredAmount: 0,
                    totalDeliveredCash: 0,
                    cashOnHand: 0,
                    cashWithDeliveryMan: 0,
                    digitalCollectedAmount: 0,
                    orders: [],
                });
            }
            const group = deliveryMenMap.get(dmId);
            group.totalOrders++;
            group.orders.push(order);
            const amount = parseFloat(order.totalAmount || "0");
            if (order.status === "delivered") {
                group.deliveredOrdersCount++;
                group.totalDeliveredAmount += amount;
                if (order.isCash) {
                    group.totalDeliveredCash += amount;
                    if (order.isCashCollected) {
                        group.cashOnHand += amount;
                    }
                    else {
                        group.cashWithDeliveryMan += amount;
                    }
                }
                else {
                    group.digitalCollectedAmount += amount;
                }
            }
            else if (order.status === "out_for_delivery") {
                group.outForDeliveryOrdersCount++;
            }
        }
        const deliveryMenBreakdown = Array.from(deliveryMenMap.values()).map(dm => ({
            ...dm,
            totalDeliveredAmount: dm.totalDeliveredAmount.toFixed(2),
            totalDeliveredCash: dm.totalDeliveredCash.toFixed(2),
            cashOnHand: dm.cashOnHand.toFixed(2),
            cashWithDeliveryMan: dm.cashWithDeliveryMan.toFixed(2),
            digitalCollectedAmount: dm.digitalCollectedAmount.toFixed(2),
        }));
        return (0, response_1.SuccessResponse)(res, {
            message: "Delivery orders fetched successfully",
            summary: {
                totalOrders,
                totalDeliveredOrders,
                totalOutForDeliveryOrders,
                totalDeliveredAmount: totalDeliveredAmount.toFixed(2),
                totalDeliveredCash: totalDeliveredCash.toFixed(2),
                cashOnHand: cashOnHand.toFixed(2), // 👈 الفلوس الكاش اللي اتسلمت للمطعم خلاص
                cashWithDeliveryMan: cashWithDeliveryMan.toFixed(2), // 👈 الفلوس الكاش اللي لسه مع الديلفري
                digitalCollectedAmount: digitalCollectedAmount.toFixed(2),
            },
            deliveryMen: deliveryMenBreakdown,
            orders: formattedOrders,
        });
    }
    return (0, response_1.SuccessResponse)(res, {
        message: "Delivery orders for delivery man fetched successfully",
        deliveryMan: targetDeliveryMan,
        summary: {
            totalOrders,
            totalDeliveredOrders,
            totalOutForDeliveryOrders,
            totalDeliveredAmount: totalDeliveredAmount.toFixed(2),
            totalDeliveredCash: totalDeliveredCash.toFixed(2),
            cashOnHand: cashOnHand.toFixed(2), // 👈 الفلوس الكاش اللي اتسلمت للمطعم خلاص
            cashWithDeliveryMan: cashWithDeliveryMan.toFixed(2), // 👈 الفلوس الكاش اللي لسه مع الديلفري
            digitalCollectedAmount: digitalCollectedAmount.toFixed(2),
        },
        orders: formattedOrders,
    });
};
exports.getDeliveryOrders = getDeliveryOrders;
// ==========================================
// استعراض طلبات الكاش للتوريد (GET /collect-cash)
// ==========================================
/**
 * GET /delivery-men/collect-cash
 * query params:
 * - deliveryManId: string (UUID or "all")
 * - isCashCollected: "true" | "false" | "all"
 * - branchId: string (UUID)
 * - startDate: string (ISO)
 * - endDate: string (ISO)
 *
 * يستعرض جميع الطلبات الكاش المسلمة لمندوب التوصيل
 * مع إمكانية الفلترة بحالة التوريد (تم التوريد / لم يتم التوريد بعد)
 * ويحسب:
 * - cashWithDeliveryMan: المبلغ المتبقي مع المندوب ومطلوب توريده
 * - cashOnHand: المبلغ المحصل والمورد للمطعم بالفعل
 * - totalDeliveredCash: إجمالي الكاش لجميع الطلبات المسلمة
 */
const getDeliveryCashOrders = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing");
    const { deliveryManId, isCashCollected, branchId, startDate, endDate } = req.query;
    const conditions = [
        (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId),
        (0, drizzle_orm_1.eq)(schema_1.orders.status, "delivered"), // الكاش يحصل فقط عند تسليم الأوردر
    ];
    if (isCashCollected === "true") {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.isCashCollected, true));
    }
    else if (isCashCollected === "false") {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.isCashCollected, false));
    }
    if (branchId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.branchId, branchId));
    }
    if (startDate) {
        conditions.push((0, drizzle_orm_1.gte)(schema_1.orders.createdAt, new Date(startDate)));
    }
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        conditions.push((0, drizzle_orm_1.lte)(schema_1.orders.createdAt, end));
    }
    let targetDeliveryMan = null;
    if (deliveryManId && deliveryManId !== "all") {
        const [dm] = await connection_1.db
            .select({
            id: schema_1.deliveryMen.id,
            name: schema_1.deliveryMen.name,
            phone: schema_1.deliveryMen.phone,
            email: schema_1.deliveryMen.email,
            image: schema_1.deliveryMen.image,
            branchId: schema_1.deliveryMen.branchId,
            isActive: schema_1.deliveryMen.isActive,
        })
            .from(schema_1.deliveryMen)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.deliveryMen.id, deliveryManId), (0, drizzle_orm_1.eq)(schema_1.deliveryMen.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.deliveryMen.isDeleted, false)))
            .limit(1);
        if (!dm) {
            throw new NotFound_1.NotFound("Delivery man not found or does not belong to your restaurant");
        }
        targetDeliveryMan = dm;
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.deliveryManId, deliveryManId));
    }
    const rawOrders = await connection_1.db
        .select({
        id: schema_1.orders.id,
        orderNumber: schema_1.orders.orderNumber,
        dailyOrderNumber: schema_1.orders.dailyOrderNumber,
        status: schema_1.orders.status,
        orderType: schema_1.orders.orderType,
        totalAmount: schema_1.orders.totalAmount,
        subtotal: schema_1.orders.subtotal,
        deliveryFee: schema_1.orders.deliveryFee,
        paymentMethod: schema_1.orders.paymentMethod,
        paymentMethodName: schema_1.paymentMethods.name,
        paymentMethodNameAr: schema_1.paymentMethods.nameAr,
        note: schema_1.orders.note,
        shippingAddress: schema_1.orders.shippingAddress,
        deliveryManId: schema_1.orders.deliveryManId,
        deliveryManName: schema_1.deliveryMen.name,
        deliveryManPhone: schema_1.deliveryMen.phone,
        isCashCollected: schema_1.orders.isCashCollected,
        cashCollectedAt: schema_1.orders.cashCollectedAt,
        cashCollectedBy: schema_1.orders.cashCollectedBy,
        customerId: schema_1.users.id,
        customerName: schema_1.users.name,
        customerPhone: schema_1.users.phone,
        createdAt: schema_1.orders.createdAt,
        updatedAt: schema_1.orders.updatedAt,
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.deliveryMen, (0, drizzle_orm_1.eq)(schema_1.orders.deliveryManId, schema_1.deliveryMen.id))
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.orders.userId, schema_1.users.id))
        .leftJoin(schema_1.paymentMethods, (0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, schema_1.paymentMethods.id))
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.orders.createdAt));
    const checkIsCash = (name, nameAr, raw) => {
        const n = (name || "").toLowerCase();
        const nar = (nameAr || "");
        const r = (raw || "").toLowerCase();
        return (n.includes("cash") ||
            nar.includes("استلام") ||
            nar.includes("كاش") ||
            r.includes("cash") ||
            r.includes("استلام"));
    };
    // تصفية الطلبات الكاش فقط
    const cashOrders = rawOrders.filter(o => checkIsCash(o.paymentMethodName, o.paymentMethodNameAr, o.paymentMethod));
    let cashWithDeliveryMan = 0; // لسه مع الديلفري
    let cashOnHand = 0; // اتسلمت للمطعم خلاص
    let totalDeliveredCash = 0;
    let pendingCount = 0;
    let collectedCount = 0;
    const formattedOrders = cashOrders.map(order => {
        const amount = parseFloat(order.totalAmount || "0");
        const isCollected = Boolean(order.isCashCollected);
        totalDeliveredCash += amount;
        if (isCollected) {
            cashOnHand += amount;
            collectedCount++;
        }
        else {
            cashWithDeliveryMan += amount;
            pendingCount++;
        }
        return {
            ...order,
            isCash: true,
            isCashCollected: isCollected,
            collectionStatus: isCollected ? "collected" : "pending_collection",
            paymentMethodDisplay: {
                id: order.paymentMethod,
                name: order.paymentMethodName || "Cash on Delivery",
                nameAr: order.paymentMethodNameAr || "الدفع عند الاستلام",
            },
        };
    });
    const summary = {
        totalCashOrders: formattedOrders.length,
        pendingCollectionOrdersCount: pendingCount,
        collectedOrdersCount: collectedCount,
        cashWithDeliveryMan: cashWithDeliveryMan.toFixed(2), // 👈 الفلوس الكاش اللي لسه مع الديلفري ومطلوب يسلمها
        cashOnHand: cashOnHand.toFixed(2), // 👈 الفلوس الكاش اللي اتسلمت للمطعم بالفعل
        totalDeliveredCash: totalDeliveredCash.toFixed(2), // 👈 إجمالي الكاش لجميع الطلبات المسلمة
    };
    return (0, response_1.SuccessResponse)(res, {
        message: targetDeliveryMan
            ? `Cash delivery orders for ${targetDeliveryMan.name} fetched successfully`
            : "Cash delivery orders fetched successfully",
        deliveryMan: targetDeliveryMan,
        summary,
        orders: formattedOrders,
    });
};
exports.getDeliveryCashOrders = getDeliveryCashOrders;
// ==========================================
// توريد كاش من مندوب التوصيل للإدارة (POST /collect-cash)
// ==========================================
/**
 * POST /delivery-men/collect-cash
 * body: {
 *   deliveryManId: string (UUID),
 *   orderIds: string[] (array of UUIDs),
 *   note?: string
 * }
 *
 * توريد كاش الطلبات من مندوب التوصيل إلى إدارة المطعم
 * يقوم بالتحقق من:
 * 1. وجود المندوب وانتمائه للمطعم
 * 2. أن جميع الطلبات مسلمة (delivered)
 * 3. أن الدفع كاش
 * 4. أن الطلبات لم يتم تحصيلها مسبقاً
 * ثم يعلمها بأنها تم توريدها (isCashCollected = true)
 * ويحسب المبلغ المحصل في المعاملة والمتبقي مع المندوب
 */
const collectDeliveryCash = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const adminId = req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing");
    const { deliveryManId, orderIds, note } = req.body;
    // 1. التحقق من وجود عامل التوصيل وانتمائه للمطعم
    const [existingDeliveryMan] = await connection_1.db
        .select({ id: schema_1.deliveryMen.id, name: schema_1.deliveryMen.name, phone: schema_1.deliveryMen.phone })
        .from(schema_1.deliveryMen)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.deliveryMen.id, deliveryManId), (0, drizzle_orm_1.eq)(schema_1.deliveryMen.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.deliveryMen.isDeleted, false)))
        .limit(1);
    if (!existingDeliveryMan) {
        throw new NotFound_1.NotFound("Delivery man not found or does not belong to your restaurant");
    }
    // 2. جلب الطلبات والتحقق منها
    const eligibleOrders = await connection_1.db
        .select({
        id: schema_1.orders.id,
        orderNumber: schema_1.orders.orderNumber,
        dailyOrderNumber: schema_1.orders.dailyOrderNumber,
        status: schema_1.orders.status,
        totalAmount: schema_1.orders.totalAmount,
        paymentMethod: schema_1.orders.paymentMethod,
        paymentMethodName: schema_1.paymentMethods.name,
        paymentMethodNameAr: schema_1.paymentMethods.nameAr,
        deliveryManId: schema_1.orders.deliveryManId,
        isCashCollected: schema_1.orders.isCashCollected,
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.paymentMethods, (0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, schema_1.paymentMethods.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.orders.id, orderIds), (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId)));
    if (eligibleOrders.length !== orderIds.length) {
        const foundIds = new Set(eligibleOrders.map(o => o.id));
        const missingIds = orderIds.filter(id => !foundIds.has(id));
        throw new BadRequest_1.BadRequest(`The following order IDs were not found in your restaurant: ${missingIds.join(", ")}`);
    }
    const checkIsCash = (name, nameAr, raw) => {
        const n = (name || "").toLowerCase();
        const nar = (nameAr || "");
        const r = (raw || "").toLowerCase();
        return (n.includes("cash") ||
            nar.includes("استلام") ||
            nar.includes("كاش") ||
            r.includes("cash") ||
            r.includes("استلام"));
    };
    // 3. التحقق من الشروط لكل أوردر:
    for (const ord of eligibleOrders) {
        if (ord.deliveryManId !== deliveryManId) {
            throw new BadRequest_1.BadRequest(`Order #${ord.orderNumber} is not assigned to ${existingDeliveryMan.name}`);
        }
        if (ord.status !== "delivered") {
            throw new BadRequest_1.BadRequest(`Order #${ord.orderNumber} cannot be collected because its status is '${ord.status}' (must be 'delivered')`);
        }
        const isCash = checkIsCash(ord.paymentMethodName, ord.paymentMethodNameAr, ord.paymentMethod);
        if (!isCash) {
            throw new BadRequest_1.BadRequest(`Order #${ord.orderNumber} is not a cash order (paid digitally)`);
        }
        if (ord.isCashCollected) {
            throw new BadRequest_1.BadRequest(`Order #${ord.orderNumber} has already been marked as cash collected`);
        }
    }
    // 4. حساب المبلغ المحصل في هذه المعاملة
    const now = new Date();
    const collectedAmount = eligibleOrders.reduce((sum, o) => sum + parseFloat(o.totalAmount || "0"), 0);
    // 5. تحديث الطلبات بأنها تم توريدها للمطعم
    await connection_1.db
        .update(schema_1.orders)
        .set({
        isCashCollected: true,
        cashCollectedAt: now,
        cashCollectedBy: adminId || null,
    })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.orders.id, orderIds), (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId)));
    // 6. حساب المبلغ المتبقي كاش مع هذا المندوب (الطلبات المسلمة كاش ولم تُورّد بعد)
    const remainingOrders = await connection_1.db
        .select({
        id: schema_1.orders.id,
        totalAmount: schema_1.orders.totalAmount,
        paymentMethod: schema_1.orders.paymentMethod,
        paymentMethodName: schema_1.paymentMethods.name,
        paymentMethodNameAr: schema_1.paymentMethods.nameAr,
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.paymentMethods, (0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, schema_1.paymentMethods.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orders.deliveryManId, deliveryManId), (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.orders.status, "delivered"), (0, drizzle_orm_1.eq)(schema_1.orders.isCashCollected, false)));
    const remainingCashWithDeliveryMan = remainingOrders
        .filter(o => checkIsCash(o.paymentMethodName, o.paymentMethodNameAr, o.paymentMethod))
        .reduce((sum, o) => sum + parseFloat(o.totalAmount || "0"), 0);
    return (0, response_1.SuccessResponse)(res, {
        message: `Successfully collected cash for ${eligibleOrders.length} order(s) from ${existingDeliveryMan.name}`,
        data: {
            deliveryMan: {
                id: existingDeliveryMan.id,
                name: existingDeliveryMan.name,
                phone: existingDeliveryMan.phone,
            },
            collectionReceipt: {
                collectedOrdersCount: eligibleOrders.length,
                collectedCashAmount: collectedAmount.toFixed(2),
                collectedAt: now,
                collectedBy: adminId || null,
                note: note || null,
            },
            remainingCashWithDeliveryMan: remainingCashWithDeliveryMan.toFixed(2), // 👈 الكاش المتبقي مع المندوب بعد هذه المعاملة
            collectedOrders: eligibleOrders.map(o => ({
                id: o.id,
                orderNumber: o.orderNumber,
                amount: o.totalAmount,
            })),
        },
    }, 200);
};
exports.collectDeliveryCash = collectDeliveryCash;
