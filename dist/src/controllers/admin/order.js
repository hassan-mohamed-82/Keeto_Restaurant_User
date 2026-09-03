"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSelectData = exports.selectDeliveryMan = exports.assignDelivery = exports.getallnumbersoforders = exports.generateOrderInvoicePDF = exports.getReasons = exports.setOrderPreparingDuration = exports.updateOrderStatus = exports.getRestaurantOrderById = exports.getRefundOrders = exports.getCancelledOrders = exports.getDeliveredOrders = exports.getOutForDeliveryOrders = exports.getPreparingOrders = exports.getAcceptedOrders = exports.getPendingOrders = exports.getOrdersByStatus = exports.getRestaurantOrders = exports.buildOrderDateConditions = exports.getRestaurantShiftStartTime = exports.haversineKm = exports.isPointInPolygon = exports.parseAndNormalizeCoordinates = exports.resolveZoneFromCoords = void 0;
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
const uuid_1 = require("uuid");
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
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, adminRestaurantId)];
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
    const dateConditions = await (0, order_helper_1.buildOrderDateConditions)(req, adminRestaurantId);
    conditions.push(...dateConditions);
    const rawRestaurantOrders = await connection_1.db
        .select({
        id: schema_1.orders.id,
        orderNumber: schema_1.orders.orderNumber,
        dailyOrderNumber: schema_1.orders.dailyOrderNumber,
        customerName: schema_1.users.name,
        customerPhone: schema_1.users.phone,
        alternatePhone: schema_1.users.alternatePhone,
        rating: schema_1.orders.rating,
        ratingComment: schema_1.orders.ratingComment,
        orderType: schema_1.orders.orderType,
        orderSource: schema_1.orders.orderSource,
        paymentMethod: schema_1.orders.paymentMethod,
        subtotal: schema_1.orders.subtotal,
        deliveryFee: schema_1.orders.deliveryFee,
        serviceFee: schema_1.orders.serviceFee,
        appCommission: schema_1.orders.appCommission,
        discountAmount: schema_1.orders.discountAmount,
        couponCode: schema_1.orders.couponCode,
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
        const { addressLat, addressLng, ...rest } = o;
        return {
            ...rest,
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
                }
                : null,
            discount: {
                discountAmount: o.discountAmount ?? "0.00",
                couponCode: o.couponCode ?? null,
                couponName: couponDetails?.name ?? null,
                couponNameAr: couponDetails?.nameAr ?? null,
                couponNameFr: couponDetails?.nameFr ?? null,
            },
        };
    }));
    return (0, response_1.SuccessResponse)(res, { message: "Get orders success", data: restaurantOrders });
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
    const dateConditions = await (0, order_helper_1.buildOrderDateConditions)(req, adminRestaurantId);
    conditions.push(...dateConditions);
    const rawResult = await connection_1.db
        .select({
        id: schema_1.orders.id,
        orderNumber: schema_1.orders.orderNumber,
        dailyOrderNumber: schema_1.orders.dailyOrderNumber,
        customerName: schema_1.users.name,
        customerPhone: schema_1.users.phone,
        alternatePhone: schema_1.users.alternatePhone,
        rating: schema_1.orders.rating,
        ratingComment: schema_1.orders.ratingComment,
        orderType: schema_1.orders.orderType,
        orderSource: schema_1.orders.orderSource,
        paymentMethod: schema_1.orders.paymentMethod,
        subtotal: schema_1.orders.subtotal,
        deliveryFee: schema_1.orders.deliveryFee,
        serviceFee: schema_1.orders.serviceFee,
        appCommission: schema_1.orders.appCommission,
        discountAmount: schema_1.orders.discountAmount,
        couponCode: schema_1.orders.couponCode,
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
        const { addressLat, addressLng, ...rest } = o;
        return {
            ...rest,
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
                }
                : null,
            discount: {
                discountAmount: o.discountAmount ?? "0.00",
                couponCode: o.couponCode ?? null,
                couponName: couponDetails?.name ?? null,
                couponNameAr: couponDetails?.nameAr ?? null,
                couponNameFr: couponDetails?.nameFr ?? null,
            },
        };
    }));
    return (0, response_1.SuccessResponse)(res, { message: `Get ${status} orders success`, data: result });
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
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.orders.userId, schema_1.users.id))
        .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.orders.branchId, schema_1.branches.id))
        .leftJoin(schema_1.restaurants, (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, schema_1.restaurants.id))
        .leftJoin(schema_1.deliveryMen, (0, drizzle_orm_1.eq)(schema_1.orders.deliveryManId, schema_1.deliveryMen.id))
        .leftJoin(schema_1.addresses, (0, drizzle_orm_1.eq)(schema_1.orders.addressId, schema_1.addresses.id))
        .leftJoin(schema_1.restaurantZoneDeliveryFees, (0, drizzle_orm_1.eq)(schema_1.orders.zoneId, schema_1.restaurantZoneDeliveryFees.id))
        .leftJoin(schema_1.zones, (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.zoneId, schema_1.zones.id))
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
                    if (optDb) {
                        optionName = optDb.optionName || optionName;
                        optionNameAr = optDb.optionNameAr || optionNameAr;
                        const price = parseFloat(optDb.price || optDb.additionalPrice || "0");
                        totalCalculatedVarPrice += price;
                    }
                }
                return {
                    ...v,
                    variationId: varId,
                    optionId: optId,
                    variationName,
                    variationNameAr,
                    optionName,
                    optionNameAr
                };
            }));
        }
        const finalVarPrice = parseFloat(item.variationsPrice || "0") > 0 ? parseFloat(item.variationsPrice || "0") : totalCalculatedVarPrice;
        const finalAddonsPrice = parseFloat(item.addonsPrice || "0");
        const finalTotalPrice = (parseFloat(item.basePrice || "0") + finalVarPrice + finalAddonsPrice) * item.quantity;
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
    // 4. جلب بيانات وسيلة الدفع من جدول payment_methods
    let pmDetails = null;
    const pmValue = orderDetail.order.paymentMethod;
    if (pmValue && pmValue.length === 36) {
        try {
            const [pm] = await connection_1.db.select({
                id: schema_1.paymentMethods.id,
                name: schema_1.paymentMethods.name,
                nameAr: schema_1.paymentMethods.nameAr
            }).from(schema_1.paymentMethods).where((0, drizzle_orm_1.eq)(schema_1.paymentMethods.id, pmValue)).limit(1);
            if (pm) {
                pmDetails = {
                    id: pm.id,
                    name: pm.name,
                    nameAr: pm.nameAr,
                };
            }
            else {
                pmDetails = { id: pmValue, name: "Unknown", nameAr: "غير معروف" };
            }
        }
        catch (error) {
            console.error("Error fetching payment method:", error);
            pmDetails = { id: pmValue, name: "Unknown", nameAr: "غير معروف" };
        }
    }
    else {
        switch (pmValue) {
            case "cash_on_delivery":
                pmDetails = { id: pmValue, name: "Cash on Delivery", nameAr: "الدفع عند الاستلام", nameFr: "Paiement à la livraison" };
                break;
            case "visa":
                pmDetails = { id: pmValue, name: "Credit Card", nameAr: "بطاقة", nameFr: "Carte de crédit" };
                break;
            case "wallet":
                pmDetails = { id: pmValue, name: "Wallet", nameAr: "محفظتي", nameFr: "Portefeuille" };
                break;
            default:
                pmDetails = { id: pmValue, name: pmValue, nameAr: pmValue };
        }
    }
    // 5. حساب إجمالي عدد طلبات العميل في هذا المطعم
    let userTotalOrders = 0;
    if (orderDetail.order.userId && restaurantId) {
        const [userPoints] = await connection_1.db
            .select({ totalOrders: schema_1.userRestaurantPoints.totalOrders })
            .from(schema_1.userRestaurantPoints)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userRestaurantPoints.userId, orderDetail.order.userId), (0, drizzle_orm_1.eq)(schema_1.userRestaurantPoints.restaurantId, restaurantId)));
        userTotalOrders = Number(userPoints?.totalOrders || 0);
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
            // ✅ فصلنا الداتا عشان الرياكت ميضربش ويقرأ الـ ID زي ما هو متعود
            paymentMethod: typeof pmDetails === "object" && pmDetails !== null ? pmDetails.id : pmDetails,
            paymentMethodName: typeof pmDetails === "object" && pmDetails !== null ? pmDetails.name : pmDetails,
            paymentMethodNameAr: typeof pmDetails === "object" && pmDetails !== null ? pmDetails.nameAr : pmDetails,
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
    const { status, cancelReasonId, customReason } = req.body;
    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    const adminBranchId = req.user?.branchId;
    if (!status)
        throw new BadRequest_1.BadRequest("Status is required");
    const [existingOrder] = await connection_1.db.select().from(schema_1.orders).where((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId)).limit(1);
    if (!existingOrder)
        throw new NotFound_1.NotFound("Order not found");
    if (existingOrder.restaurantId !== adminRestaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    if (adminBranchId && existingOrder.branchId !== adminBranchId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const currentStatus = existingOrder.status;
    const finalStatuses = ["delivered", "cancelled", "refund"];
    if (finalStatuses.includes(currentStatus)) {
        throw new BadRequest_1.BadRequest(`Order is already ${currentStatus} and cannot be changed`);
    }
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
    let finalReasonId = null;
    let finalReasonText = null;
    if (status === "cancelled") {
        const inputCustomReason = customReason;
        if (cancelReasonId) {
            const [found] = await connection_1.db.select().from(selectReasons_1.selectReasons)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(selectReasons_1.selectReasons.id, cancelReasonId), (0, drizzle_orm_1.eq)(selectReasons_1.selectReasons.type, "restaurant")))
                .limit(1);
            if (!found)
                throw new BadRequest_1.BadRequest("Invalid cancel reason for restaurant");
            finalReasonId = found.id;
            finalReasonText = (inputCustomReason && inputCustomReason.trim()) ? inputCustomReason.trim() : found.name;
        }
        else if (inputCustomReason && typeof inputCustomReason === "string" && inputCustomReason.trim() !== "") {
            finalReasonId = null;
            finalReasonText = inputCustomReason.trim();
        }
        else {
            throw new BadRequest_1.BadRequest("Cancel reason or cancel reason ID is required when cancelling an order");
        }
    }
    await connection_1.db.transaction(async (tx) => {
        // 1. تحديث حالة الطلب
        await tx.update(schema_1.orders)
            .set({
            status: status,
            cancelReasonId: status === "cancelled" ? finalReasonId : null,
            cancelReason: status === "cancelled" ? finalReasonText : null,
            cancelReasonType: status === "cancelled" ? "restaurant" : null,
            updatedAt: new Date()
        })
            .where((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId));
        // ==========================================
        // 💰 2. الـ Refund لمحفظة العميل (User Wallet) عند الإلغاء
        // ==========================================
        if (status === "cancelled" || status === "rejected") {
            // البحث هل تم الدفع سابقاً بواسطة المحفظة
            const [walletTx] = await tx.select().from(schema_1.userWalletTransactions)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userWalletTransactions.reference, existingOrder.orderNumber), (0, drizzle_orm_1.eq)(schema_1.userWalletTransactions.transactionType, "order_payment"))).limit(1);
            if (walletTx) {
                const [userWallet] = await tx.select().from(schema_1.userWallets)
                    .where((0, drizzle_orm_1.eq)(schema_1.userWallets.userId, existingOrder.userId)).limit(1);
                if (userWallet) {
                    const balanceBefore = parseFloat(userWallet.balance ?? "0.00");
                    const amountToRefund = parseFloat(existingOrder.totalAmount || "0.00");
                    const newBalance = balanceBefore + amountToRefund;
                    // تحديث رصيد محفظة العميل
                    await tx.update(schema_1.userWallets)
                        .set({
                        balance: newBalance.toFixed(2),
                        updatedAt: new Date()
                    })
                        .where((0, drizzle_orm_1.eq)(schema_1.userWallets.id, userWallet.id));
                    // إضافة حركة إرجاع الرصيد (Refund Transaction)
                    await tx.insert(schema_1.userWalletTransactions).values({
                        id: (0, uuid_1.v4)(),
                        userId: existingOrder.userId,
                        paymentMethodId: existingOrder.paymentMethod ?? null,
                        type: "credit",
                        transactionType: "refund",
                        amount: amountToRefund.toFixed(2),
                        balanceBefore: balanceBefore.toFixed(2),
                        reference: existingOrder.orderNumber,
                        status: "approved",
                        createdAt: new Date()
                    });
                }
            }
            // ==========================================
            // 💰 3. التسوية العكسية لمحفظة المطعم (Restaurant Wallet Reversal)
            // ==========================================
            let isCashPayment = false;
            if (existingOrder.paymentMethod) {
                const [payment] = await tx.select().from(schema_1.paymentMethods).where((0, drizzle_orm_1.eq)(schema_1.paymentMethods.id, existingOrder.paymentMethod)).limit(1);
                const pmName = (payment?.name || "").toLowerCase();
                isCashPayment = pmName.includes("cash") || pmName.includes("استلام");
            }
            const appCommission = parseFloat(existingOrder.appCommission || "0");
            const serviceFee = parseFloat(existingOrder.serviceFee || "0");
            const totalAmount = parseFloat(existingOrder.totalAmount || "0");
            const subtotal = parseFloat(existingOrder.subtotal || "0");
            const deliveryFee = parseFloat(existingOrder.deliveryFee || "0");
            const appDues = appCommission + serviceFee;
            const restaurantEarning = subtotal + deliveryFee - appCommission;
            let [restWallet] = await tx.select().from(schema_1.restaurantWallets)
                .where((0, drizzle_orm_1.eq)(schema_1.restaurantWallets.restaurantId, existingOrder.restaurantId)).limit(1);
            if (!restWallet) {
                await tx.insert(schema_1.restaurantWallets).values({ id: (0, uuid_1.v4)(), restaurantId: existingOrder.restaurantId });
                [restWallet] = await tx.select().from(schema_1.restaurantWallets)
                    .where((0, drizzle_orm_1.eq)(schema_1.restaurantWallets.restaurantId, existingOrder.restaurantId)).limit(1);
            }
            let currentBalance = parseFloat(restWallet.balance || "0");
            let currentCollectedCash = parseFloat(restWallet.collectedCash || "0");
            let currentTotalEarning = parseFloat(restWallet.totalEarning || "0");
            if (isCashPayment) {
                currentBalance += appDues;
                currentCollectedCash -= totalAmount;
            }
            else {
                currentBalance -= restaurantEarning;
            }
            currentTotalEarning -= restaurantEarning;
            const balanceAfterPenalty = currentBalance - appDues;
            await tx.update(schema_1.restaurantWallets)
                .set({
                balance: balanceAfterPenalty.toFixed(2),
                collectedCash: currentCollectedCash.toFixed(2),
                totalEarning: currentTotalEarning.toFixed(2),
                updatedAt: new Date()
            })
                .where((0, drizzle_orm_1.eq)(schema_1.restaurantWallets.restaurantId, existingOrder.restaurantId));
            await tx.insert(schema_1.restaurantWalletTransactions).values({
                id: (0, uuid_1.v4)(),
                restaurantId: existingOrder.restaurantId,
                type: "order_payment",
                amount: `-${appDues.toFixed(2)}`,
                balanceBefore: currentBalance.toFixed(2),
                balanceAfter: balanceAfterPenalty.toFixed(2),
                method: existingOrder.paymentMethod,
                reference: existingOrder.orderNumber,
                note: `Order Reversal & Penalty: Cancelled by restaurant. Commission deducted: ${appDues}`,
                createdAt: new Date()
            });
        }
        // ==========================================
        // ⭐ LOYALTY POINTS: إضافة نقاط المطعم عند التوصيل (DELIVERED)
        // ==========================================
        if (status === "delivered") {
            const items = await tx
                .select({ foodId: schema_1.orderItems.foodId, quantity: schema_1.orderItems.quantity })
                .from(schema_1.orderItems)
                .where((0, drizzle_orm_1.eq)(schema_1.orderItems.orderId, orderId));
            if (items.length > 0) {
                const foodIds = items.map(i => i.foodId);
                const enrolledRows = await tx
                    .select({ foodId: schema_1.pointsProducts.foodId, isActive: schema_1.pointsProducts.isActive })
                    .from(schema_1.pointsProducts)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.pointsProducts.restaurantId, existingOrder.restaurantId), (0, drizzle_orm_1.inArray)(schema_1.pointsProducts.foodId, foodIds)));
                const enrolledMap = new Map(enrolledRows.filter(r => r.isActive).map(r => [r.foodId, true]));
                if (enrolledMap.size > 0) {
                    const enrolledFoodIds = foodIds.filter(id => enrolledMap.has(id));
                    const foodPoints = await tx
                        .select({ id: schema_1.food.id, points: schema_1.food.points })
                        .from(schema_1.food)
                        .where((0, drizzle_orm_1.inArray)(schema_1.food.id, enrolledFoodIds));
                    const foodPointsMap = new Map(foodPoints.map(f => [f.id, f.points ?? 0]));
                    let totalPointsEarned = 0;
                    for (const item of items) {
                        if (enrolledMap.has(item.foodId)) {
                            totalPointsEarned += (foodPointsMap.get(item.foodId) ?? 0) * item.quantity;
                        }
                    }
                    if (totalPointsEarned > 0) {
                        let [userPointRecord] = await tx
                            .select()
                            .from(schema_1.userRestaurantPoints)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userRestaurantPoints.userId, existingOrder.userId), (0, drizzle_orm_1.eq)(schema_1.userRestaurantPoints.restaurantId, existingOrder.restaurantId)))
                            .limit(1);
                        if (!userPointRecord) {
                            const newPointId = (0, uuid_1.v4)();
                            await tx.insert(schema_1.userRestaurantPoints).values({
                                id: newPointId,
                                userId: existingOrder.userId,
                                restaurantId: existingOrder.restaurantId,
                                points: 0,
                            });
                            [userPointRecord] = await tx
                                .select()
                                .from(schema_1.userRestaurantPoints)
                                .where((0, drizzle_orm_1.eq)(schema_1.userRestaurantPoints.id, newPointId))
                                .limit(1);
                        }
                        const pointsBefore = userPointRecord.points ?? 0;
                        const pointsAfter = pointsBefore + totalPointsEarned;
                        await tx
                            .update(schema_1.userRestaurantPoints)
                            .set({ points: pointsAfter, updatedAt: new Date() })
                            .where((0, drizzle_orm_1.eq)(schema_1.userRestaurantPoints.id, userPointRecord.id));
                        await tx.insert(schema_1.userPointsTransactions).values({
                            id: (0, uuid_1.v4)(),
                            userId: existingOrder.userId,
                            restaurantId: existingOrder.restaurantId,
                            type: "earn",
                            points: totalPointsEarned,
                            balanceBefore: pointsBefore,
                            balanceAfter: pointsAfter,
                            orderId: orderId,
                            note: `Earned ${totalPointsEarned} points from order #${existingOrder.orderNumber}`,
                            createdAt: new Date(),
                        });
                    }
                }
            }
        }
    });
    // ==========================================
    // 4. إرسال الإشعارات للعميل
    // ==========================================
    let messageBody = `Your order ${existingOrder.dailyOrderNumber} is now ${status}.`;
    if (status === "cancelled") {
        messageBody = `Your order ${existingOrder.dailyOrderNumber} was cancelled. Reason: ${finalReasonText || "Not specified"}`;
    }
    await (0, notifications_1.sendPushNotification)({
        recipientType: "user",
        recipientId: existingOrder.userId,
        branchId: existingOrder.branchId || null,
        title: "Order Update",
        body: messageBody,
        data: {
            restaurantId: existingOrder.restaurantId,
            branchId: existingOrder.branchId || null,
            orderId: existingOrder.id,
            orderNumber: existingOrder.orderNumber,
            dailyOrderNumber: existingOrder.dailyOrderNumber,
            status: status,
            type: "ORDER_STATUS_UPDATE"
        }
    });
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
    // إذا لم يرسل الآدمن duration، نعتمد maxDeliveryTime للمطعم
    if (typeof finalDuration !== 'number') {
        const [settings] = await connection_1.db
            .select({ maxDeliveryTime: schema_1.restaurantSettings.maxDeliveryTime })
            .from(schema_1.restaurantSettings)
            .where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, existingOrder.restaurantId))
            .limit(1);
        finalDuration = settings?.maxDeliveryTime ?? 30;
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
        }
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.orders.userId, schema_1.users.id))
        .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.orders.branchId, schema_1.branches.id))
        .leftJoin(schema_1.restaurants, (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, schema_1.restaurants.id))
        .leftJoin(schema_1.addresses, (0, drizzle_orm_1.eq)(schema_1.orders.addressId, schema_1.addresses.id))
        .leftJoin(schema_1.restaurantZoneDeliveryFees, (0, drizzle_orm_1.eq)(schema_1.orders.zoneId, schema_1.restaurantZoneDeliveryFees.id))
        .leftJoin(schema_1.zones, (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.zoneId, schema_1.zones.id))
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
                        const name = optDb.optionName || "Extra";
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
    let paymentName = "Unknown";
    const pmValue = orderDetail.order.paymentMethod;
    if (pmValue && pmValue.length === 36) {
        try {
            const [pm] = await connection_1.db.select({ name: schema_1.paymentMethods.name }).from(schema_1.paymentMethods).where((0, drizzle_orm_1.eq)(schema_1.paymentMethods.id, pmValue)).limit(1);
            if (pm)
                paymentName = pm.name;
            else
                paymentName = pmValue;
        }
        catch (error) {
            console.error("Error fetching payment method for PDF:", error);
            paymentName = "Cash";
        }
    }
    else {
        switch (pmValue) {
            case "cash_on_delivery":
                paymentName = "Cash on Delivery";
                break;
            case "visa":
                paymentName = "Credit Card";
                break;
            case "wallet":
                paymentName = "Wallet";
                break;
            default: paymentName = pmValue || "Unknown";
        }
    }
    // 4. إنشاء الـ PDF بحجم إيصال حراري
    const doc = new pdfkit_1.default({ margin: 20, size: [250, 600] });
    // تسجيل خط يدعم اللغة العربية بكافة تشكيلاتها
    const fontPath = path_1.default.join(process.cwd(), 'assets', 'fonts', 'Arial.ttf');
    const cairoPath = path_1.default.join(process.cwd(), 'assets', 'fonts', 'Cairo-Regular.ttf');
    const chosenFontPath = fs_1.default.existsSync(fontPath) ? fontPath : (fs_1.default.existsSync(cairoPath) ? cairoPath : null);
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
                details += `Bldg: ${addrBuilding}`;
            if (addrFloor)
                details += `${details ? ' | ' : ''}Floor: ${addrFloor}`;
            if (addrApartment)
                details += `${details ? ' | ' : ''}Apt: ${addrApartment}`;
            if (addrLandmark)
                details += `${details ? ' | ' : ''}${(0, fixArabic_1.fixArabicText)(addrLandmark)}`;
            if (details)
                doc.text(details);
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
const getallnumbersoforders = async (req, res) => {
    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    const adminBranchId = req.user?.branchId; // لو Null يبقى ده المالك
    if (!adminRestaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    // بناء الـ Query الأساسي
    const conditions = [
        (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, adminRestaurantId)
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
    const dateConditions = await (0, order_helper_1.buildOrderDateConditions)(req, adminRestaurantId);
    conditions.push(...dateConditions);
    //-----------------------
    const statusCountsResult = await connection_1.db
        .select({
        status: schema_1.orders.status,
        count: (0, drizzle_orm_1.sql) `count(${schema_1.orders.id})`,
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.orders.branchId, schema_1.branches.id))
        .leftJoin(schema_1.addresses, (0, drizzle_orm_1.eq)(schema_1.orders.addressId, schema_1.addresses.id))
        .leftJoin(schema_1.restaurantZoneDeliveryFees, (0, drizzle_orm_1.eq)(schema_1.orders.zoneId, schema_1.restaurantZoneDeliveryFees.id))
        .leftJoin(schema_1.zones, (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.zoneId, schema_1.zones.id))
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
    // 3. تنفيذ الـ Queries بالتوازي (Branches, Zones, Business Plans)
    const [branchList, rawZones, businessPlans] = await Promise.all([
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
    return (0, response_1.SuccessResponse)(res, {
        message: "Get select data success",
        data: {
            branches: branchList,
            zones: zoneList,
            cities: cityList,
            sources,
        },
    });
};
exports.getSelectData = getSelectData;
