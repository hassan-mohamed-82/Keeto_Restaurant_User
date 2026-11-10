"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transferOrderBranch = exports.getSelectBranches = exports.getSelectData = exports.selectDeliveryMan = exports.assignDelivery = exports.getallnumbersoforders = exports.generateOrdersReportPDF = exports.generateOrderInvoicePDF = exports.getReasons = exports.setOrderPreparingDuration = exports.updateOrderStatus = exports.getRestaurantOrderById = exports.getRefundOrders = exports.getCancelledOrders = exports.getDeliveredOrders = exports.getOutForDeliveryOrders = exports.getPreparingOrders = exports.getAcceptedOrders = exports.getPendingOrders = exports.getOrdersByStatus = exports.getRestaurantOrders = exports.buildOrderCancellationConditions = exports.buildOrderUserAndTypeConditions = exports.buildOrderDateConditions = exports.getRestaurantShiftStartTime = exports.haversineKm = exports.isPointInPolygon = exports.parseAndNormalizeCoordinates = exports.resolveZoneFromCoords = void 0;
const pdfkit_1 = __importDefault(require("pdfkit"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const mysql_core_1 = require("drizzle-orm/mysql-core");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const NotFound_1 = require("../../Errors/NotFound");
const selectReasons_1 = require("../../models/schema/admin/selectReasons");
const fixArabic_1 = require("../../utils/fixArabic");
const notifications_1 = require("../../utils/notifications");
const Errors_1 = require("../../Errors");
const zone_helper_1 = require("../../helpers/zone.helper");
Object.defineProperty(exports, "resolveZoneFromCoords", { enumerable: true, get: function () { return zone_helper_1.resolveZoneFromCoords; } });
Object.defineProperty(exports, "parseAndNormalizeCoordinates", { enumerable: true, get: function () { return zone_helper_1.parseAndNormalizeCoordinates; } });
Object.defineProperty(exports, "isPointInPolygon", { enumerable: true, get: function () { return zone_helper_1.isPointInPolygon; } });
Object.defineProperty(exports, "haversineKm", { enumerable: true, get: function () { return zone_helper_1.haversineKm; } });
const order_helper_1 = require("../../helpers/order.helper");
Object.defineProperty(exports, "getRestaurantShiftStartTime", { enumerable: true, get: function () { return order_helper_1.getRestaurantShiftStartTime; } });
Object.defineProperty(exports, "buildOrderDateConditions", { enumerable: true, get: function () { return order_helper_1.buildOrderDateConditions; } });
Object.defineProperty(exports, "buildOrderUserAndTypeConditions", { enumerable: true, get: function () { return order_helper_1.buildOrderUserAndTypeConditions; } });
Object.defineProperty(exports, "buildOrderCancellationConditions", { enumerable: true, get: function () { return order_helper_1.buildOrderCancellationConditions; } });
const orderStatusService_1 = require("../../services/orderStatusService");
const ordersReportPdfService_1 = require("../../services/ordersReportPdfService");
// ==========================================
// 3. API Endpoints
// ==========================================
const branchZones = (0, mysql_core_1.alias)(schema_1.zones, "branch_zones");
const getRestaurantOrders = async (req, res) => {
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
        // ✅ إخفاء طلبات الفيزا المعلقة أو الفاشلة — تظهر فقط لما paymentStatus = 'paid'
        (0, order_helper_1.excludeUnpaidVisaOrders)(),
    ];
    const queryBranchId = req.query?.branchId?.trim();
    const filterBranchId = adminBranchId || (queryBranchId && queryBranchId !== "null" && queryBranchId !== "undefined" ? queryBranchId : undefined);
    if (filterBranchId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.branchId, filterBranchId));
    }
    const source = (req.query?.source || req.query?.orderSource)?.trim();
    if (source && source !== "null" && source !== "undefined") {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.orderSource, source));
    }
    const zoneId = req.query?.zoneId?.trim();
    if (zoneId && zoneId !== "null" && zoneId !== "undefined") {
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.orders.zoneId, zoneId), (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.zoneId, zoneId), (0, drizzle_orm_1.eq)(schema_1.zones.id, zoneId)));
    }
    const cityId = req.query?.cityId?.trim();
    if (cityId && cityId !== "null" && cityId !== "undefined") {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.zones.cityId, cityId));
    }
    const dateConditions = await (0, order_helper_1.buildOrderDateConditions)(req, adminRestaurantId, 
    // owner & branch_manager always have filter access;
    // for subadmin/staff we check their permissions at runtime
    req.user.type === "owner"
        ? true
        : await (async () => {
            const { checkUserPermission } = await Promise.resolve().then(() => __importStar(require("../../middlewares/hasPermission")));
            return checkUserPermission(req.user.id, "order", "advanced_filter");
        })());
    conditions.push(...dateConditions);
    // ✅ فلترة وسيلة الدفع وأنواع الخصم المتعددة (Payment Method & Discount Filters)
    const discountAndPaymentConditions = (0, order_helper_1.buildOrderDiscountAndPaymentConditions)(req);
    conditions.push(...discountAndPaymentConditions);
    // ✅ فلترة نوع الطلب (delivery / takeaway / dine_in) وبيانات العميل (الاسم، الإيميل، الهاتف)
    const userAndTypeConditions = (0, order_helper_1.buildOrderUserAndTypeConditions)(req);
    conditions.push(...userAndTypeConditions);
    // ✅ فلترة الحالة (status / orderStatus)
    const statusConditions = (0, order_helper_1.buildOrderStatusConditions)(req);
    conditions.push(...statusConditions);
    // ✅ فلترة الطلبات الملغاة بحسب من قام بالإلغاء (user vs restaurant)
    const cancellationConditions = (0, order_helper_1.buildOrderCancellationConditions)(req, {
        enforceCancelledStatusIfFiltered: true,
    });
    conditions.push(...cancellationConditions);
    const rawRestaurantOrders = await connection_1.db
        .select({
        id: schema_1.orders.id,
        orderNumber: schema_1.orders.orderNumber,
        dailyOrderNumber: schema_1.orders.dailyOrderNumber,
        customerName: schema_1.users.name,
        customerPhone: schema_1.users.phone,
        alternatePhone: schema_1.users.alternatePhone,
        customerEmail: schema_1.users.email,
        isGuest: schema_1.users.isGuest,
        rating: schema_1.orders.rating,
        ratingComment: schema_1.orders.ratingComment,
        orderType: schema_1.orders.orderType,
        orderSource: schema_1.orders.orderSource,
        paymentMethod: schema_1.orders.paymentMethod,
        paymentMethodName: schema_1.paymentMethods.name,
        paymentMethodNameAr: schema_1.paymentMethods.nameAr,
        subtotal: schema_1.orders.subtotal,
        deliveryFee: schema_1.orders.deliveryFee,
        serviceFee: schema_1.orders.serviceFee,
        appCommission: schema_1.orders.appCommission,
        discountId: schema_1.orders.discountId,
        discountType: schema_1.orders.discountType,
        discountValue: schema_1.orders.discountValue,
        discountSource: schema_1.orders.discountSource,
        discountAmount: schema_1.orders.discountAmount,
        couponId: schema_1.orders.couponId,
        couponCode: schema_1.orders.couponCode,
        firstOrderDiscountId: schema_1.orders.firstOrderDiscountId,
        offerId: schema_1.orders.offerId,
        isBundle: schema_1.orders.isBundle,
        isPointsRedeemed: schema_1.orders.isPointsRedeemed,
        redeemCode: schema_1.orders.redeemCode,
        totalAmount: schema_1.orders.totalAmount,
        status: schema_1.orders.status,
        durationOrderPreparing: schema_1.orders.durationOrderPreparing,
        cancelReasonId: schema_1.orders.cancelReasonId,
        cancelReason: schema_1.orders.cancelReason,
        cancelReasonType: schema_1.orders.cancelReasonType,
        note: schema_1.orders.note,
        deliveryMan: {
            id: schema_1.deliveryMen.id,
            name: schema_1.deliveryMen.name,
            phone: schema_1.deliveryMen.phone,
        },
        branchName: schema_1.branches.name,
        zoneName: (0, drizzle_orm_1.sql) `CASE WHEN ${schema_1.orders.orderType} = 'delivery' THEN ${schema_1.zones.name} ELSE NULL END`,
        addressLat: schema_1.addresses.lat,
        addressLng: schema_1.addresses.lng,
        shippingAddress: schema_1.orders.shippingAddress,
        branchSnapshot: schema_1.orders.branchSnapshot,
        createdAt: schema_1.orders.createdAt,
        updatedAt: schema_1.orders.updatedAt,
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.orders.userId, schema_1.users.id))
        .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.orders.branchId, schema_1.branches.id))
        .leftJoin(schema_1.deliveryMen, (0, drizzle_orm_1.eq)(schema_1.orders.deliveryManId, schema_1.deliveryMen.id))
        .leftJoin(schema_1.addresses, (0, drizzle_orm_1.eq)(schema_1.orders.addressId, schema_1.addresses.id))
        .leftJoin(schema_1.restaurantZoneDeliveryFees, (0, drizzle_orm_1.eq)(schema_1.orders.zoneId, schema_1.restaurantZoneDeliveryFees.id))
        .leftJoin(schema_1.zones, (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.zoneId, schema_1.zones.id), (0, drizzle_orm_1.eq)(schema_1.orders.zoneId, schema_1.zones.id)))
        .leftJoin(schema_1.paymentMethods, (0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, schema_1.paymentMethods.id))
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.orders.createdAt));
    const restaurantOrders = await Promise.all(rawRestaurantOrders.map(async (o) => {
        let shippingAddressData = o.shippingAddress;
        if (typeof shippingAddressData === "string") {
            try {
                shippingAddressData = JSON.parse(shippingAddressData);
                if (typeof shippingAddressData === "string") {
                    shippingAddressData = JSON.parse(shippingAddressData);
                }
            }
            catch (e) {
                shippingAddressData = null;
            }
        }
        let branchSnapshotData = o.branchSnapshot;
        if (typeof branchSnapshotData === "string") {
            try {
                branchSnapshotData = JSON.parse(branchSnapshotData);
                if (typeof branchSnapshotData === "string") {
                    branchSnapshotData = JSON.parse(branchSnapshotData);
                }
            }
            catch (e) {
                branchSnapshotData = null;
            }
        }
        let finalZoneName = o.zoneName;
        if (!finalZoneName && o.orderType === "delivery") {
            if (branchSnapshotData?.zoneName) {
                finalZoneName = branchSnapshotData.zoneName;
            }
            else if (shippingAddressData?.addressZoneName) {
                finalZoneName = shippingAddressData.addressZoneName;
            }
        }
        if (!finalZoneName && o.orderType === "delivery" && o.addressLat && o.addressLng) {
            const latNum = parseFloat(String(o.addressLat));
            const lngNum = parseFloat(String(o.addressLng));
            if (!isNaN(latNum) && !isNaN(lngNum)) {
                const detected = await (0, zone_helper_1.resolveZoneFromCoords)(latNum, lngNum, adminRestaurantId);
                if (detected) {
                    finalZoneName = detected.name;
                }
            }
        }
        let couponDetails = null;
        if (o.couponCode) {
            try {
                const [c] = await connection_1.db.select({
                    id: schema_1.coupons.id,
                    name: schema_1.coupons.name,
                    nameAr: schema_1.coupons.nameAr,
                    nameFr: schema_1.coupons.nameFr,
                    code: schema_1.coupons.code,
                }).from(schema_1.coupons).where((0, drizzle_orm_1.eq)(schema_1.coupons.code, o.couponCode)).limit(1);
                if (c)
                    couponDetails = c;
            }
            catch (e) { }
        }
        const pmDetails = (0, order_helper_1.resolvePaymentMethodDetails)(o.paymentMethod, o.paymentMethodName, o.paymentMethodNameAr);
        const { addressLat, addressLng, ...rest } = o;
        return {
            ...rest,
            isBundle: Boolean(o.isBundle),
            offerId: o.offerId || null,
            paymentMethod: pmDetails.id,
            paymentMethodName: pmDetails.name,
            paymentMethodNameAr: pmDetails.nameAr,
            zoneName: finalZoneName,
            shippingAddress: shippingAddressData && typeof shippingAddressData === "object"
                ? {
                    title: shippingAddressData.title ?? null,
                    street: shippingAddressData.street ?? null,
                    building: shippingAddressData.building ?? null,
                    floor: shippingAddressData.floor ?? null,
                    apartment: shippingAddressData.apartment ?? null,
                    landmark: shippingAddressData.landmark ?? null,
                    location: shippingAddressData.location ?? null,
                    fulladdress: shippingAddressData.fulladdress ?? null,
                    lat: shippingAddressData.lat ?? null,
                    lng: shippingAddressData.lng ?? null,
                    phone: shippingAddressData.phone ?? null,
                    addressZoneId: shippingAddressData.addressZoneId ?? null,
                    restaurantZoneId: shippingAddressData.restaurantZoneId ?? null,
                    addressZoneName: shippingAddressData.addressZoneName ?? null,
                    addressZoneNameAr: shippingAddressData.addressZoneNameAr ?? null,
                }
                : null,
            branchSnapshot: branchSnapshotData && typeof branchSnapshotData === "object"
                ? {
                    id: branchSnapshotData.id ?? null,
                    name: branchSnapshotData.name ?? null,
                    nameAr: branchSnapshotData.nameAr ?? null,
                    nameFr: branchSnapshotData.nameFr ?? null,
                    address: branchSnapshotData.address ?? null,
                    addressAr: branchSnapshotData.addressAr ?? null,
                    addressFr: branchSnapshotData.addressFr ?? null,
                    phone: branchSnapshotData.phone ?? null,
                    status: branchSnapshotData.status ?? null,
                    zoneId: branchSnapshotData.zoneId ?? null,
                    zoneName: branchSnapshotData.zoneName ?? null,
                    zoneNameAr: branchSnapshotData.zoneNameAr ?? null,
                    cityId: branchSnapshotData.cityId ?? null,
                    cityName: branchSnapshotData.cityName ?? null,
                    cityNameAr: branchSnapshotData.cityNameAr ?? null,
                    oldBranch: branchSnapshotData.oldBranch ?? null,
                    note: branchSnapshotData.note ?? null,
                }
                : null,
            discount: {
                discountId: o.discountId ?? null,
                discountAmount: o.discountAmount ?? "0.00",
                discountType: o.discountType ?? null,
                discountValue: o.discountValue ?? null,
                discountSource: o.discountSource ?? null,
                couponId: o.couponId ?? null,
                couponCode: o.couponCode ?? null,
                couponName: couponDetails?.name ?? null,
                couponNameAr: couponDetails?.nameAr ?? null,
                couponNameFr: couponDetails?.nameFr ?? null,
                firstOrderDiscountId: o.firstOrderDiscountId ?? null,
            },
        };
    }));
    // ✅ حساب الـ Summary: إجمالي عدد الأوردرات وإجمالي القيمة بناءً على نفس الفلتر
    const summary = {
        totalOrders: restaurantOrders.length,
        totalAmount: restaurantOrders
            .reduce((sum, o) => sum + parseFloat(o.totalAmount ?? "0"), 0)
            .toFixed(2),
    };
    return (0, response_1.SuccessResponse)(res, { message: "Get orders success", summary, data: restaurantOrders });
};
exports.getRestaurantOrders = getRestaurantOrders;
const getOrdersByStatus = async (req, res, status) => {
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
        (0, drizzle_orm_1.eq)(schema_1.orders.status, status),
        // ✅ إخفاء طلبات الفيزا المعلقة أو الفاشلة — تظهر فقط لما paymentStatus = 'paid'
        (0, order_helper_1.excludeUnpaidVisaOrders)(),
    ];
    const queryBranchId = req.query?.branchId?.trim();
    const filterBranchId = adminBranchId || (queryBranchId && queryBranchId !== "null" && queryBranchId !== "undefined" ? queryBranchId : undefined);
    if (filterBranchId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.branchId, filterBranchId));
    }
    const source = (req.query?.source || req.query?.orderSource)?.trim();
    if (source && source !== "null" && source !== "undefined") {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.orderSource, source));
    }
    const zoneId = req.query?.zoneId?.trim();
    if (zoneId && zoneId !== "null" && zoneId !== "undefined") {
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.orders.zoneId, zoneId), (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.zoneId, zoneId), (0, drizzle_orm_1.eq)(schema_1.zones.id, zoneId)));
    }
    const cityId = req.query?.cityId?.trim();
    if (cityId && cityId !== "null" && cityId !== "undefined") {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.zones.cityId, cityId));
    }
    const dateConditions = await (0, order_helper_1.buildOrderDateConditions)(req, adminRestaurantId, req.user.type === "owner" || req.user.type === "branch_manager"
        ? true
        : await (async () => {
            const { checkUserPermission } = await Promise.resolve().then(() => __importStar(require("../../middlewares/hasPermission")));
            return checkUserPermission(req.user.id, "order", "advanced_filter");
        })());
    conditions.push(...dateConditions);
    // ✅ فلترة وسيلة الدفع وأنواع الخصم المتعددة (Payment Method & Discount Filters)
    const discountAndPaymentConditions = (0, order_helper_1.buildOrderDiscountAndPaymentConditions)(req);
    conditions.push(...discountAndPaymentConditions);
    // ✅ فلترة نوع الطلب (delivery / takeaway / dine_in) وبيانات العميل (الاسم، الإيميل، الهاتف)
    const userAndTypeConditions = (0, order_helper_1.buildOrderUserAndTypeConditions)(req);
    conditions.push(...userAndTypeConditions);
    // ✅ فلترة الطلبات الملغاة بحسب من قام بالإلغاء (user vs restaurant)
    const cancellationConditions = (0, order_helper_1.buildOrderCancellationConditions)(req, {
        enforceCancelledStatusIfFiltered: false,
    });
    conditions.push(...cancellationConditions);
    const rawResult = await connection_1.db
        .select({
        id: schema_1.orders.id,
        orderNumber: schema_1.orders.orderNumber,
        dailyOrderNumber: schema_1.orders.dailyOrderNumber,
        customerName: schema_1.users.name,
        customerPhone: schema_1.users.phone,
        alternatePhone: schema_1.users.alternatePhone,
        customerEmail: schema_1.users.email,
        isGuest: schema_1.users.isGuest,
        rating: schema_1.orders.rating,
        ratingComment: schema_1.orders.ratingComment,
        orderType: schema_1.orders.orderType,
        orderSource: schema_1.orders.orderSource,
        paymentMethod: schema_1.orders.paymentMethod,
        paymentMethodName: schema_1.paymentMethods.name,
        paymentMethodNameAr: schema_1.paymentMethods.nameAr,
        subtotal: schema_1.orders.subtotal,
        deliveryFee: schema_1.orders.deliveryFee,
        serviceFee: schema_1.orders.serviceFee,
        appCommission: schema_1.orders.appCommission,
        discountId: schema_1.orders.discountId,
        discountType: schema_1.orders.discountType,
        discountValue: schema_1.orders.discountValue,
        discountSource: schema_1.orders.discountSource,
        discountAmount: schema_1.orders.discountAmount,
        couponId: schema_1.orders.couponId,
        couponCode: schema_1.orders.couponCode,
        firstOrderDiscountId: schema_1.orders.firstOrderDiscountId,
        offerId: schema_1.orders.offerId,
        isBundle: schema_1.orders.isBundle,
        isPointsRedeemed: schema_1.orders.isPointsRedeemed,
        redeemCode: schema_1.orders.redeemCode,
        totalAmount: schema_1.orders.totalAmount,
        status: schema_1.orders.status,
        durationOrderPreparing: schema_1.orders.durationOrderPreparing,
        cancelReasonId: schema_1.orders.cancelReasonId,
        cancelReason: schema_1.orders.cancelReason,
        cancelReasonType: schema_1.orders.cancelReasonType,
        note: schema_1.orders.note,
        deliveryMan: {
            id: schema_1.deliveryMen.id,
            name: schema_1.deliveryMen.name,
            phone: schema_1.deliveryMen.phone,
        },
        branchName: schema_1.branches.name,
        zoneName: (0, drizzle_orm_1.sql) `CASE WHEN ${schema_1.orders.orderType} = 'delivery' THEN ${schema_1.zones.name} ELSE NULL END`,
        addressLat: schema_1.addresses.lat,
        addressLng: schema_1.addresses.lng,
        shippingAddress: schema_1.orders.shippingAddress,
        branchSnapshot: schema_1.orders.branchSnapshot,
        createdAt: schema_1.orders.createdAt,
        updatedAt: schema_1.orders.updatedAt,
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.orders.userId, schema_1.users.id))
        .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.orders.branchId, schema_1.branches.id))
        .leftJoin(schema_1.deliveryMen, (0, drizzle_orm_1.eq)(schema_1.orders.deliveryManId, schema_1.deliveryMen.id))
        .leftJoin(schema_1.addresses, (0, drizzle_orm_1.eq)(schema_1.orders.addressId, schema_1.addresses.id))
        .leftJoin(schema_1.restaurantZoneDeliveryFees, (0, drizzle_orm_1.eq)(schema_1.orders.zoneId, schema_1.restaurantZoneDeliveryFees.id))
        .leftJoin(schema_1.zones, (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.zoneId, schema_1.zones.id), (0, drizzle_orm_1.eq)(schema_1.orders.zoneId, schema_1.zones.id)))
        .leftJoin(schema_1.paymentMethods, (0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, schema_1.paymentMethods.id))
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.orders.createdAt));
    const result = await Promise.all(rawResult.map(async (o) => {
        let shippingAddressData = o.shippingAddress;
        if (typeof shippingAddressData === "string") {
            try {
                shippingAddressData = JSON.parse(shippingAddressData);
                if (typeof shippingAddressData === "string") {
                    shippingAddressData = JSON.parse(shippingAddressData);
                }
            }
            catch (e) {
                shippingAddressData = null;
            }
        }
        let branchSnapshotData = o.branchSnapshot;
        if (typeof branchSnapshotData === "string") {
            try {
                branchSnapshotData = JSON.parse(branchSnapshotData);
                if (typeof branchSnapshotData === "string") {
                    branchSnapshotData = JSON.parse(branchSnapshotData);
                }
            }
            catch (e) {
                branchSnapshotData = null;
            }
        }
        let finalZoneName = o.zoneName;
        if (!finalZoneName && o.orderType === "delivery") {
            if (branchSnapshotData?.zoneName) {
                finalZoneName = branchSnapshotData.zoneName;
            }
            else if (shippingAddressData?.addressZoneName) {
                finalZoneName = shippingAddressData.addressZoneName;
            }
        }
        if (!finalZoneName && o.orderType === "delivery" && o.addressLat && o.addressLng) {
            const latNum = parseFloat(String(o.addressLat));
            const lngNum = parseFloat(String(o.addressLng));
            if (!isNaN(latNum) && !isNaN(lngNum)) {
                const detected = await (0, zone_helper_1.resolveZoneFromCoords)(latNum, lngNum, adminRestaurantId);
                if (detected) {
                    finalZoneName = detected.name;
                }
            }
        }
        let couponDetails = null;
        if (o.couponCode) {
            try {
                const [c] = await connection_1.db.select({
                    id: schema_1.coupons.id,
                    name: schema_1.coupons.name,
                    nameAr: schema_1.coupons.nameAr,
                    nameFr: schema_1.coupons.nameFr,
                    code: schema_1.coupons.code,
                }).from(schema_1.coupons).where((0, drizzle_orm_1.eq)(schema_1.coupons.code, o.couponCode)).limit(1);
                if (c)
                    couponDetails = c;
            }
            catch (e) { }
        }
        const pmDetails = (0, order_helper_1.resolvePaymentMethodDetails)(o.paymentMethod, o.paymentMethodName, o.paymentMethodNameAr);
        const { addressLat, addressLng, ...rest } = o;
        return {
            ...rest,
            isBundle: Boolean(o.isBundle),
            offerId: o.offerId || null,
            paymentMethod: pmDetails.id,
            paymentMethodName: pmDetails.name,
            paymentMethodNameAr: pmDetails.nameAr,
            zoneName: finalZoneName,
            shippingAddress: shippingAddressData && typeof shippingAddressData === "object"
                ? {
                    title: shippingAddressData.title ?? null,
                    street: shippingAddressData.street ?? null,
                    building: shippingAddressData.building ?? null,
                    floor: shippingAddressData.floor ?? null,
                    apartment: shippingAddressData.apartment ?? null,
                    landmark: shippingAddressData.landmark ?? null,
                    location: shippingAddressData.location ?? null,
                    fulladdress: shippingAddressData.fulladdress ?? null,
                    lat: shippingAddressData.lat ?? null,
                    lng: shippingAddressData.lng ?? null,
                    phone: shippingAddressData.phone ?? null,
                    addressZoneId: shippingAddressData.addressZoneId ?? null,
                    restaurantZoneId: shippingAddressData.restaurantZoneId ?? null,
                    addressZoneName: shippingAddressData.addressZoneName ?? null,
                    addressZoneNameAr: shippingAddressData.addressZoneNameAr ?? null,
                }
                : null,
            branchSnapshot: branchSnapshotData && typeof branchSnapshotData === "object"
                ? {
                    id: branchSnapshotData.id ?? null,
                    name: branchSnapshotData.name ?? null,
                    nameAr: branchSnapshotData.nameAr ?? null,
                    nameFr: branchSnapshotData.nameFr ?? null,
                    address: branchSnapshotData.address ?? null,
                    addressAr: branchSnapshotData.addressAr ?? null,
                    addressFr: branchSnapshotData.addressFr ?? null,
                    phone: branchSnapshotData.phone ?? null,
                    status: branchSnapshotData.status ?? null,
                    zoneId: branchSnapshotData.zoneId ?? null,
                    zoneName: branchSnapshotData.zoneName ?? null,
                    zoneNameAr: branchSnapshotData.zoneNameAr ?? null,
                    cityId: branchSnapshotData.cityId ?? null,
                    cityName: branchSnapshotData.cityName ?? null,
                    cityNameAr: branchSnapshotData.cityNameAr ?? null,
                    oldBranch: branchSnapshotData.oldBranch ?? null,
                    note: branchSnapshotData.note ?? null,
                }
                : null,
            discount: {
                discountId: o.discountId ?? null,
                discountAmount: o.discountAmount ?? "0.00",
                discountType: o.discountType ?? null,
                discountValue: o.discountValue ?? null,
                discountSource: o.discountSource ?? null,
                couponId: o.couponId ?? null,
                couponCode: o.couponCode ?? null,
                couponName: couponDetails?.name ?? null,
                couponNameAr: couponDetails?.nameAr ?? null,
                couponNameFr: couponDetails?.nameFr ?? null,
                firstOrderDiscountId: o.firstOrderDiscountId ?? null,
            },
        };
    }));
    // ✅ حساب الـ Summary: إجمالي عدد الأوردرات وإجمالي القيمة بناءً على نفس الفلتر
    const summary = {
        totalOrders: result.length,
        totalAmount: result
            .reduce((sum, o) => sum + parseFloat(o.totalAmount ?? "0"), 0)
            .toFixed(2),
    };
    return (0, response_1.SuccessResponse)(res, { message: `Get ${status} orders success`, summary, data: result });
};
exports.getOrdersByStatus = getOrdersByStatus;
// ==========================================
// APIs لكل حالة أوردر
// ==========================================
const getPendingOrders = async (req, res) => (0, exports.getOrdersByStatus)(req, res, "pending");
exports.getPendingOrders = getPendingOrders;
const getAcceptedOrders = async (req, res) => (0, exports.getOrdersByStatus)(req, res, "accepted");
exports.getAcceptedOrders = getAcceptedOrders;
const getPreparingOrders = async (req, res) => (0, exports.getOrdersByStatus)(req, res, "preparing");
exports.getPreparingOrders = getPreparingOrders;
const getOutForDeliveryOrders = async (req, res) => (0, exports.getOrdersByStatus)(req, res, "out_for_delivery");
exports.getOutForDeliveryOrders = getOutForDeliveryOrders;
const getDeliveredOrders = async (req, res) => (0, exports.getOrdersByStatus)(req, res, "delivered");
exports.getDeliveredOrders = getDeliveredOrders;
const getCancelledOrders = async (req, res) => (0, exports.getOrdersByStatus)(req, res, "cancelled");
exports.getCancelledOrders = getCancelledOrders;
const getRefundOrders = async (req, res) => (0, exports.getOrdersByStatus)(req, res, "refund");
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
            alternatePhone: schema_1.users.alternatePhone,
            email: schema_1.users.email,
            isGuest: schema_1.users.isGuest,
        },
        branch: {
            id: schema_1.branches.id,
            name: schema_1.branches.name,
        },
        restaurant: {
            id: schema_1.restaurants.id,
            name: schema_1.restaurants.name,
        },
        address: {
            id: schema_1.addresses.id,
            type: schema_1.addresses.type,
            title: schema_1.addresses.title,
            lat: schema_1.addresses.lat,
            lng: schema_1.addresses.lng,
            street: schema_1.addresses.street,
            number: schema_1.addresses.number,
            floor: schema_1.addresses.floor,
            apartment: schema_1.addresses.apartment,
            landmark: schema_1.addresses.landmark,
            location: schema_1.addresses.location,
        },
        zone: {
            id: schema_1.zones.id,
            name: schema_1.zones.name,
            nameAr: schema_1.zones.nameAr,
            nameFr: schema_1.zones.nameFr,
        },
        driver: {
            id: schema_1.deliveryMen.id,
            name: schema_1.deliveryMen.name,
            phone: schema_1.deliveryMen.phone,
        },
        paymentMethodData: {
            id: schema_1.paymentMethods.id,
            name: schema_1.paymentMethods.name,
            nameAr: schema_1.paymentMethods.nameAr,
        },
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.orders.userId, schema_1.users.id))
        .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.orders.branchId, schema_1.branches.id))
        .leftJoin(schema_1.restaurants, (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, schema_1.restaurants.id))
        .leftJoin(schema_1.deliveryMen, (0, drizzle_orm_1.eq)(schema_1.orders.deliveryManId, schema_1.deliveryMen.id))
        .leftJoin(schema_1.addresses, (0, drizzle_orm_1.eq)(schema_1.orders.addressId, schema_1.addresses.id))
        .leftJoin(schema_1.restaurantZoneDeliveryFees, (0, drizzle_orm_1.eq)(schema_1.orders.zoneId, schema_1.restaurantZoneDeliveryFees.id))
        .leftJoin(schema_1.zones, (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.zoneId, schema_1.zones.id))
        .leftJoin(schema_1.paymentMethods, (0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, schema_1.paymentMethods.id))
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
    // ==========================================
    // 🗺️ Fallback: استنتاج الزون من إحداثيات العنوان (lat, lng) إذا كان zone فارغاً
    // ==========================================
    let resolvedZone = (orderDetail.zone && orderDetail.zone.id)
        ? orderDetail.zone
        : null;
    const restaurantId = orderDetail.order.restaurantId;
    const addrLat = orderDetail.address?.lat ? parseFloat(String(orderDetail.address.lat)) : null;
    const addrLng = orderDetail.address?.lng ? parseFloat(String(orderDetail.address.lng)) : null;
    if (!resolvedZone && addrLat !== null && addrLng !== null && !isNaN(addrLat) && !isNaN(addrLng)) {
        const detected = await (0, zone_helper_1.resolveZoneFromCoords)(addrLat, addrLng, restaurantId);
        if (detected) {
            resolvedZone = {
                id: detected.id,
                name: detected.name,
                nameAr: detected.nameAr ?? "",
                nameFr: detected.nameFr ?? "",
            };
        }
    }
    // ==========================================
    // 🏢 استنتاج الفرع (Branch) بناءً على الـ Zone إذا لم يكن محدداً في الأوردر
    // ==========================================
    let resolvedBranch = (orderDetail.branch && orderDetail.branch.id)
        ? orderDetail.branch
        : null;
    const targetZoneId = resolvedZone?.id;
    if ((!resolvedBranch || !resolvedBranch.id) && targetZoneId && restaurantId) {
        const [matchedBranch] = await connection_1.db
            .select({
            id: schema_1.branches.id,
            name: schema_1.branches.name,
        })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.branches.zoneId, targetZoneId), (0, drizzle_orm_1.eq)(schema_1.branches.status, "active")))
            .limit(1);
        if (matchedBranch) {
            resolvedBranch = matchedBranch;
        }
    }
    // Fallback: إذا لم نجد فرعاً خاصاً بالزون، نجلب أي فرع نشط للمطعم
    if ((!resolvedBranch || !resolvedBranch.id) && restaurantId) {
        const [fallbackBranch] = await connection_1.db
            .select({
            id: schema_1.branches.id,
            name: schema_1.branches.name,
        })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.branches.status, "active")))
            .limit(1);
        if (fallbackBranch) {
            resolvedBranch = fallbackBranch;
        }
    }
    // 2. جلب أصناف الأكل (Order Items)
    const items = await connection_1.db.select({
        id: schema_1.orderItems.id,
        foodId: schema_1.orderItems.foodId,
        quantity: schema_1.orderItems.quantity,
        basePrice: schema_1.orderItems.basePrice,
        variationsPrice: schema_1.orderItems.variationsPrice,
        addonsPrice: schema_1.orderItems.addonsPrice,
        totalPrice: schema_1.orderItems.totalPrice,
        note: schema_1.orderItems.note,
        variations: schema_1.orderItems.variations,
        addons: schema_1.orderItems.addons,
        foodName: schema_1.food.name,
        foodNameAr: schema_1.food.nameAr,
        foodNameFr: schema_1.food.nameFr,
        foodImage: schema_1.food.image,
        foodDescription: schema_1.food.description,
    })
        .from(schema_1.orderItems)
        .leftJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.orderItems.foodId, schema_1.food.id))
        .where((0, drizzle_orm_1.eq)(schema_1.orderItems.orderId, id));
    // ✅ 3. تنظيف الـ Variations وجلب الأسماء وحساب السعر ديناميكياً
    const formattedItems = await Promise.all(items.map(async (item) => {
        let cleanVariations = item.variations;
        if (typeof cleanVariations === 'string') {
            try {
                cleanVariations = JSON.parse(cleanVariations);
                if (typeof cleanVariations === 'string') {
                    cleanVariations = JSON.parse(cleanVariations);
                }
            }
            catch (error) {
                console.error("Error parsing variations for item ID:", item.id);
            }
        }
        let totalCalculatedVarPrice = 0;
        if (Array.isArray(cleanVariations) && cleanVariations.length > 0) {
            cleanVariations = await Promise.all(cleanVariations.map(async (v) => {
                // 1. مرونة في استخراج الـ IDs من الـ JSON
                const varId = v.variationId || v.id || v.variation_id;
                const optId = v.optionId || v.option_id || (v.option && v.option.id);
                let variationName = v.variationName || v.name || "Unknown";
                let variationNameAr = v.variationNameAr || v.nameAr || "غير معروف";
                let optionName = v.optionName || v.value || "Unknown";
                let optionNameAr = v.optionNameAr || v.valueAr || "غير معروف";
                // 2. البحث في جدول foodVariations في حال لم تكن الخواص موجودة كـ snapshot
                if (varId) {
                    const [varDb] = await connection_1.db
                        .select()
                        .from(schema_1.foodVariations)
                        .where((0, drizzle_orm_1.eq)(schema_1.foodVariations.id, varId))
                        .limit(1);
                    if (varDb) {
                        variationName = varDb.name || variationName;
                        variationNameAr = varDb.nameAr || variationNameAr;
                    }
                }
                // 3. البحث في جدول variationOptions
                if (optId) {
                    const [optDb] = await connection_1.db
                        .select()
                        .from(schema_1.variationOptions)
                        .where((0, drizzle_orm_1.eq)(schema_1.variationOptions.id, optId))
                        .limit(1);
                    let optPrice = parseFloat(v.additionalPrice || v.price || "0");
                    if (optDb) {
                        optionName = optDb.optionName || optionName;
                        optionNameAr = optDb.optionNameAr || optionNameAr;
                        const price = parseFloat(optDb.price || optDb.additionalPrice || "0");
                        totalCalculatedVarPrice += price;
                        if (!optPrice && price) {
                            optPrice = price;
                        }
                    }
                    else {
                        totalCalculatedVarPrice += optPrice;
                    }
                    return {
                        ...v,
                        variationId: varId,
                        optionId: optId,
                        variationName,
                        variationNameAr,
                        optionName,
                        optionNameAr,
                        additionalPrice: optPrice.toFixed(2),
                        price: optPrice.toFixed(2),
                    };
                }
                const fallbackPrice = parseFloat(v.additionalPrice || v.price || "0");
                totalCalculatedVarPrice += fallbackPrice;
                return {
                    ...v,
                    variationId: varId,
                    optionId: optId,
                    variationName,
                    variationNameAr,
                    optionName,
                    optionNameAr,
                    additionalPrice: fallbackPrice.toFixed(2),
                    price: fallbackPrice.toFixed(2),
                };
            }));
        }
        const finalVarPrice = item.variationsPrice != null
            ? parseFloat(item.variationsPrice)
            : totalCalculatedVarPrice;
        const finalAddonsPrice = parseFloat(item.addonsPrice || "0");
        const finalTotalPrice = item.totalPrice != null
            ? parseFloat(item.totalPrice)
            : (parseFloat(item.basePrice || "0") + finalVarPrice + finalAddonsPrice) * item.quantity;
        // 🌟 جلب تفاصيل الـ Addons اللي اختارها العميل فعلاً
        let foodAddons = [];
        let selectedAddonIds = item.addons;
        if (typeof selectedAddonIds === "string") {
            try {
                selectedAddonIds = JSON.parse(selectedAddonIds);
            }
            catch {
                selectedAddonIds = [];
            }
        }
        if (Array.isArray(selectedAddonIds) && selectedAddonIds.length > 0) {
            // استخراج معرفات الإضافات (IDs) في حال كانت مصفوفة من الكائنات
            const extractedIds = selectedAddonIds.map((addon) => {
                if (typeof addon === "string")
                    return addon;
                if (addon && addon.addonId)
                    return String(addon.addonId);
                if (addon && addon.id)
                    return String(addon.id);
                return String(addon);
            }).filter(id => id && id.trim() !== "" && id !== "[object Object]");
            if (extractedIds.length > 0) {
                foodAddons = await connection_1.db
                    .select({
                    id: schema_1.addons.id,
                    name: schema_1.addons.name,
                    nameAr: schema_1.addons.nameAr,
                    nameFr: schema_1.addons.nameFr,
                    price: schema_1.addons.price,
                    status: schema_1.addons.status,
                    categoryId: schema_1.addons.adonescategoryid,
                })
                    .from(schema_1.addons)
                    .where((0, drizzle_orm_1.inArray)(schema_1.addons.id, extractedIds));
            }
        }
        return {
            ...item,
            addons: foodAddons,
            variationsPrice: finalVarPrice.toFixed(2),
            addonsPrice: finalAddonsPrice.toFixed(2),
            totalPrice: finalTotalPrice.toFixed(2),
            variations: cleanVariations,
        };
    }));
    // 4. جلب بيانات وسيلة الدفع
    let pmDetails = (0, order_helper_1.resolvePaymentMethodDetails)(orderDetail.order.paymentMethod, orderDetail.paymentMethodData?.name, orderDetail.paymentMethodData?.nameAr);
    if (!pmDetails.name && orderDetail.order.paymentMethod && orderDetail.order.paymentMethod.length === 36) {
        try {
            const [pm] = await connection_1.db.select({
                id: schema_1.paymentMethods.id,
                name: schema_1.paymentMethods.name,
                nameAr: schema_1.paymentMethods.nameAr
            }).from(schema_1.paymentMethods).where((0, drizzle_orm_1.eq)(schema_1.paymentMethods.id, orderDetail.order.paymentMethod)).limit(1);
            if (pm) {
                pmDetails = {
                    id: pm.id,
                    name: pm.name,
                    nameAr: pm.nameAr,
                };
            }
        }
        catch (error) {
            console.error("Error fetching payment method:", error);
        }
    }
    // 5. حساب إجمالي عدد طلبات العميل في هذا المطعم
    // let userTotalOrders = 0;
    // if (orderDetail.order.userId && restaurantId) {
    //     const [userPoints] = await db
    //         .select({ totalOrders: userRestaurantPoints.totalOrders })
    //         .from(userRestaurantPoints)
    //         .where(
    //             and(
    //                 eq(userRestaurantPoints.userId, orderDetail.order.userId),
    //                 eq(userRestaurantPoints.restaurantId, restaurantId)
    //             )
    //         );
    //     userTotalOrders = Number(userPoints?.totalOrders || 0);
    // }
    let userTotalOrders = 0;
    if (orderDetail.order.userId && restaurantId) {
        const [userOrdersCount] = await connection_1.db
            .select({ totalOrders: (0, drizzle_orm_1.sql) `COUNT(*)` })
            .from(schema_1.orders)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orders.userId, orderDetail.order.userId), (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId), (0, order_helper_1.excludeUnpaidVisaOrders)()));
        userTotalOrders = Number(userOrdersCount?.totalOrders || 0);
    }
    // Fetch discount and coupon names for the detail view
    let discountDetails = null;
    if (orderDetail.order.discountId) {
        const [disc] = await connection_1.db.select({
            id: schema_1.discounts.id,
            name: schema_1.discounts.name,
            nameAr: schema_1.discounts.nameAr,
            nameFr: schema_1.discounts.nameFr,
        }).from(schema_1.discounts).where((0, drizzle_orm_1.eq)(schema_1.discounts.id, orderDetail.order.discountId)).limit(1);
        if (disc)
            discountDetails = disc;
    }
    let couponDetails = null;
    if (orderDetail.order.couponId) {
        const [coup] = await connection_1.db.select({
            id: schema_1.coupons.id,
            name: schema_1.coupons.name,
            nameAr: schema_1.coupons.nameAr,
            nameFr: schema_1.coupons.nameFr,
            code: schema_1.coupons.code,
        }).from(schema_1.coupons).where((0, drizzle_orm_1.eq)(schema_1.coupons.id, orderDetail.order.couponId)).limit(1);
        if (coup)
            couponDetails = coup;
    }
    let offerDetails = null;
    if (orderDetail.order.offerId) {
        try {
            const [off] = await connection_1.db
                .select({
                id: schema_1.offers.id,
                name: schema_1.offers.name,
                nameAr: schema_1.offers.nameAr,
                nameFr: schema_1.offers.nameFr,
                price: schema_1.offers.price,
                image: schema_1.offers.image,
            })
                .from(schema_1.offers)
                .where((0, drizzle_orm_1.eq)(schema_1.offers.id, orderDetail.order.offerId))
                .limit(1);
            if (off)
                offerDetails = off;
        }
        catch (e) {
            console.error("Error fetching offer for order:", e);
        }
    }
    // 🟢 حل مشكلة فك تشفير الـ JSON لبيانات الـ Snapshot إذا رجعت كـ String من قاعدة البيانات
    let shippingAddressData = orderDetail.order.shippingAddress;
    if (typeof shippingAddressData === "string") {
        try {
            shippingAddressData = JSON.parse(shippingAddressData);
            if (typeof shippingAddressData === "string") {
                shippingAddressData = JSON.parse(shippingAddressData);
            }
        }
        catch (e) {
            console.error("Error parsing shippingAddress:", e);
        }
    }
    let branchSnapshotData = orderDetail.order.branchSnapshot;
    if (typeof branchSnapshotData === "string") {
        try {
            branchSnapshotData = JSON.parse(branchSnapshotData);
            if (typeof branchSnapshotData === "string") {
                branchSnapshotData = JSON.parse(branchSnapshotData);
            }
        }
        catch (e) {
            console.error("Error parsing branchSnapshot:", e);
        }
    }
    return (0, response_1.SuccessResponse)(res, {
        message: "Get order details success",
        data: {
            id: orderDetail.order.id,
            orderNumber: orderDetail.order.orderNumber,
            dailyOrderNumber: orderDetail.order.dailyOrderNumber, // ✅ الرقم التسلسلي اليومي
            isBundle: Boolean(orderDetail.order.isBundle),
            offerId: orderDetail.order.offerId ?? null,
            offer: offerDetails,
            orderType: orderDetail.order.orderType,
            orderSource: orderDetail.order.orderSource,
            status: orderDetail.order.status,
            cancelReasonId: orderDetail.order.cancelReasonId,
            cancelReason: orderDetail.order.cancelReason,
            cancelReasonType: orderDetail.order.cancelReasonType,
            note: orderDetail.order.note,
            subtotal: orderDetail.order.subtotal,
            deliveryFee: orderDetail.order.deliveryFee,
            serviceFee: orderDetail.order.serviceFee,
            appCommission: orderDetail.order.appCommission,
            // Kept flat for backward-compat
            discountAmount: orderDetail.order.discountAmount,
            couponCode: orderDetail.order.couponCode,
            totalAmount: orderDetail.order.totalAmount,
            // Structured discount object with names
            discount: {
                discountId: orderDetail.order.discountId ?? null,
                discountAmount: orderDetail.order.discountAmount ?? null,
                discountType: orderDetail.order.discountType ?? null,
                discountValue: orderDetail.order.discountValue ?? null,
                discountSource: orderDetail.order.discountSource ?? null,
                discountName: discountDetails?.name ?? null,
                discountNameAr: discountDetails?.nameAr ?? null,
                discountNameFr: discountDetails?.nameFr ?? null,
                couponId: orderDetail.order.couponId ?? null,
                couponCode: orderDetail.order.couponCode ?? null,
                couponName: couponDetails?.name ?? null,
                couponNameAr: couponDetails?.nameAr ?? null,
                couponNameFr: couponDetails?.nameFr ?? null,
            },
            rating: orderDetail.order.rating,
            ratingComment: orderDetail.order.ratingComment,
            isPointsRedeemed: orderDetail.order.isPointsRedeemed,
            redeemCode: orderDetail.order.redeemCode,
            redeemCodeExpiresAt: orderDetail.order.redeemCodeExpiresAt,
            createdAt: orderDetail.order.createdAt,
            updatedAt: orderDetail.order.updatedAt,
            durationOrderPreparing: orderDetail.order.durationOrderPreparing,
            customer: {
                ...orderDetail.customer,
                totalOrders: userTotalOrders,
            },
            // ✅ إرجاع معرف واسم وسيلة الدفع بالعربي والإنجليزي
            paymentMethod: pmDetails.id,
            paymentMethodName: pmDetails.name,
            paymentMethodNameAr: pmDetails.nameAr,
            deliveryManId: orderDetail.order.deliveryManId,
            deliveryMan: orderDetail.driver,
            driver: orderDetail.driver,
            branchId: resolvedBranch?.id || orderDetail.order.branchId || null,
            branch: resolvedBranch || orderDetail.branch || null,
            restaurant: orderDetail.restaurant,
            // Live address (current data from addresses table)
            address: orderDetail.address,
            zone: resolvedZone,
            zoneName: resolvedZone?.name || null,
            // ✅ Snapshot: بيانات عنوان التوصيل كما كانت وقت تسجيل الأوردر
            shippingAddress: shippingAddressData && typeof shippingAddressData === "object"
                ? {
                    title: shippingAddressData.title ?? null,
                    street: shippingAddressData.street ?? null,
                    building: shippingAddressData.building ?? null,
                    floor: shippingAddressData.floor ?? null,
                    apartment: shippingAddressData.apartment ?? null,
                    landmark: shippingAddressData.landmark ?? null,
                    location: shippingAddressData.location ?? null,
                    fulladdress: shippingAddressData.fulladdress ?? null,
                    lat: shippingAddressData.lat ?? null,
                    lng: shippingAddressData.lng ?? null,
                    phone: shippingAddressData.phone ?? null,
                    addressZoneId: shippingAddressData.addressZoneId ?? null,
                    restaurantZoneId: shippingAddressData.restaurantZoneId ?? null,
                    addressZoneName: shippingAddressData.addressZoneName ?? null,
                    addressZoneNameAr: shippingAddressData.addressZoneNameAr ?? null,
                }
                : null,
            // ✅ Snapshot: بيانات الفرع كما كانت وقت تسجيل الأوردر
            branchSnapshot: branchSnapshotData && typeof branchSnapshotData === "object"
                ? {
                    id: branchSnapshotData.id ?? null,
                    name: branchSnapshotData.name ?? null,
                    nameAr: branchSnapshotData.nameAr ?? null,
                    nameFr: branchSnapshotData.nameFr ?? null,
                    address: branchSnapshotData.address ?? null,
                    addressAr: branchSnapshotData.addressAr ?? null,
                    addressFr: branchSnapshotData.addressFr ?? null,
                    phone: branchSnapshotData.phone ?? null,
                    status: branchSnapshotData.status ?? null,
                    zoneId: branchSnapshotData.zoneId ?? null,
                    zoneName: branchSnapshotData.zoneName ?? null,
                    zoneNameAr: branchSnapshotData.zoneNameAr ?? null,
                    cityId: branchSnapshotData.cityId ?? null,
                    cityName: branchSnapshotData.cityName ?? null,
                    cityNameAr: branchSnapshotData.cityNameAr ?? null,
                    oldBranch: branchSnapshotData.oldBranch ?? null,
                    note: branchSnapshotData.note ?? null,
                }
                : null,
            items: formattedItems
        }
    });
};
exports.getRestaurantOrderById = getRestaurantOrderById;
// ==========================================
// 3. تحديث حالة الأوردر (مع إرجاع الفلوس والعمولة لو المطعم كنسل)
// تحديث حالة الأوردر (إرجاع المحفظة + التسوية + إضافة النقاط عند delivered)
// ==========================================
const updateOrderStatus = async (req, res) => {
    const { orderId } = req.params;
    const { status, cancelReasonId, customReason, deliveryManId } = req.body;
    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    const adminBranchId = req.user?.branchId;
    if (!status)
        throw new BadRequest_1.BadRequest("Status is required");
    // ---------- Load + authorize ----------
    const [existingOrder] = await connection_1.db.select().from(schema_1.orders).where((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId)).limit(1);
    if (!existingOrder)
        throw new NotFound_1.NotFound("Order not found");
    if (existingOrder.restaurantId !== adminRestaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    if (adminBranchId && existingOrder.branchId !== adminBranchId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    // ---------- Delivery man ownership ----------
    let finalDeliveryManId = null;
    if (deliveryManId) {
        const [deliveryMan] = await connection_1.db
            .select()
            .from(schema_1.deliveryMen)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.deliveryMen.id, deliveryManId), (0, drizzle_orm_1.eq)(schema_1.deliveryMen.restaurantId, adminRestaurantId), (0, drizzle_orm_1.eq)(schema_1.deliveryMen.isDeleted, false)))
            .limit(1);
        if (!deliveryMan) {
            throw new NotFound_1.NotFound("Delivery man not found or does not belong to your restaurant");
        }
        finalDeliveryManId = deliveryMan.id;
    }
    // ---------- Status flow validation ----------
    const currentStatus = existingOrder.status;
    const finalStatuses = ["cancelled", "refund"];
    if (finalStatuses.includes(currentStatus)) {
        throw new BadRequest_1.BadRequest(`Order is already ${currentStatus} and cannot be changed`);
    }
    const statusFlowOrder = {
        pending: 1,
        accepted: 2,
        preparing: 3,
        out_for_delivery: 4,
        delivered: 5,
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
    // ---------- Cancel reason ----------
    let cancel;
    if (status === "cancelled") {
        const inputCustomReason = typeof customReason === "string" ? customReason.trim() : "";
        if (cancelReasonId) {
            const [found] = await connection_1.db
                .select()
                .from(selectReasons_1.selectReasons)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(selectReasons_1.selectReasons.id, cancelReasonId), (0, drizzle_orm_1.eq)(selectReasons_1.selectReasons.type, "restaurant")))
                .limit(1);
            if (!found)
                throw new BadRequest_1.BadRequest("Invalid cancel reason for restaurant");
            cancel = { reasonId: found.id, reasonText: inputCustomReason || found.name };
        }
        else if (inputCustomReason) {
            cancel = { reasonId: null, reasonText: inputCustomReason };
        }
        else {
            throw new BadRequest_1.BadRequest("Cancel reason or cancel reason ID is required when cancelling an order");
        }
    }
    // ---------- Delegate to shared service ----------
    const result = await (0, orderStatusService_1.changeOrderStatus)({
        orderId,
        status,
        expectedCurrentStatuses: [currentStatus], // guards against concurrent changes (e.g. the cron)
        deliveryManId: finalDeliveryManId,
        cancel,
        source: "admin",
    });
    if (!result.changed) {
        throw new BadRequest_1.BadRequest("Order status was changed by someone else. Please refresh and try again.");
    }
    return (0, response_1.SuccessResponse)(res, { message: `Order status successfully updated to ${status}` });
};
exports.updateOrderStatus = updateOrderStatus;
// ==========================================
// تحديث مدة تحضير الأوردر (بـ دقائق)
// ==========================================
const setOrderPreparingDuration = async (req, res) => {
    const { orderId } = req.params;
    const { duration } = req.body;
    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    const adminBranchId = req.user?.branchId;
    const [existingOrder] = await connection_1.db.select().from(schema_1.orders).where((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId)).limit(1);
    if (!existingOrder)
        throw new NotFound_1.NotFound('Order not found');
    if (existingOrder.restaurantId !== adminRestaurantId)
        throw new BadRequest_1.BadRequest('Unauthorized');
    if (adminBranchId && existingOrder.branchId !== adminBranchId)
        throw new BadRequest_1.BadRequest('Unauthorized');
    let finalDuration = duration;
    // إذا لم يرسل الآدمن duration، نعتمد الوقت الأقصى حسب نوع الأوردر (delivery / takeaway / dine_in)
    if (typeof finalDuration !== 'number') {
        const [settings] = await connection_1.db
            .select({
            maxDeliveryTime: schema_1.restaurantSettings.maxDeliveryTime,
            maxTakeAwayTime: schema_1.restaurantSettings.maxTakeAwayTime,
            maxDineInTime: schema_1.restaurantSettings.maxDineInTime,
        })
            .from(schema_1.restaurantSettings)
            .where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, existingOrder.restaurantId))
            .limit(1);
        const orderType = existingOrder.orderType || 'delivery';
        if (orderType === 'takeaway') {
            finalDuration = settings?.maxTakeAwayTime ?? 25;
        }
        else if (orderType === 'dine_in') {
            finalDuration = settings?.maxDineInTime ?? 25;
        }
        else {
            finalDuration = settings?.maxDeliveryTime ?? 25;
        }
    }
    if (finalDuration < 0) {
        throw new BadRequest_1.BadRequest('Invalid duration value');
    }
    await connection_1.db.update(schema_1.orders)
        .set({ durationOrderPreparing: finalDuration, updatedAt: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId));
    return (0, response_1.SuccessResponse)(res, {
        message: 'Order preparing duration updated successfully',
        durationOrderPreparing: finalDuration
    });
};
exports.setOrderPreparingDuration = setOrderPreparingDuration;
// جلب أسباب الإلغاء حسب النوع (user أو restaurant)
const getReasons = async (req, res) => {
    const type = req.query.type;
    // Default to "restaurant" if type is not provided or not "user"
    const targetType = type === "user" ? "user" : "restaurant";
    const reasons = await connection_1.db
        .select()
        .from(selectReasons_1.selectReasons)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(selectReasons_1.selectReasons.status, "active"), (0, drizzle_orm_1.eq)(selectReasons_1.selectReasons.type, targetType)));
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
            id: schema_1.zones.id,
            name: schema_1.zones.name
        },
        paymentMethodData: {
            id: schema_1.paymentMethods.id,
            name: schema_1.paymentMethods.name,
            nameAr: schema_1.paymentMethods.nameAr,
        },
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.orders.userId, schema_1.users.id))
        .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.orders.branchId, schema_1.branches.id))
        .leftJoin(schema_1.restaurants, (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, schema_1.restaurants.id))
        .leftJoin(schema_1.addresses, (0, drizzle_orm_1.eq)(schema_1.orders.addressId, schema_1.addresses.id))
        .leftJoin(schema_1.restaurantZoneDeliveryFees, (0, drizzle_orm_1.eq)(schema_1.orders.zoneId, schema_1.restaurantZoneDeliveryFees.id))
        .leftJoin(schema_1.zones, (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.zoneId, schema_1.zones.id))
        .leftJoin(schema_1.paymentMethods, (0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, schema_1.paymentMethods.id))
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
    // 🟢 فك تشفير JSON للـ shippingAddress والـ branchSnapshot
    let shippingAddressData = orderDetail.order.shippingAddress;
    if (typeof shippingAddressData === "string") {
        try {
            shippingAddressData = JSON.parse(shippingAddressData);
            if (typeof shippingAddressData === "string") {
                shippingAddressData = JSON.parse(shippingAddressData);
            }
        }
        catch (e) {
            console.error("Error parsing shippingAddress for PDF:", e);
        }
    }
    let branchSnapshotData = orderDetail.order.branchSnapshot;
    if (typeof branchSnapshotData === "string") {
        try {
            branchSnapshotData = JSON.parse(branchSnapshotData);
            if (typeof branchSnapshotData === "string") {
                branchSnapshotData = JSON.parse(branchSnapshotData);
            }
        }
        catch (e) {
            console.error("Error parsing branchSnapshot for PDF:", e);
        }
    }
    // ==========================================
    // 🗺️ Fallback: استنتاج الزون والفرع للـ PDF من السناب شوت أو إحداثيات العنوان
    // ==========================================
    let pdfZoneName = branchSnapshotData?.zoneName || shippingAddressData?.addressZoneName || shippingAddressData?.addressZoneNameAr || orderDetail.zone?.name || "";
    let pdfZoneId = branchSnapshotData?.zoneId || shippingAddressData?.addressZoneId || orderDetail.zone?.id || null;
    const addrLat = shippingAddressData?.lat ? parseFloat(String(shippingAddressData.lat)) : (orderDetail.address?.lat ? parseFloat(String(orderDetail.address.lat)) : null);
    const addrLng = shippingAddressData?.lng ? parseFloat(String(shippingAddressData.lng)) : (orderDetail.address?.lng ? parseFloat(String(orderDetail.address.lng)) : null);
    if (!pdfZoneName && addrLat !== null && addrLng !== null && !isNaN(addrLat) && !isNaN(addrLng)) {
        const detected = await (0, zone_helper_1.resolveZoneFromCoords)(addrLat, addrLng, orderDetail.order.restaurantId);
        if (detected) {
            pdfZoneName = detected.name;
            pdfZoneId = detected.id;
        }
    }
    let pdfBranchName = branchSnapshotData?.name || orderDetail.branch?.name || "";
    if (!pdfBranchName && pdfZoneId && orderDetail.order.restaurantId) {
        const [matchedBranch] = await connection_1.db
            .select({ name: schema_1.branches.name })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, orderDetail.order.restaurantId), (0, drizzle_orm_1.eq)(schema_1.branches.zoneId, pdfZoneId), (0, drizzle_orm_1.eq)(schema_1.branches.status, "active")))
            .limit(1);
        if (matchedBranch) {
            pdfBranchName = matchedBranch.name;
        }
    }
    // 2. جلب أصناف الأكل والتفاصيل (Variations)
    const items = await connection_1.db.select({
        quantity: schema_1.orderItems.quantity,
        basePrice: schema_1.orderItems.basePrice,
        variationsPrice: schema_1.orderItems.variationsPrice,
        totalPrice: schema_1.orderItems.totalPrice,
        variations: schema_1.orderItems.variations,
        foodName: schema_1.food.name,
        foodNameAr: schema_1.food.nameAr,
    })
        .from(schema_1.orderItems)
        .leftJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.orderItems.foodId, schema_1.food.id))
        .where((0, drizzle_orm_1.eq)(schema_1.orderItems.orderId, orderId));
    // تجهيز تفاصيل الفارييشنز وحساب السعر وربطه بالاسم
    const formattedItems = await Promise.all(items.map(async (item) => {
        let cleanVariations = item.variations;
        if (typeof cleanVariations === 'string') {
            try {
                cleanVariations = JSON.parse(cleanVariations);
                if (typeof cleanVariations === 'string')
                    cleanVariations = JSON.parse(cleanVariations);
            }
            catch (error) { }
        }
        let varDetails = [];
        let totalCalculatedVarPrice = 0;
        if (Array.isArray(cleanVariations) && cleanVariations.length > 0) {
            await Promise.all(cleanVariations.map(async (v) => {
                if (v.optionId) {
                    const [optDb] = await connection_1.db.select().from(schema_1.variationOptions).where((0, drizzle_orm_1.eq)(schema_1.variationOptions.id, v.optionId)).limit(1);
                    if (optDb) {
                        const resolvedArabicName = (typeof optDb.optionNameAr === "string" && optDb.optionNameAr.trim()) ? optDb.optionNameAr :
                            (typeof v.optionNameAr === "string" && v.optionNameAr.trim()) ? v.optionNameAr :
                                (typeof v.valueAr === "string" && v.valueAr.trim()) ? v.valueAr :
                                    (typeof v.option?.optionNameAr === "string" && v.option.optionNameAr.trim()) ? v.option.optionNameAr :
                                        "";
                        const resolvedEnglishName = optDb.optionName ||
                            v.optionName ||
                            v.value ||
                            v.option?.optionName ||
                            v.option?.value ||
                            "Extra";
                        const name = resolvedArabicName || resolvedEnglishName;
                        const price = parseFloat(optDb.price || optDb.additionalPrice || "0");
                        varDetails.push({ name, price });
                        totalCalculatedVarPrice += price;
                    }
                }
            }));
        }
        const finalVarPrice = parseFloat(item.variationsPrice || "0") > 0 ? parseFloat(item.variationsPrice || "0") : totalCalculatedVarPrice;
        const finalTotalPrice = (parseFloat(item.basePrice || "0") + finalVarPrice) * item.quantity;
        return {
            ...item,
            finalTotalPrice,
            variationDetails: varDetails
        };
    }));
    // 3. جلب اسم وسيلة الدفع بدل الـ ID
    let pmDetails = (0, order_helper_1.resolvePaymentMethodDetails)(orderDetail.order.paymentMethod, orderDetail.paymentMethodData?.name, orderDetail.paymentMethodData?.nameAr);
    if (!pmDetails.name && orderDetail.order.paymentMethod && orderDetail.order.paymentMethod.length === 36) {
        try {
            const [pm] = await connection_1.db.select({
                id: schema_1.paymentMethods.id,
                name: schema_1.paymentMethods.name,
                nameAr: schema_1.paymentMethods.nameAr,
            }).from(schema_1.paymentMethods).where((0, drizzle_orm_1.eq)(schema_1.paymentMethods.id, orderDetail.order.paymentMethod)).limit(1);
            if (pm) {
                pmDetails = {
                    id: pm.id,
                    name: pm.name,
                    nameAr: pm.nameAr,
                };
            }
        }
        catch (error) {
            console.error("Error fetching payment method for PDF:", error);
        }
    }
    const paymentName = pmDetails.name || pmDetails.nameAr || "Unknown";
    // 4. إنشاء الـ PDF بحجم إيصال حراري
    const doc = new pdfkit_1.default({ margin: 20, size: [250, 600] });
    // تسجيل خط يدعم اللغة العربية بكافة تشكيلاتها
    const cairoPath = path_1.default.join(process.cwd(), 'assets', 'fonts', 'Cairo-Regular.ttf');
    const fontPath = path_1.default.join(process.cwd(), 'assets', 'fonts', 'Arial.ttf');
    const chosenFontPath = fs_1.default.existsSync(cairoPath) ? cairoPath : (fs_1.default.existsSync(fontPath) ? fontPath : null);
    if (chosenFontPath) {
        doc.registerFont('CairoFont', chosenFontPath);
        doc.font('CairoFont');
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Receipt_${orderDetail.order.dailyOrderNumber}.pdf"`);
    doc.pipe(res);
    // Header
    doc.fontSize(16).text((0, fixArabic_1.fixArabicText)(orderDetail.restaurant?.name) || 'Restaurant', { align: 'center' });
    if (pdfBranchName) {
        doc.fontSize(12).text((0, fixArabic_1.fixArabicText)(pdfBranchName), { align: 'center' });
    }
    doc.moveDown(0.5);
    doc.moveTo(10, doc.y).lineTo(240, doc.y).dash(2, { space: 2 }).stroke();
    doc.undash();
    doc.moveDown(0.5);
    // Order Info
    doc.fontSize(10);
    doc.text(`Order #: ${orderDetail.order.dailyOrderNumber}`);
    const orderDate = new Date(orderDetail.order.createdAt || new Date());
    // ✅ تحويل الوقت والتاريخ لتوقيت القاهرة بشكل صريح
    const cairoTimeStr = orderDate.toLocaleTimeString("en-US", { timeZone: "Africa/Cairo" });
    const cairoDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(orderDate);
    doc.text(`Date: ${cairoDateStr}`);
    doc.text(`Time: ${cairoTimeStr}`);
    doc.text(`Branch: ${(0, fixArabic_1.fixArabicText)(pdfBranchName) || 'N/A'}`);
    doc.text(`Client: ${(0, fixArabic_1.fixArabicText)(orderDetail.customer?.name) || 'Guest'}`);
    doc.text(`Phone: ${shippingAddressData?.phone || orderDetail.customer?.phone || 'N/A'}`);
    doc.text(`Order Type: ${orderDetail.order.orderType}`);
    doc.text(`Payment: ${(0, fixArabic_1.fixArabicText)(paymentName)}`);
    doc.moveDown(0.5);
    doc.moveTo(10, doc.y).lineTo(240, doc.y).dash(2, { space: 2 }).stroke();
    doc.undash();
    doc.moveDown(0.5);
    // Delivery Address if applicable
    if (orderDetail.order.orderType === 'delivery') {
        const hasSnapshotAddress = shippingAddressData && typeof shippingAddressData === 'object';
        const hasLiveAddress = !!orderDetail.address;
        if (hasSnapshotAddress || hasLiveAddress) {
            const addrStreet = shippingAddressData?.street || orderDetail.address?.street || '';
            const addrBuilding = shippingAddressData?.building || orderDetail.address?.number || '';
            const addrFloor = shippingAddressData?.floor || orderDetail.address?.floor || '';
            const addrApartment = shippingAddressData?.apartment || orderDetail.address?.apartment || '';
            const addrLandmark = shippingAddressData?.landmark || orderDetail.address?.landmark || '';
            const addrFull = shippingAddressData?.fulladdress || '';
            doc.text('Delivery Address:', { underline: true });
            if (pdfZoneName)
                doc.text(`Zone: ${(0, fixArabic_1.fixArabicText)(pdfZoneName)}`);
            if (addrStreet)
                doc.text(`Street: ${(0, fixArabic_1.fixArabicText)(addrStreet)}`);
            let details = '';
            if (addrBuilding)
                details += `Bldg: ${(0, fixArabic_1.fixArabicText)(addrBuilding)}`;
            if (addrFloor)
                details += `${details ? ' | ' : ''}Floor: ${(0, fixArabic_1.fixArabicText)(addrFloor)}`;
            if (addrApartment)
                details += `${details ? ' | ' : ''}Apt: ${(0, fixArabic_1.fixArabicText)(addrApartment)}`;
            if (details)
                doc.text(details);
            if (addrLandmark)
                doc.text(`Landmark: ${(0, fixArabic_1.fixArabicText)(addrLandmark)}`);
            if (addrFull && !addrStreet)
                doc.text(`Address: ${(0, fixArabic_1.fixArabicText)(addrFull)}`);
            doc.moveDown(0.5);
            doc.moveTo(10, doc.y).lineTo(240, doc.y).dash(2, { space: 2 }).stroke();
            doc.undash();
            doc.moveDown(0.5);
        }
    }
    // Items Header
    const itemStartY = doc.y;
    doc.text('Item', 10, itemStartY, { width: 95 });
    doc.text('Qty', 105, itemStartY, { width: 30, align: 'right' });
    doc.text('Price', 135, itemStartY, { width: 45, align: 'right' });
    doc.text('Total', 180, itemStartY, { width: 60, align: 'right' });
    doc.moveDown(0.2);
    doc.moveTo(10, doc.y).lineTo(240, doc.y).stroke();
    doc.moveDown(0.5);
    // Items Loop
    for (const item of formattedItems) {
        const currentY = doc.y;
        const name = (0, fixArabic_1.fixArabicText)(item.foodNameAr || item.foodName) || 'Item';
        doc.text(name, 10, currentY, { width: 95 });
        const nextY = doc.y;
        doc.text(item.quantity.toString(), 105, currentY, { width: 30, align: 'right' });
        doc.text(parseFloat(item.basePrice).toFixed(2), 135, currentY, { width: 45, align: 'right' });
        doc.text(item.finalTotalPrice.toFixed(2), 180, currentY, { width: 60, align: 'right' });
        doc.y = nextY;
        // طباعة الفارييشنز تحت الصنف مع عرض السعر
        if (item.variationDetails.length > 0) {
            doc.fontSize(8);
            for (const v of item.variationDetails) {
                const vY = doc.y;
                const vName = (0, fixArabic_1.fixArabicText)(v.name);
                doc.text(`  + ${vName}`, 10, vY, { width: 120 });
                if (v.price > 0) {
                    doc.text(v.price.toFixed(2), 135, vY, { width: 45, align: 'right' });
                }
            }
            doc.fontSize(10);
        }
        doc.moveDown(0.5);
    }
    doc.moveTo(10, doc.y).lineTo(240, doc.y).stroke();
    doc.moveDown(0.5);
    // Totals
    const subtotal = parseFloat(orderDetail.order.subtotal).toFixed(2);
    const deliveryFee = parseFloat(orderDetail.order.deliveryFee).toFixed(2);
    const serviceFee = parseFloat(orderDetail.order.serviceFee).toFixed(2);
    const total = parseFloat(orderDetail.order.totalAmount).toFixed(2);
    doc.text(`Total Product Price`, 10, doc.y, { continued: true }).text(`${subtotal}`, { align: 'right' });
    doc.text(`Delivery Fee`, 10, doc.y, { continued: true }).text(`${deliveryFee}`, { align: 'right' });
    doc.text(`Service Fee`, 10, doc.y, { continued: true }).text(`${serviceFee}`, { align: 'right' });
    doc.moveDown(0.5);
    doc.moveTo(10, doc.y).lineTo(240, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(14).text(`Grand Total`, 10, doc.y, { continued: true }).text(`${total}`, { align: 'right' });
    doc.moveDown(1);
    doc.fontSize(10).text('Thank you for your order', { align: 'center' });
    doc.fontSize(8).text('Powered by keeto', { align: 'center' });
    doc.end();
};
exports.generateOrderInvoicePDF = generateOrderInvoicePDF;
// ==========================================
// إنشاء تقرير شامل للطلبات والمبيعات بصيغة PDF
// ==========================================
const generateOrdersReportPDF = async (req, res) => {
    if (!req.user) {
        throw new Errors_1.UnauthorizedError("Not authenticated");
    }
    const adminRestaurantId = req.user.restaurantId || req.user.id;
    const adminBranchId = req.user.branchId;
    if (!adminRestaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID not found");
    }
    // 1. جلب بيانات المطعم
    const [restaurant] = await connection_1.db
        .select({
        id: schema_1.restaurants.id,
        name: schema_1.restaurants.name,
        nameAr: schema_1.restaurants.nameAr,
        logo: schema_1.restaurants.logo,
        ownerPhone: schema_1.restaurants.ownerPhone,
        address: schema_1.restaurants.address,
        addressAr: schema_1.restaurants.addressAr,
    })
        .from(schema_1.restaurants)
        .where((0, drizzle_orm_1.eq)(schema_1.restaurants.id, adminRestaurantId))
        .limit(1);
    if (!restaurant)
        throw new NotFound_1.NotFound("Restaurant not found");
    // 2. جلب جميع فروع المطعم
    const allBranches = await connection_1.db
        .select({ id: schema_1.branches.id, name: schema_1.branches.name, nameAr: schema_1.branches.nameAr })
        .from(schema_1.branches)
        .where((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, adminRestaurantId));
    // 3. بناء شروط الاستعلام مطابقة تماماً لـ getRestaurantOrders
    const conditions = [
        (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, adminRestaurantId),
        (0, order_helper_1.excludeUnpaidVisaOrders)(),
    ];
    const queryBranchId = req.query?.branchId?.trim();
    const filterBranchId = adminBranchId || (queryBranchId && queryBranchId !== "null" && queryBranchId !== "undefined" ? queryBranchId : undefined);
    if (filterBranchId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.branchId, filterBranchId));
    }
    const source = (req.query?.source || req.query?.orderSource)?.trim();
    if (source && source !== "null" && source !== "undefined") {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.orderSource, source));
    }
    const zoneId = req.query?.zoneId?.trim();
    if (zoneId && zoneId !== "null" && zoneId !== "undefined") {
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.orders.zoneId, zoneId), (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.zoneId, zoneId), (0, drizzle_orm_1.eq)(schema_1.zones.id, zoneId)));
    }
    const cityId = req.query?.cityId?.trim();
    if (cityId && cityId !== "null" && cityId !== "undefined") {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.zones.cityId, cityId));
    }
    const dateConditions = await (0, order_helper_1.buildOrderDateConditions)(req, adminRestaurantId, req.user.type === "owner" || req.user.type === "branch_manager"
        ? true
        : await (async () => {
            const { checkUserPermission } = await Promise.resolve().then(() => __importStar(require("../../middlewares/hasPermission")));
            return checkUserPermission(req.user.id, "order", "advanced_filter");
        })());
    conditions.push(...dateConditions);
    const discountAndPaymentConditions = (0, order_helper_1.buildOrderDiscountAndPaymentConditions)(req);
    conditions.push(...discountAndPaymentConditions);
    const userAndTypeConditions = (0, order_helper_1.buildOrderUserAndTypeConditions)(req);
    conditions.push(...userAndTypeConditions);
    const statusConditions = (0, order_helper_1.buildOrderStatusConditions)(req);
    conditions.push(...statusConditions);
    const cancellationConditions = (0, order_helper_1.buildOrderCancellationConditions)(req, {
        enforceCancelledStatusIfFiltered: true,
    });
    conditions.push(...cancellationConditions);
    // 4. استخراج أوصاف الفلاتر المطبقة بالعربية والإنجليزية
    let branchLabel = `All Branches (${allBranches.length})`;
    let branchLabelAr = `جميع الفروع (${allBranches.length})`;
    if (filterBranchId) {
        const foundBranch = allBranches.find(b => b.id === filterBranchId);
        branchLabel = foundBranch?.name || filterBranchId;
        branchLabelAr = foundBranch?.nameAr || foundBranch?.name || filterBranchId;
    }
    let dateRangeLabel = "Current Active Shift";
    let dateRangeLabelAr = "الشيفت النشط لليوم الحالي";
    if (req.query?.startDate || req.query?.endDate) {
        const s = req.query?.startDate ? String(req.query.startDate) : "Start";
        const e = req.query?.endDate ? String(req.query.endDate) : "Now";
        dateRangeLabel = `${s} to ${e}`;
        dateRangeLabelAr = `من: ${s} إلى: ${e}`;
    }
    else if (req.query?.date) {
        dateRangeLabel = `Date: ${req.query.date}`;
        dateRangeLabelAr = `يوم: ${req.query.date}`;
    }
    const rawStatus = (req.query?.status || req.query?.orderStatus);
    let statusLabel = "All Statuses";
    let statusLabelAr = "جميع الحالات";
    if (rawStatus) {
        const statusArr = Array.isArray(rawStatus) ? rawStatus : String(rawStatus).split(",").map(s => s.trim()).filter(Boolean);
        if (statusArr.length > 0 && !statusArr.includes("all")) {
            statusLabel = statusArr.map(s => ordersReportPdfService_1.ORDER_STATUS_LABELS[s]?.en || s).join(", ");
            statusLabelAr = statusArr.map(s => ordersReportPdfService_1.ORDER_STATUS_LABELS[s]?.ar || s).join("، ");
        }
    }
    const rawPm = (req.query?.paymentMethod || req.query?.payment_method || req.query?.paymentMethods);
    let paymentMethodLabel = "All Payment Methods";
    let paymentMethodLabelAr = "جميع طرق الدفع";
    if (rawPm) {
        const pmArr = Array.isArray(rawPm) ? rawPm : String(rawPm).split(",").map(p => p.trim()).filter(Boolean);
        if (pmArr.length > 0 && !pmArr.includes("all")) {
            paymentMethodLabel = pmArr.join(", ");
            paymentMethodLabelAr = pmArr.join("، ");
        }
    }
    const rawOrderType = req.query?.orderType;
    let orderTypeLabel = "All Order Types";
    let orderTypeLabelAr = "جميع أنواع الطلبات";
    if (rawOrderType) {
        const otArr = Array.isArray(rawOrderType) ? rawOrderType : String(rawOrderType).split(",").map(t => t.trim()).filter(Boolean);
        if (otArr.length > 0 && !otArr.includes("all")) {
            orderTypeLabel = otArr.map(t => ordersReportPdfService_1.ORDER_TYPE_LABELS[t]?.en || t).join(", ");
            orderTypeLabelAr = otArr.map(t => ordersReportPdfService_1.ORDER_TYPE_LABELS[t]?.ar || t).join("، ");
        }
    }
    let orderSourceLabel = "All Sources";
    let orderSourceLabelAr = "جميع المصادر";
    if (source && source !== "all") {
        orderSourceLabel = ordersReportPdfService_1.ORDER_SOURCE_LABELS[source]?.en || source;
        orderSourceLabelAr = ordersReportPdfService_1.ORDER_SOURCE_LABELS[source]?.ar || source;
    }
    // 5. جلب بيانات الأوردرات المطابقة
    const rawOrders = await connection_1.db
        .select({
        id: schema_1.orders.id,
        orderNumber: schema_1.orders.orderNumber,
        dailyOrderNumber: schema_1.orders.dailyOrderNumber,
        customerName: schema_1.users.name,
        customerPhone: schema_1.users.phone,
        branchId: schema_1.orders.branchId,
        branchName: schema_1.branches.name,
        branchNameAr: schema_1.branches.nameAr,
        orderType: schema_1.orders.orderType,
        orderSource: schema_1.orders.orderSource,
        paymentMethod: schema_1.orders.paymentMethod,
        paymentMethodName: schema_1.paymentMethods.name,
        paymentMethodNameAr: schema_1.paymentMethods.nameAr,
        subtotal: schema_1.orders.subtotal,
        deliveryFee: schema_1.orders.deliveryFee,
        serviceFee: schema_1.orders.serviceFee,
        discountAmount: schema_1.orders.discountAmount,
        totalAmount: schema_1.orders.totalAmount,
        status: schema_1.orders.status,
        createdAt: schema_1.orders.createdAt,
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.orders.userId, schema_1.users.id))
        .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.orders.branchId, schema_1.branches.id))
        .leftJoin(schema_1.restaurantZoneDeliveryFees, (0, drizzle_orm_1.eq)(schema_1.orders.zoneId, schema_1.restaurantZoneDeliveryFees.id))
        .leftJoin(schema_1.zones, (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.zoneId, schema_1.zones.id), (0, drizzle_orm_1.eq)(schema_1.orders.zoneId, schema_1.zones.id)))
        .leftJoin(schema_1.paymentMethods, (0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, schema_1.paymentMethods.id))
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.orders.createdAt));
    // 6. تحديد اللغة المطلوبة (الافتراضي عربي إلا لو تم إرسال lang=en)
    const langParam = (req.query?.lang || "").trim().toLowerCase();
    const lang = langParam === "en" ? "en" : "ar";
    // 7. بناء وتوليد التقرير بصيغة PDF
    await (0, ordersReportPdfService_1.buildOrdersReportPDF)({
        res,
        restaurant,
        filters: {
            branchLabel,
            branchLabelAr,
            dateRangeLabel,
            dateRangeLabelAr,
            statusLabel,
            statusLabelAr,
            paymentMethodLabel,
            paymentMethodLabelAr,
            orderTypeLabel,
            orderTypeLabelAr,
            orderSourceLabel,
            orderSourceLabelAr,
            searchLabel: req.query?.search ? String(req.query.search) : undefined,
        },
        orders: rawOrders,
        generatedBy: req.user?.name || req.user?.email || req.user?.type || "Admin",
        lang,
    });
};
exports.generateOrdersReportPDF = generateOrdersReportPDF;
const getallnumbersoforders = async (req, res) => {
    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    const adminBranchId = req.user?.branchId; // لو Null يبقى ده المالك
    if (!adminRestaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    // بناء الـ Query الأساسي
    const conditions = [
        (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, adminRestaurantId),
        // ✅ إخفاء طلبات الفيزا المعلقة أو الفاشلة — تظهر فقط لما paymentStatus = 'paid'
        (0, order_helper_1.excludeUnpaidVisaOrders)(),
    ];
    const queryBranchId = req.query?.branchId?.trim();
    const filterBranchId = adminBranchId || (queryBranchId && queryBranchId !== "null" && queryBranchId !== "undefined" ? queryBranchId : undefined);
    if (filterBranchId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.branchId, filterBranchId));
    }
    const source = (req.query?.source || req.query?.orderSource)?.trim();
    if (source && source !== "null" && source !== "undefined") {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.orderSource, source));
    }
    const zoneId = req.query?.zoneId?.trim();
    if (zoneId && zoneId !== "null" && zoneId !== "undefined") {
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.orders.zoneId, zoneId), (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.zoneId, zoneId), (0, drizzle_orm_1.eq)(schema_1.zones.id, zoneId)));
    }
    const cityId = req.query?.cityId?.trim();
    if (cityId && cityId !== "null" && cityId !== "undefined") {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.zones.cityId, cityId));
    }
    //-----------------------
    const dateConditions = await (0, order_helper_1.buildOrderDateConditions)(req, adminRestaurantId, req.user.type === "owner" || req.user.type === "branch_manager"
        ? true
        : await (async () => {
            const { checkUserPermission } = await Promise.resolve().then(() => __importStar(require("../../middlewares/hasPermission")));
            return checkUserPermission(req.user.id, "order", "advanced_filter");
        })());
    conditions.push(...dateConditions);
    // ✅ فلترة وسيلة الدفع وأنواع الخصم المتعددة للأرقام الإجمالية
    const discountAndPaymentConditions = (0, order_helper_1.buildOrderDiscountAndPaymentConditions)(req);
    conditions.push(...discountAndPaymentConditions);
    // ✅ فلترة نوع الطلب وبيانات العميل للأرقام الإجمالية
    const userAndTypeConditions = (0, order_helper_1.buildOrderUserAndTypeConditions)(req);
    conditions.push(...userAndTypeConditions);
    // ✅ فلترة الطلبات الملغاة بحسب من قام بالإلغاء للأرقام الإجمالية
    const cancellationConditions = (0, order_helper_1.buildOrderCancellationConditions)(req, {
        enforceCancelledStatusIfFiltered: false,
    });
    conditions.push(...cancellationConditions);
    const statusCountsResult = await connection_1.db
        .select({
        status: schema_1.orders.status,
        count: (0, drizzle_orm_1.sql) `count(${schema_1.orders.id})`,
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.orders.userId, schema_1.users.id))
        .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.orders.branchId, schema_1.branches.id))
        .leftJoin(schema_1.addresses, (0, drizzle_orm_1.eq)(schema_1.orders.addressId, schema_1.addresses.id))
        .leftJoin(schema_1.restaurantZoneDeliveryFees, (0, drizzle_orm_1.eq)(schema_1.orders.zoneId, schema_1.restaurantZoneDeliveryFees.id))
        .leftJoin(schema_1.zones, (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.zoneId, schema_1.zones.id))
        .leftJoin(schema_1.paymentMethods, (0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, schema_1.paymentMethods.id))
        .where((0, drizzle_orm_1.and)(...conditions))
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
// ==========================================
// 6. تعيين مندوب توصيل لطلب (Assign Delivery)
// ==========================================
const assignDelivery = async (req, res) => {
    const { orderId } = req.params;
    const { deliveryManId } = req.body;
    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    const adminBranchId = req.user?.branchId;
    if (!deliveryManId)
        throw new BadRequest_1.BadRequest("Delivery Man ID is required");
    // 1. تحقق من الطلب
    const [existingOrder] = await connection_1.db.select().from(schema_1.orders).where((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId)).limit(1);
    if (!existingOrder)
        throw new NotFound_1.NotFound("Order not found");
    if (existingOrder.restaurantId !== adminRestaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    if (adminBranchId && existingOrder.branchId !== adminBranchId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const orderType = existingOrder.orderType || existingOrder.type;
    if (orderType !== "delivery") {
        throw new BadRequest_1.BadRequest("Cannot assign a delivery man to a non-delivery order");
    }
    const [deliveryMan] = await connection_1.db.select().from(schema_1.deliveryMen).where((0, drizzle_orm_1.eq)(schema_1.deliveryMen.id, deliveryManId)).limit(1);
    if (!deliveryMan)
        throw new NotFound_1.NotFound("Delivery Man not found");
    if (deliveryMan.restaurantId !== adminRestaurantId) {
        throw new BadRequest_1.BadRequest("Unauthorized: Delivery man does not belong to your restaurant");
    }
    // 3. تحديث الطلب وإسناد المندوب
    await connection_1.db.update(schema_1.orders)
        .set({ deliveryManId, updatedAt: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId));
    // 4. إرسال إشعار لمندوب التوصيل
    await (0, notifications_1.sendPushNotification)({
        recipientType: "delivery_man",
        recipientId: deliveryManId,
        branchId: existingOrder.branchId || null,
        title: "طلب جديد مُسند إليك",
        body: `تم إسناد الطلب رقم #${existingOrder.dailyOrderNumber || existingOrder.orderNumber} إليك.`,
        data: {
            restaurantId: existingOrder.restaurantId,
            branchId: existingOrder.branchId || null,
            orderId: existingOrder.id,
            orderNumber: existingOrder.orderNumber,
            dailyOrderNumber: existingOrder.dailyOrderNumber,
            status: existingOrder.status,
            type: "ORDER_ASSIGNED",
        },
    });
    return (0, response_1.SuccessResponse)(res, { message: "Delivery man successfully assigned to order" });
};
exports.assignDelivery = assignDelivery;
//=======================================
//  select delivery men
//=======================================
const selectDeliveryMan = async (req, res) => {
    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    const adminBranchId = req.user?.branchId;
    if (!adminRestaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID not found");
    }
    const conditions = [
        (0, drizzle_orm_1.eq)(schema_1.deliveryMen.restaurantId, adminRestaurantId),
        (0, drizzle_orm_1.eq)(schema_1.deliveryMen.isActive, true),
    ];
    if (adminBranchId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.deliveryMen.branchId, adminBranchId));
    }
    const deliveryMenList = await connection_1.db.select({
        id: schema_1.deliveryMen.id,
        name: schema_1.deliveryMen.name,
        phone: schema_1.deliveryMen.phone,
    })
        .from(schema_1.deliveryMen)
        .where((0, drizzle_orm_1.and)(...conditions));
    return (0, response_1.SuccessResponse)(res, { message: "Get delivery men success", data: deliveryMenList });
};
exports.selectDeliveryMan = selectDeliveryMan;
//=======================================
//  select (branch - zone - source)
//=======================================
const getSelectData = async (req, res) => {
    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    const adminBranchId = req.user?.branchId;
    const queryBranchId = req.query?.branchId;
    const filterBranchId = adminBranchId || queryBranchId;
    if (!adminRestaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID not found");
    }
    // 1. شروط الفروع
    const branchConditions = [
        (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, adminRestaurantId),
        (0, drizzle_orm_1.eq)(schema_1.branches.status, "active"),
    ];
    if (adminBranchId) {
        branchConditions.push((0, drizzle_orm_1.eq)(schema_1.branches.id, adminBranchId));
    }
    // 2. شروط المناطق (Zones)
    const zoneConditions = [
        (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.restaurantId, adminRestaurantId),
        (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.status, "active"),
        (0, drizzle_orm_1.eq)(schema_1.zones.status, "active"),
    ];
    if (filterBranchId) {
        zoneConditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.branchId, filterBranchId), (0, drizzle_orm_1.isNull)(schema_1.restaurantZoneDeliveryFees.branchId)));
    }
    // 3. تنفيذ الـ Queries بالتوازي (Branches, Zones, Business Plans, Payment Methods, Discounts, Coupons, First Order Discounts)
    const [branchList, rawZones, businessPlans, dbPaymentMethods, rawDiscounts, rawCoupons, rawFirstOrderDiscounts,] = await Promise.all([
        connection_1.db
            .select({
            id: schema_1.branches.id,
            name: schema_1.branches.name,
            nameAr: schema_1.branches.nameAr,
            nameFr: schema_1.branches.nameFr,
            zoneId: schema_1.branches.zoneId,
        })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)(...branchConditions)),
        connection_1.db
            .select({
            id: schema_1.zones.id,
            name: schema_1.zones.name,
            nameAr: schema_1.zones.nameAr,
            nameFr: schema_1.zones.nameFr,
            displayName: schema_1.zones.displayName,
            displayNameAr: schema_1.zones.displayNameAr,
            displayNameFr: schema_1.zones.displayNameFr,
            cityId: schema_1.restaurantZoneDeliveryFees.cityId,
        })
            .from(schema_1.restaurantZoneDeliveryFees)
            .innerJoin(schema_1.zones, (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.zoneId, schema_1.zones.id))
            .where((0, drizzle_orm_1.and)(...zoneConditions)),
        connection_1.db
            .select({
            platformType: schema_1.restaurantBusinessPlans.platformType,
            aggregatorStatus: schema_1.restaurantBusinessPlans.aggregatorStatus,
            mykeetoStatus: schema_1.restaurantBusinessPlans.mykeetoStatus,
        })
            .from(schema_1.restaurantBusinessPlans)
            .where((0, drizzle_orm_1.eq)(schema_1.restaurantBusinessPlans.restaurantId, adminRestaurantId)),
        connection_1.db
            .select({
            id: schema_1.paymentMethods.id,
            name: schema_1.paymentMethods.name,
            nameAr: schema_1.paymentMethods.nameAr,
        })
            .from(schema_1.paymentMethods)
            .where((0, drizzle_orm_1.eq)(schema_1.paymentMethods.isActive, true)),
        connection_1.db
            .selectDistinct({
            id: schema_1.discounts.id,
            name: schema_1.discounts.name,
            nameAr: schema_1.discounts.nameAr,
            nameFr: schema_1.discounts.nameFr,
            discountType: schema_1.discounts.discountType,
            discountValue: schema_1.discounts.discountValue,
            isGlobal: schema_1.discounts.isGlobal,
        })
            .from(schema_1.discounts)
            .leftJoin(schema_1.discountRestaurants, (0, drizzle_orm_1.eq)(schema_1.discounts.id, schema_1.discountRestaurants.discountId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.discounts.isActive, true), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.discounts.isGlobal, true), (0, drizzle_orm_1.eq)(schema_1.discountRestaurants.restaurantId, adminRestaurantId)))),
        connection_1.db
            .selectDistinct({
            id: schema_1.coupons.id,
            code: schema_1.coupons.code,
            name: schema_1.coupons.name,
            nameAr: schema_1.coupons.nameAr,
            nameFr: schema_1.coupons.nameFr,
            discountType: schema_1.coupons.discountType,
            discountValue: schema_1.coupons.discountValue,
            isGlobal: schema_1.coupons.isGlobal,
        })
            .from(schema_1.coupons)
            .leftJoin(schema_1.couponRestaurants, (0, drizzle_orm_1.eq)(schema_1.coupons.id, schema_1.couponRestaurants.couponId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.coupons.isActive, true), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.couponRestaurants.restaurantId, adminRestaurantId), (0, drizzle_orm_1.eq)(schema_1.coupons.isGlobal, true)))),
        connection_1.db
            .select({
            id: schema_1.firstOrderDiscounts.id,
            name: schema_1.firstOrderDiscounts.name,
            nameAr: schema_1.firstOrderDiscounts.nameAr,
            nameFr: schema_1.firstOrderDiscounts.nameFr,
            discountType: schema_1.firstOrderDiscounts.discountType,
            discountValue: schema_1.firstOrderDiscounts.discountValue,
        })
            .from(schema_1.firstOrderDiscounts)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.firstOrderDiscounts.restaurantId, adminRestaurantId), (0, drizzle_orm_1.eq)(schema_1.firstOrderDiscounts.status, "active"))),
    ]);
    // Deduplicate zones in case multiple fee rules exist for the same zone
    const zoneMap = new Map();
    for (const z of rawZones) {
        if (!zoneMap.has(z.id)) {
            zoneMap.set(z.id, z);
        }
    }
    const zoneList = Array.from(zoneMap.values());
    // 4. جلب المدن المرتبطة بالمناطق
    const cityIds = [...new Set(zoneList.map((z) => z.cityId).filter(Boolean))];
    let cityList = [];
    if (cityIds.length > 0) {
        cityList = await connection_1.db
            .select({
            id: schema_1.cities.id,
            name: schema_1.cities.name,
            nameAr: schema_1.cities.nameAr,
            nameFr: schema_1.cities.nameFr,
        })
            .from(schema_1.cities)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.cities.id, cityIds), (0, drizzle_orm_1.eq)(schema_1.cities.status, "active")));
    }
    // 5. تصفية المصادر: إرجاع الكل، وإخفاء my_keeto و food_aggregator فقط لو كانت inactive
    const planMap = new Map(businessPlans.map((p) => [p.platformType, p]));
    const allSources = [
        { id: "online_order_web", name: "Online Order Web", nameAr: "طلب أونلاين ويب", value: "online_order_web" },
        { id: "online_order_app", name: "Online Order App", nameAr: "طلب أونلاين تطبيق", value: "online_order_app" },
        { id: "food_aggregator", name: "Food Aggregator", nameAr: "تطبيقات التوصيل", value: "food_aggregator" },
        { id: "my_keeto", name: "My Keeto", nameAr: "ماي كيتو", value: "my_keeto" },
    ];
    const sources = allSources.filter((source) => {
        // إذا كان المصدر هو food_aggregator
        if (source.value === "food_aggregator") {
            const plan = planMap.get("food_aggregator");
            // ترجع فقط إذا كانت الخطة موجودة وحالتها active
            return plan?.aggregatorStatus === "active";
        }
        // إذا كان المصدر هو my_keeto
        if (source.value === "my_keeto") {
            const plan = planMap.get("mykeeto");
            // ترجع فقط إذا كانت الخطة موجودة وحالتها active
            return plan?.mykeetoStatus === "active";
        }
        // باقي المصادر ترجع دائماً
        return true;
    });
    // 6. قائمة أنواع الخصومات المتاحة للفلترة
    const discountTypes = [
        { id: "product_discount", name: "Product Discount", nameAr: "خصم على منتج / وجبة", value: "product_discount" },
        { id: "discount_id", name: "Restaurant Discount", nameAr: "خصم المطعم", value: "discount_id" },
        { id: "coupon", name: "Coupon", nameAr: "كوبون خصم", value: "coupon" },
        { id: "first_order_discount", name: "First Order Discount", nameAr: "خصم أول طلب", value: "first_order_discount" },
        { id: "free_delivery", name: "Free Delivery", nameAr: "توصيل مجاني", value: "free_delivery" },
        { id: "points", name: "Points Redemption", nameAr: "استبدال نقاط", value: "points" },
    ];
    // 7. قائمة وسائل الدفع (الخيارات الأساسية + وسائل الدفع من قاعدة البيانات)
    const standardPaymentMethods = [
        { id: "cash", name: "Cash on Delivery", nameAr: "الدفع عند الاستلام", value: "cash" },
        { id: "visa", name: "Credit / Debit Card (Visa)", nameAr: "بطاقة بنكية (فيزا)", value: "visa" },
        // { id: "wallet", name: "Wallet", nameAr: "المحفظة", value: "wallet" },
    ];
    const paymentMethodsList = [
        ...standardPaymentMethods,
        ...dbPaymentMethods
            .filter((pm) => !["cash", "visa", "wallet"].includes(pm.id.toLowerCase()))
            .map((pm) => ({
            id: pm.id,
            name: pm.name,
            nameAr: pm.nameAr,
            value: pm.id,
        })),
    ];
    return (0, response_1.SuccessResponse)(res, {
        message: "Get select data success",
        data: {
            branches: branchList,
            zones: zoneList,
            cities: cityList,
            sources,
            paymentMethods: paymentMethodsList,
            discountTypes,
            discounts: rawDiscounts,
            coupons: rawCoupons,
            firstOrderDiscounts: rawFirstOrderDiscounts,
        },
    });
};
exports.getSelectData = getSelectData;
// select branches for transfer order
const getSelectBranches = async (req, res) => {
    if (!req.user) {
        throw new Errors_1.UnauthorizedError("Not authenticated");
    }
    const adminRestaurantId = req.user.restaurantId || req.user.id;
    if (!adminRestaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID not found");
    }
    const branchList = await connection_1.db
        .select({
        id: schema_1.branches.id,
        name: schema_1.branches.name,
        nameAr: schema_1.branches.nameAr,
    })
        .from(schema_1.branches)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, adminRestaurantId), (0, drizzle_orm_1.eq)(schema_1.branches.status, "active")));
    return (0, response_1.SuccessResponse)(res, {
        message: "Get select data success",
        data: {
            branches: branchList,
        },
    });
};
exports.getSelectBranches = getSelectBranches;
// ==========================================
// Transfer Order Branch
// ==========================================
const transferOrderBranch = async (req, res) => {
    if (!req.user) {
        throw new Errors_1.UnauthorizedError("Not authenticated");
    }
    const adminRestaurantId = req.user.restaurantId || req.user.id;
    const adminBranchId = req.user.branchId;
    if (!adminRestaurantId) {
        throw new BadRequest_1.BadRequest("Restaurant ID not found");
    }
    const orderId = req.params.orderId || req.body?.orderId;
    const targetBranchId = req.body?.branchId || req.body?.targetBranchId;
    const note = req.body?.note;
    if (!orderId) {
        throw new BadRequest_1.BadRequest("orderId is required");
    }
    if (!targetBranchId) {
        throw new BadRequest_1.BadRequest("Target branchId is required");
    }
    // 1. Fetch the order
    const [existingOrder] = await connection_1.db
        .select()
        .from(schema_1.orders)
        .where((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId))
        .limit(1);
    if (!existingOrder) {
        throw new NotFound_1.NotFound("Order not found");
    }
    // 2. Authorization checks
    if (existingOrder.restaurantId !== adminRestaurantId) {
        throw new BadRequest_1.BadRequest("Unauthorized: Order does not belong to your restaurant");
    }
    if (adminBranchId && existingOrder.branchId !== adminBranchId) {
        throw new BadRequest_1.BadRequest("Unauthorized: You can only transfer orders belonging to your branch");
    }
    // 3. Verify order status can only be transferred if pending or accepted
    const transferableStatuses = ["pending", "accepted"];
    if (!transferableStatuses.includes(existingOrder.status)) {
        throw new BadRequest_1.BadRequest(`Cannot transfer order with status "${existingOrder.status}". Only pending and accepted orders can be transferred.`);
    }
    // 4. Check if target branch is different from current branch
    if (existingOrder.branchId === targetBranchId) {
        throw new BadRequest_1.BadRequest("Order is already assigned to this branch");
    }
    // 5. Verify target branch exists, is active, and belongs to this restaurant
    const [targetBranchData] = await connection_1.db
        .select({
        branch: schema_1.branches,
        zoneName: schema_1.zones.name,
        zoneNameAr: schema_1.zones.nameAr,
        cityId: schema_1.zones.cityId,
        cityName: schema_1.cities.name,
        cityNameAr: schema_1.cities.nameAr,
    })
        .from(schema_1.branches)
        .leftJoin(schema_1.zones, (0, drizzle_orm_1.eq)(schema_1.branches.zoneId, schema_1.zones.id))
        .leftJoin(schema_1.cities, (0, drizzle_orm_1.eq)(schema_1.zones.cityId, schema_1.cities.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.id, targetBranchId), (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, adminRestaurantId)))
        .limit(1);
    if (!targetBranchData || !targetBranchData.branch) {
        throw new NotFound_1.NotFound("Target branch not found or does not belong to your restaurant");
    }
    const targetBranch = targetBranchData.branch;
    if (targetBranch.status !== "active") {
        throw new BadRequest_1.BadRequest("Cannot transfer order to an inactive branch");
    }
    // 6. Fetch previous branch details if exists
    let previousBranchName = "الفرع السابق";
    let oldBranchDetails = null;
    if (existingOrder.branchId) {
        const [oldBranch] = await connection_1.db
            .select({
            id: schema_1.branches.id,
            name: schema_1.branches.name,
            nameAr: schema_1.branches.nameAr,
            nameFr: schema_1.branches.nameFr,
        })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.eq)(schema_1.branches.id, existingOrder.branchId))
            .limit(1);
        if (oldBranch) {
            previousBranchName = oldBranch.nameAr || oldBranch.name;
            oldBranchDetails = {
                id: oldBranch.id,
                name: oldBranch.name,
                nameAr: oldBranch.nameAr ?? null,
                nameFr: oldBranch.nameFr ?? null,
            };
        }
    }
    // Check if existingOrder already had a branchSnapshot
    let existingBranchSnapshot = existingOrder.branchSnapshot;
    if (typeof existingBranchSnapshot === "string") {
        try {
            existingBranchSnapshot = JSON.parse(existingBranchSnapshot);
            if (typeof existingBranchSnapshot === "string") {
                existingBranchSnapshot = JSON.parse(existingBranchSnapshot);
            }
        }
        catch {
            existingBranchSnapshot = null;
        }
    }
    // Determine oldBranch object containing only { id, name, nameAr, nameFr }
    let oldBranchSnapshot = null;
    if (existingBranchSnapshot && (existingBranchSnapshot.id || existingBranchSnapshot.name)) {
        oldBranchSnapshot = {
            id: existingBranchSnapshot.id || existingOrder.branchId || "",
            name: existingBranchSnapshot.name || previousBranchName,
            nameAr: existingBranchSnapshot.nameAr ?? null,
            nameFr: existingBranchSnapshot.nameFr ?? null,
        };
    }
    else if (oldBranchDetails) {
        oldBranchSnapshot = oldBranchDetails;
    }
    else if (existingOrder.branchId) {
        oldBranchSnapshot = {
            id: existingOrder.branchId,
            name: previousBranchName,
            nameAr: null,
            nameFr: null,
        };
    }
    const previousDeliveryManId = existingOrder.deliveryManId;
    const newBranchName = targetBranch.nameAr || targetBranch.name;
    // Build updated branchSnapshot with target branch data, oldBranch, and note
    const updatedBranchSnapshot = {
        id: targetBranch.id,
        name: targetBranch.name,
        nameAr: targetBranch.nameAr ?? null,
        nameFr: targetBranch.nameFr ?? null,
        address: targetBranch.address,
        addressAr: targetBranch.addressAr ?? null,
        addressFr: targetBranch.addressFr ?? null,
        phone: targetBranch.phoneNumber ?? null,
        status: targetBranch.status ?? null,
        zoneId: targetBranch.zoneId ?? null,
        zoneName: targetBranchData.zoneName ?? null,
        zoneNameAr: targetBranchData.zoneNameAr ?? null,
        cityId: targetBranchData.cityId ?? null,
        cityName: targetBranchData.cityName ?? null,
        cityNameAr: targetBranchData.cityNameAr ?? null,
        note: `تم تحويل الطلب من ${previousBranchName} إلى ${newBranchName}`,
        oldBranch: oldBranchSnapshot,
    };
    await connection_1.db
        .update(schema_1.orders)
        .set({
        branchId: targetBranchId,
        branchSnapshot: updatedBranchSnapshot,
        updatedAt: new Date(),
    })
        .where((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId));
    // 8. Send notification to the SELECTED (TARGET) branch
    const now = new Date();
    const cairoTimeFormatted = new Intl.DateTimeFormat("ar-EG", {
        timeZone: "Africa/Cairo",
        hour: "numeric",
        minute: "numeric",
        hour12: true,
    }).format(now);
    const orderDisplayNumber = existingOrder.dailyOrderNumber || existingOrder.orderNumber;
    const notifTitle = "طلب محوّل إلى فرعكم 🔄";
    const notifBody = `تم تحويل الطلب #${orderDisplayNumber} بقيمة ${existingOrder.totalAmount} ج.م إلى فرعكم (${newBranchName}) من ${previousBranchName} الساعة ${cairoTimeFormatted}.`;
    try {
        await (0, notifications_1.sendPushNotification)({
            recipientType: "restaurant",
            recipientId: adminRestaurantId,
            branchId: targetBranchId,
            title: notifTitle,
            body: notifBody,
            data: {
                type: "order_transferred",
                orderId: existingOrder.id,
                orderNumber: existingOrder.orderNumber,
                dailyOrderNumber: existingOrder.dailyOrderNumber,
                fromBranchId: existingOrder.branchId || null,
                fromBranchName: previousBranchName,
                toBranchId: targetBranchId,
                toBranchName: newBranchName,
                status: existingOrder.status,
                restaurantId: adminRestaurantId,
                branchId: targetBranchId,
            },
        });
    }
    catch (notifErr) {
        console.error("[TRANSFER_ORDER] Error sending push notification to new branch:", notifErr);
    }
    // 9. Notify customer (user) about the transfer if user exists
    // if (existingOrder.userId) {
    //     try {
    //         await sendPushNotification({
    //             recipientType: "user",
    //             recipientId: existingOrder.userId,
    //             branchId: targetBranchId,
    //             title: "تحديث بشأن طلبك | Order Update",
    //             body: `طلبك رقم #${orderDisplayNumber} جاري متابعته وتجهيزه من فرع (${newBranchName}).`,
    //             data: {
    //                 type: "order_transferred",
    //                 orderId: existingOrder.id,
    //                 orderNumber: existingOrder.orderNumber,
    //                 dailyOrderNumber: existingOrder.dailyOrderNumber,
    //                 status: existingOrder.status,
    //                 branchId: targetBranchId,
    //                 restaurantId: adminRestaurantId,
    //             },
    //         });
    //     } catch (userNotifErr) {
    //         console.error("[TRANSFER_ORDER] Error sending push notification to user:", userNotifErr);
    //     }
    // }
    // 10. Notify previous delivery man if order had an assigned delivery man
    if (previousDeliveryManId) {
        try {
            await (0, notifications_1.sendPushNotification)({
                recipientType: "delivery_man",
                recipientId: previousDeliveryManId,
                branchId: existingOrder.branchId || null,
                title: "إلغاء إسناد الطلب",
                body: `تم تحويل الطلب رقم #${orderDisplayNumber} إلى فرع آخر وإلغاء إسناده لك.`,
                data: {
                    type: "order_unassigned",
                    orderId: existingOrder.id,
                    orderNumber: existingOrder.orderNumber,
                },
            });
        }
        catch (dmNotifErr) {
            console.error("[TRANSFER_ORDER] Error sending push notification to delivery man:", dmNotifErr);
        }
    }
    return (0, response_1.SuccessResponse)(res, {
        message: "Order transferred to selected branch successfully",
        data: {
            orderId: existingOrder.id,
            orderNumber: existingOrder.orderNumber,
            dailyOrderNumber: existingOrder.dailyOrderNumber,
            previousBranchId: existingOrder.branchId || null,
            previousBranchName,
            oldBranch: oldBranchSnapshot,
            newBranchId: targetBranchId,
            newBranchName,
            branchId: targetBranchId,
            branch: {
                id: targetBranch.id,
                name: targetBranch.name,
                nameAr: targetBranch.nameAr ?? null,
            },
            branchSnapshot: updatedBranchSnapshot,
            status: existingOrder.status,
        },
    });
};
exports.transferOrderBranch = transferOrderBranch;
