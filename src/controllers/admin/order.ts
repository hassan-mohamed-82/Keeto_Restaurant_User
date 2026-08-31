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
    zones,
    cities,
    addons,
    adonescategory,
    pointsProducts,
    userPointsTransactions,
    userRestaurantPoints,
    deliveryMen,
    restaurantZoneDeliveryFees,
    restaurantSettings,
    restaurantSchedules,
    restaurantBusinessPlans,
    discounts,
    coupons,
} from "../../models/schema";
import { eq, and, or, desc, inArray, sql, gte, lte, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";
import { selectReasons } from "../../models/schema/admin/selectReasons";
import { fixArabicText } from "../../utils/fixArabic";
import { sendPushNotification } from "../../utils/notifications";
import { UnauthorizedError } from "../../Errors";
import {
    resolveZoneFromCoords,
    parseAndNormalizeCoordinates,
    isPointInPolygon,
    haversineKm,
} from "../../helpers/zone.helper";
import {
    getRestaurantShiftStartTime,
    buildOrderDateConditions,
} from "../../helpers/order.helper";

export {
    resolveZoneFromCoords,
    parseAndNormalizeCoordinates,
    isPointInPolygon,
    haversineKm,
    getRestaurantShiftStartTime,
    buildOrderDateConditions,
};

// ==========================================
// 3. API Endpoints
// ==========================================

const branchZones = alias(zones, "branch_zones");

export const getRestaurantOrders = async (req: Request, res: Response) => {
    if (!req.user) {
        throw new UnauthorizedError("Not authenticated");
    }

    const adminRestaurantId = req.user.restaurantId || req.user.id;
    const adminBranchId = req.user.branchId;

    if (!adminRestaurantId) {
        throw new BadRequest("Restaurant ID not found");
    }

    const conditions: any[] = [eq(orders.restaurantId, adminRestaurantId)];

    const queryBranchId = (req.query?.branchId as string)?.trim();
    const filterBranchId = adminBranchId || (queryBranchId && queryBranchId !== "null" && queryBranchId !== "undefined" ? queryBranchId : undefined);

    if (filterBranchId) {
        conditions.push(eq(orders.branchId, filterBranchId));
    }

    const source = ((req.query?.source || req.query?.orderSource) as string)?.trim();
    if (source && source !== "null" && source !== "undefined") {
        conditions.push(eq(orders.orderSource, source as any));
    }

    const zoneId = (req.query?.zoneId as string)?.trim();
    if (zoneId && zoneId !== "null" && zoneId !== "undefined") {
        conditions.push(
            or(
                eq(orders.zoneId, zoneId),
                eq(restaurantZoneDeliveryFees.zoneId, zoneId),
                eq(zones.id, zoneId)
            )
        );
    }

    const cityId = (req.query?.cityId as string)?.trim();
    if (cityId && cityId !== "null" && cityId !== "undefined") {
        conditions.push(eq(zones.cityId, cityId));
    }

    const dateConditions = await buildOrderDateConditions(req, adminRestaurantId);
    conditions.push(...dateConditions);

    const rawRestaurantOrders = await db
        .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            dailyOrderNumber: orders.dailyOrderNumber,
            customerName: users.name,
            customerPhone: users.phone,
            alternatePhone: users.alternatePhone,
            rating: orders.rating,
            ratingComment: orders.ratingComment,
            orderType: orders.orderType,
            orderSource: orders.orderSource,
            paymentMethod: orders.paymentMethod,
            subtotal: orders.subtotal,
            deliveryFee: orders.deliveryFee,
            serviceFee: orders.serviceFee,
            appCommission: orders.appCommission,
            discountAmount: orders.discountAmount,
            couponCode: orders.couponCode,
            totalAmount: orders.totalAmount,
            status: orders.status,
            durationOrderPreparing: orders.durationOrderPreparing,
            cancelReasonId: orders.cancelReasonId,
            cancelReason: orders.cancelReason,
            cancelReasonType: orders.cancelReasonType,
            note: orders.note,
            deliveryMan: {
                id: deliveryMen.id,
                name: deliveryMen.name,
                phone: deliveryMen.phone,
            },
            branchName: branches.name,
            zoneName: sql<string | null>`CASE WHEN ${orders.orderType} = 'delivery' THEN ${zones.name} ELSE NULL END`,
            addressLat: addresses.lat,
            addressLng: addresses.lng,
            createdAt: orders.createdAt,
            updatedAt: orders.updatedAt,
        })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .leftJoin(branches, eq(orders.branchId, branches.id))
        .leftJoin(deliveryMen, eq(orders.deliveryManId, deliveryMen.id))
        .leftJoin(addresses, eq(orders.addressId, addresses.id))
        .leftJoin(restaurantZoneDeliveryFees, eq(orders.zoneId, restaurantZoneDeliveryFees.id))
        .leftJoin(zones, or(eq(restaurantZoneDeliveryFees.zoneId, zones.id), eq(orders.zoneId, zones.id)))
        .where(and(...conditions))
        .orderBy(desc(orders.createdAt));

    const restaurantOrders = await Promise.all(
        rawRestaurantOrders.map(async (o) => {
            let finalZoneName = o.zoneName;
            if (!finalZoneName && o.orderType === "delivery" && o.addressLat && o.addressLng) {
                const latNum = parseFloat(String(o.addressLat));
                const lngNum = parseFloat(String(o.addressLng));
                if (!isNaN(latNum) && !isNaN(lngNum)) {
                    const detected = await resolveZoneFromCoords(latNum, lngNum, adminRestaurantId);
                    if (detected) {
                        finalZoneName = detected.name;
                    }
                }
            }

            let couponDetails: any = null;
            if (o.couponCode) {
                try {
                    const [c] = await db.select({
                        id: coupons.id,
                        name: coupons.name,
                        nameAr: coupons.nameAr,
                        nameFr: coupons.nameFr,
                        code: coupons.code,
                    }).from(coupons).where(eq(coupons.code, o.couponCode)).limit(1);
                    if (c) couponDetails = c;
                } catch (e) {}
            }

            const { addressLat, addressLng, ...rest } = o;
            return {
                ...rest,
                zoneName: finalZoneName,
                discount: {
                    discountAmount: o.discountAmount ?? "0.00",
                    couponCode: o.couponCode ?? null,
                    couponName: couponDetails?.name ?? null,
                    couponNameAr: couponDetails?.nameAr ?? null,
                    couponNameFr: couponDetails?.nameFr ?? null,
                },
            };
        })
    );

    return SuccessResponse(res, { message: "Get orders success", data: restaurantOrders });
};

export const getOrdersByStatus = async (
    req: Request,
    res: Response,
    status: "pending" | "accepted" | "preparing" | "out_for_delivery" | "delivered" | "cancelled" | "refund"
) => {
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
        eq(orders.status, status),
    ];

    const queryBranchId = (req.query?.branchId as string)?.trim();
    const filterBranchId = adminBranchId || (queryBranchId && queryBranchId !== "null" && queryBranchId !== "undefined" ? queryBranchId : undefined);

    if (filterBranchId) {
        conditions.push(eq(orders.branchId, filterBranchId));
    }

    const source = ((req.query?.source || req.query?.orderSource) as string)?.trim();
    if (source && source !== "null" && source !== "undefined") {
        conditions.push(eq(orders.orderSource, source as any));
    }

    const zoneId = (req.query?.zoneId as string)?.trim();
    if (zoneId && zoneId !== "null" && zoneId !== "undefined") {
        conditions.push(
            or(
                eq(orders.zoneId, zoneId),
                eq(restaurantZoneDeliveryFees.zoneId, zoneId),
                eq(zones.id, zoneId)
            )
        );
    }

    const cityId = (req.query?.cityId as string)?.trim();
    if (cityId && cityId !== "null" && cityId !== "undefined") {
        conditions.push(eq(zones.cityId, cityId));
    }

    const dateConditions = await buildOrderDateConditions(req, adminRestaurantId);
    conditions.push(...dateConditions);

    const rawResult = await db
        .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            dailyOrderNumber: orders.dailyOrderNumber,
            customerName: users.name,
            customerPhone: users.phone,
            alternatePhone: users.alternatePhone,
            rating: orders.rating,
            ratingComment: orders.ratingComment,
            orderType: orders.orderType,
            orderSource: orders.orderSource,
            paymentMethod: orders.paymentMethod,
            subtotal: orders.subtotal,
            deliveryFee: orders.deliveryFee,
            serviceFee: orders.serviceFee,
            appCommission: orders.appCommission,
            discountAmount: orders.discountAmount,
            couponCode: orders.couponCode,
            totalAmount: orders.totalAmount,
            status: orders.status,
            durationOrderPreparing: orders.durationOrderPreparing,
            cancelReasonId: orders.cancelReasonId,
            cancelReason: orders.cancelReason,
            cancelReasonType: orders.cancelReasonType,
            note: orders.note,
            deliveryMan: {
                id: deliveryMen.id,
                name: deliveryMen.name,
                phone: deliveryMen.phone,
            },
            branchName: branches.name,
            zoneName: sql<string | null>`CASE WHEN ${orders.orderType} = 'delivery' THEN ${zones.name} ELSE NULL END`,
            addressLat: addresses.lat,
            addressLng: addresses.lng,
            createdAt: orders.createdAt,
            updatedAt: orders.updatedAt,
        })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .leftJoin(branches, eq(orders.branchId, branches.id))
        .leftJoin(deliveryMen, eq(orders.deliveryManId, deliveryMen.id))
        .leftJoin(addresses, eq(orders.addressId, addresses.id))
        .leftJoin(restaurantZoneDeliveryFees, eq(orders.zoneId, restaurantZoneDeliveryFees.id))
        .leftJoin(zones, or(eq(restaurantZoneDeliveryFees.zoneId, zones.id), eq(orders.zoneId, zones.id)))
        .where(and(...conditions))
        .orderBy(desc(orders.createdAt));

    const result = await Promise.all(
        rawResult.map(async (o) => {
            let finalZoneName = o.zoneName;
            if (!finalZoneName && o.orderType === "delivery" && o.addressLat && o.addressLng) {
                const latNum = parseFloat(String(o.addressLat));
                const lngNum = parseFloat(String(o.addressLng));
                if (!isNaN(latNum) && !isNaN(lngNum)) {
                    const detected = await resolveZoneFromCoords(latNum, lngNum, adminRestaurantId);
                    if (detected) {
                        finalZoneName = detected.name;
                    }
                }
            }

            let couponDetails: any = null;
            if (o.couponCode) {
                try {
                    const [c] = await db.select({
                        id: coupons.id,
                        name: coupons.name,
                        nameAr: coupons.nameAr,
                        nameFr: coupons.nameFr,
                        code: coupons.code,
                    }).from(coupons).where(eq(coupons.code, o.couponCode)).limit(1);
                    if (c) couponDetails = c;
                } catch (e) {}
            }

            const { addressLat, addressLng, ...rest } = o;
            return {
                ...rest,
                zoneName: finalZoneName,
                discount: {
                    discountAmount: o.discountAmount ?? "0.00",
                    couponCode: o.couponCode ?? null,
                    couponName: couponDetails?.name ?? null,
                    couponNameAr: couponDetails?.nameAr ?? null,
                    couponNameFr: couponDetails?.nameFr ?? null,
                },
            };
        })
    );

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
            alternatePhone: users.alternatePhone,
            email: users.email,
        },
        branch: {
            id: branches.id,
            name: branches.name,
        },
        restaurant: {
            id: restaurants.id,
            name: restaurants.name,
        },
        address: {
            id: addresses.id,
            type: addresses.type,
            title: addresses.title,
            lat: addresses.lat,
            lng: addresses.lng,
            street: addresses.street,
            number: addresses.number,
            floor: addresses.floor,
            apartment: addresses.apartment,
            landmark: addresses.landmark,
            location: addresses.location,
        },
        zone: {
            id: zones.id,
            name: zones.name,
            nameAr: zones.nameAr,
            nameFr: zones.nameFr,
        },
        driver: {
            id: deliveryMen.id,
            name: deliveryMen.name,
            phone: deliveryMen.phone,
        },
    })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .leftJoin(branches, eq(orders.branchId, branches.id))
        .leftJoin(restaurants, eq(orders.restaurantId, restaurants.id))
        .leftJoin(deliveryMen, eq(orders.deliveryManId, deliveryMen.id))
        .leftJoin(addresses, eq(orders.addressId, addresses.id))
        .leftJoin(restaurantZoneDeliveryFees, eq(orders.zoneId, restaurantZoneDeliveryFees.id))
        .leftJoin(zones, eq(restaurantZoneDeliveryFees.zoneId, zones.id))
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
        const detected = await resolveZoneFromCoords(addrLat, addrLng, restaurantId);
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
        const [matchedBranch] = await db
            .select({
                id: branches.id,
                name: branches.name,
            })
            .from(branches)
            .where(
                and(
                    eq(branches.restaurantId, restaurantId),
                    eq(branches.zoneId, targetZoneId),
                    eq(branches.status, "active")
                )
            )
            .limit(1);

        if (matchedBranch) {
            resolvedBranch = matchedBranch;
        }
    }

    // Fallback: إذا لم نجد فرعاً خاصاً بالزون، نجلب أي فرع نشط للمطعم
    if ((!resolvedBranch || !resolvedBranch.id) && restaurantId) {
        const [fallbackBranch] = await db
            .select({
                id: branches.id,
                name: branches.name,
            })
            .from(branches)
            .where(
                and(
                    eq(branches.restaurantId, restaurantId),
                    eq(branches.status, "active")
                )
            )
            .limit(1);

        if (fallbackBranch) {
            resolvedBranch = fallbackBranch;
        }
    }

    // 2. جلب أصناف الأكل (Order Items)
    const items = await db.select({
        id: orderItems.id,
        foodId: orderItems.foodId,
        quantity: orderItems.quantity,
        basePrice: orderItems.basePrice,
        variationsPrice: orderItems.variationsPrice,
        addonsPrice: orderItems.addonsPrice,
        totalPrice: orderItems.totalPrice,
        note: orderItems.note,
        variations: orderItems.variations,
        addons: orderItems.addons,
        foodName: food.name,
        foodNameAr: food.nameAr,
        foodNameFr: food.nameFr,
        foodImage: food.image,
        foodDescription: food.description,
    })
        .from(orderItems)
        .leftJoin(food, eq(orderItems.foodId, food.id))
        .where(eq(orderItems.orderId, id));

    // ✅ 3. تنظيف الـ Variations وجلب الأسماء وحساب السعر ديناميكياً
    const formattedItems = await Promise.all(items.map(async (item) => {
        let cleanVariations = item.variations;

        if (typeof cleanVariations === 'string') {
            try {
                cleanVariations = JSON.parse(cleanVariations);
                if (typeof cleanVariations === 'string') {
                    cleanVariations = JSON.parse(cleanVariations);
                }
            } catch (error) {
                console.error("Error parsing variations for item ID:", item.id);
            }
        }

        let totalCalculatedVarPrice = 0;

if (Array.isArray(cleanVariations) && cleanVariations.length > 0) {
    cleanVariations = await Promise.all(cleanVariations.map(async (v: any) => {
        // 1. مرونة في استخراج الـ IDs من الـ JSON
        const varId = v.variationId || v.id || v.variation_id;
        const optId = v.optionId || v.option_id || (v.option && v.option.id);

        let variationName = v.variationName || v.name || "Unknown";
        let variationNameAr = v.variationNameAr || v.nameAr || "غير معروف";
        let optionName = v.optionName || v.value || "Unknown";
        let optionNameAr = v.optionNameAr || v.valueAr || "غير معروف";

        // 2. البحث في جدول foodVariations في حال لم تكن الخواص موجودة كـ snapshot
        if (varId) {
            const [varDb] = await db
                .select()
                .from(foodVariations)
                .where(eq(foodVariations.id, varId))
                .limit(1);

            if (varDb) {
                variationName = varDb.name || variationName;
                variationNameAr = varDb.nameAr || variationNameAr;
            }
        }

        // 3. البحث في جدول variationOptions
        if (optId) {
            const [optDb] = await db
                .select()
                .from(variationOptions)
                .where(eq(variationOptions.id, optId))
                .limit(1);

            if (optDb) {
                optionName = optDb.optionName || optionName;
                optionNameAr = optDb.optionNameAr || optionNameAr;

                const price = parseFloat((optDb as any).price || optDb.additionalPrice || "0");
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
        let foodAddons: any[] = [];
        let selectedAddonIds = item.addons;
        if (typeof selectedAddonIds === "string") {
            try {
                selectedAddonIds = JSON.parse(selectedAddonIds);
            } catch {
                selectedAddonIds = [];
            }
        }
        if (Array.isArray(selectedAddonIds) && selectedAddonIds.length > 0) {
            // استخراج معرفات الإضافات (IDs) في حال كانت مصفوفة من الكائنات
            const extractedIds = selectedAddonIds.map((addon: any) => {
                if (typeof addon === "string") return addon;
                if (addon && addon.addonId) return String(addon.addonId);
                if (addon && addon.id) return String(addon.id);
                return String(addon);
            }).filter(id => id && id.trim() !== "" && id !== "[object Object]");

            if (extractedIds.length > 0) {
                foodAddons = await db
                    .select({
                        id: addons.id,
                        name: addons.name,
                        nameAr: addons.nameAr,
                        nameFr: addons.nameFr,
                        price: addons.price,
                        status: addons.status,
                        categoryId: addons.adonescategoryid,
                    })
                    .from(addons)
                    .where(inArray(addons.id, extractedIds));
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
    let pmDetails: any = null;
    const pmValue = orderDetail.order.paymentMethod;

    if (pmValue && pmValue.length === 36) {
        try {
            const [pm] = await db.select({
                id: paymentMethods.id,
                name: paymentMethods.name,
                nameAr: paymentMethods.nameAr
            }).from(paymentMethods).where(eq(paymentMethods.id, pmValue)).limit(1);

            if (pm) {
                pmDetails = {
                    id: pm.id,
                    name: pm.name,
                    nameAr: pm.nameAr,
                };
            } else {
                pmDetails = { id: pmValue, name: "Unknown", nameAr: "غير معروف" };
            }
        } catch (error) {
            console.error("Error fetching payment method:", error);
            pmDetails = { id: pmValue, name: "Unknown", nameAr: "غير معروف" };
        }
    } else {
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
        const [ordersCount] = await db
            .select({ count: sql<number>`count(${orders.id})` })
            .from(orders)
            .where(
                and(
                    eq(orders.userId, orderDetail.order.userId),
                    eq(orders.restaurantId, restaurantId)
                )
            );
        userTotalOrders = Number(ordersCount?.count || 0);
    }

    // Fetch discount and coupon names for the detail view
    let discountDetails: any = null;
    if (orderDetail.order.discountId) {
        const [disc] = await db.select({
            id: discounts.id,
            name: discounts.name,
            nameAr: discounts.nameAr,
            nameFr: discounts.nameFr,
        }).from(discounts).where(eq(discounts.id, orderDetail.order.discountId)).limit(1);
        if (disc) discountDetails = disc;
    }

    let couponDetails: any = null;
    if (orderDetail.order.couponId) {
        const [coup] = await db.select({
            id: coupons.id,
            name: coupons.name,
            nameAr: coupons.nameAr,
            nameFr: coupons.nameFr,
            code: coupons.code,
        }).from(coupons).where(eq(coupons.id, orderDetail.order.couponId)).limit(1);
        if (coup) couponDetails = coup;
    }

    return SuccessResponse(res, {
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
            address: orderDetail.address,
            zone: resolvedZone,
            zoneName: resolvedZone?.name || null,
            items: formattedItems
        }
    });
};
// ==========================================
// 3. تحديث حالة الأوردر (مع إرجاع الفلوس والعمولة لو المطعم كنسل)
// تحديث حالة الأوردر (إرجاع المحفظة + التسوية + إضافة النقاط عند delivered)
// ==========================================
export const updateOrderStatus = async (req: Request, res: Response) => {
    const { orderId } = req.params;
    const { status, cancelReasonId, customReason } = req.body;

    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    const adminBranchId = req.user?.branchId;

    if (!status) throw new BadRequest("Status is required");

    const [existingOrder] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!existingOrder) throw new NotFound("Order not found");

    if (existingOrder.restaurantId !== adminRestaurantId) throw new BadRequest("Unauthorized");
    if (adminBranchId && existingOrder.branchId !== adminBranchId) throw new BadRequest("Unauthorized");

    const currentStatus = existingOrder.status as string;

    const finalStatuses = ["delivered", "cancelled", "refund"];
    if (finalStatuses.includes(currentStatus)) {
        throw new BadRequest(`Order is already ${currentStatus} and cannot be changed`);
    }

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

    let finalReasonId: string | null = null;
    let finalReasonText: string | null = null;

    if (status === "cancelled") {
        const inputCustomReason = customReason as string | undefined;

        if (cancelReasonId) {
            const [found] = await db.select().from(selectReasons)
                .where(and(eq(selectReasons.id, cancelReasonId), eq(selectReasons.type, "restaurant")))
                .limit(1);
            if (!found) throw new BadRequest("Invalid cancel reason for restaurant");
            finalReasonId = found.id;
            finalReasonText = (inputCustomReason && inputCustomReason.trim()) ? inputCustomReason.trim() : found.name;
        } else if (inputCustomReason && typeof inputCustomReason === "string" && inputCustomReason.trim() !== "") {
            finalReasonId = null;
            finalReasonText = inputCustomReason.trim();
        } else {
            throw new BadRequest("Cancel reason or cancel reason ID is required when cancelling an order");
        }
    }

    await db.transaction(async (tx) => {
        // 1. تحديث حالة الطلب
        await tx.update(orders)
            .set({
                status: status,
                cancelReasonId: status === "cancelled" ? finalReasonId : null,
                cancelReason: status === "cancelled" ? finalReasonText : null,
                cancelReasonType: status === "cancelled" ? "restaurant" : null,
                updatedAt: new Date()
            })
            .where(eq(orders.id, orderId));

        // ==========================================
        // 💰 2. الـ Refund لمحفظة العميل (User Wallet) عند الإلغاء
        // ==========================================
        if (status === "cancelled" || status === "rejected") {
            // البحث هل تم الدفع سابقاً بواسطة المحفظة
            const [walletTx] = await tx.select().from(userWalletTransactions)
                .where(and(
                    eq(userWalletTransactions.reference, existingOrder.orderNumber),
                    eq(userWalletTransactions.transactionType, "order_payment")
                )).limit(1);

            if (walletTx) {
                const [userWallet] = await tx.select().from(userWallets)
                    .where(eq(userWallets.userId, existingOrder.userId)).limit(1);

                if (userWallet) {
                    const balanceBefore = parseFloat(userWallet.balance ?? "0.00");
                    const amountToRefund = parseFloat(existingOrder.totalAmount as string || "0.00");
                    const newBalance = balanceBefore + amountToRefund;

                    // تحديث رصيد محفظة العميل
                    await tx.update(userWallets)
                        .set({
                            balance: newBalance.toFixed(2),
                            updatedAt: new Date()
                        })
                        .where(eq(userWallets.id, userWallet.id));

                    // إضافة حركة إرجاع الرصيد (Refund Transaction)
                    await tx.insert(userWalletTransactions).values({
                        id: uuidv4(),
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
                const [payment] = await tx.select().from(paymentMethods).where(eq(paymentMethods.id, existingOrder.paymentMethod)).limit(1);
                const pmName = (payment?.name || "").toLowerCase();
                isCashPayment = pmName.includes("cash") || pmName.includes("استلام");
            }

            const appCommission = parseFloat(existingOrder.appCommission as string || "0");
            const serviceFee = parseFloat(existingOrder.serviceFee as string || "0");
            const totalAmount = parseFloat(existingOrder.totalAmount as string || "0");
            const subtotal = parseFloat(existingOrder.subtotal as string || "0");
            const deliveryFee = parseFloat(existingOrder.deliveryFee as string || "0");

            const appDues = appCommission + serviceFee;
            const restaurantEarning = subtotal + deliveryFee - appCommission;

            let [restWallet] = await tx.select().from(restaurantWallets)
                .where(eq(restaurantWallets.restaurantId, existingOrder.restaurantId)).limit(1);

            if (!restWallet) {
                await tx.insert(restaurantWallets).values({ id: uuidv4(), restaurantId: existingOrder.restaurantId });
                [restWallet] = await tx.select().from(restaurantWallets)
                    .where(eq(restaurantWallets.restaurantId, existingOrder.restaurantId)).limit(1);
            }

            let currentBalance = parseFloat(restWallet.balance as string || "0");
            let currentCollectedCash = parseFloat(restWallet.collectedCash as string || "0");
            let currentTotalEarning = parseFloat(restWallet.totalEarning as string || "0");

            if (isCashPayment) {
                currentBalance += appDues;
                currentCollectedCash -= totalAmount;
            } else {
                currentBalance -= restaurantEarning;
            }
            currentTotalEarning -= restaurantEarning;

            const balanceAfterPenalty = currentBalance - appDues;

            await tx.update(restaurantWallets)
                .set({
                    balance: balanceAfterPenalty.toFixed(2),
                    collectedCash: currentCollectedCash.toFixed(2),
                    totalEarning: currentTotalEarning.toFixed(2),
                    updatedAt: new Date()
                })
                .where(eq(restaurantWallets.restaurantId, existingOrder.restaurantId));

            await tx.insert(restaurantWalletTransactions).values({
                id: uuidv4(),
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
                .select({ foodId: orderItems.foodId, quantity: orderItems.quantity })
                .from(orderItems)
                .where(eq(orderItems.orderId, orderId));

            if (items.length > 0) {
                const foodIds = items.map(i => i.foodId);

                const enrolledRows = await tx
                    .select({ foodId: pointsProducts.foodId, isActive: pointsProducts.isActive })
                    .from(pointsProducts)
                    .where(
                        and(
                            eq(pointsProducts.restaurantId, existingOrder.restaurantId),
                            inArray(pointsProducts.foodId, foodIds)
                        )
                    );

                const enrolledMap = new Map(
                    enrolledRows.filter(r => r.isActive).map(r => [r.foodId, true])
                );

                if (enrolledMap.size > 0) {
                    const enrolledFoodIds = foodIds.filter(id => enrolledMap.has(id));
                    const foodPoints = await tx
                        .select({ id: food.id, points: food.points })
                        .from(food)
                        .where(inArray(food.id, enrolledFoodIds));

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
                            .from(userRestaurantPoints)
                            .where(
                                and(
                                    eq(userRestaurantPoints.userId, existingOrder.userId),
                                    eq(userRestaurantPoints.restaurantId, existingOrder.restaurantId)
                                )
                            )
                            .limit(1);

                        if (!userPointRecord) {
                            const newPointId = uuidv4();
                            await tx.insert(userRestaurantPoints).values({
                                id: newPointId,
                                userId: existingOrder.userId,
                                restaurantId: existingOrder.restaurantId,
                                points: 0,
                            });
                            [userPointRecord] = await tx
                                .select()
                                .from(userRestaurantPoints)
                                .where(eq(userRestaurantPoints.id, newPointId))
                                .limit(1);
                        }

                        const pointsBefore = userPointRecord.points ?? 0;
                        const pointsAfter = pointsBefore + totalPointsEarned;

                        await tx
                            .update(userRestaurantPoints)
                            .set({ points: pointsAfter, updatedAt: new Date() })
                            .where(eq(userRestaurantPoints.id, userPointRecord.id));

                        await tx.insert(userPointsTransactions).values({
                            id: uuidv4(),
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

    await sendPushNotification({
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

    return SuccessResponse(res, { message: `Order status successfully updated to ${status}` });
};

// ==========================================
// تحديث مدة تحضير الأوردر (بـ دقائق)
// ==========================================
export const setOrderPreparingDuration = async (req: Request, res: Response) => {
    const { orderId } = req.params;
    const { duration } = req.body;

    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    const adminBranchId = req.user?.branchId;

    const [existingOrder] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!existingOrder) throw new NotFound('Order not found');

    if (existingOrder.restaurantId !== adminRestaurantId) throw new BadRequest('Unauthorized');
    if (adminBranchId && existingOrder.branchId !== adminBranchId) throw new BadRequest('Unauthorized');

    let finalDuration = duration;

    // إذا لم يرسل الآدمن duration، نعتمد maxDeliveryTime للمطعم
    if (typeof finalDuration !== 'number') {
        const [settings] = await db
            .select({ maxDeliveryTime: restaurantSettings.maxDeliveryTime })
            .from(restaurantSettings)
            .where(eq(restaurantSettings.restaurantId, existingOrder.restaurantId))
            .limit(1);

        finalDuration = settings?.maxDeliveryTime ?? 30;
    }

    if (finalDuration < 0) {
        throw new BadRequest('Invalid duration value');
    }

    await db.update(orders)
        .set({ durationOrderPreparing: finalDuration, updatedAt: new Date() })
        .where(eq(orders.id, orderId));

    return SuccessResponse(res, {
        message: 'Order preparing duration updated successfully',
        durationOrderPreparing: finalDuration
    });
};

// جلب أسباب الإلغاء حسب النوع (user أو restaurant)
export const getReasons = async (req: Request, res: Response) => {
    const type = req.query.type as string;

    // Default to "restaurant" if type is not provided or not "user"
    const targetType = type === "user" ? "user" : "restaurant";

    const reasons = await db
        .select()
        .from(selectReasons)
        .where(
            and(
                eq(selectReasons.status, "active"),
                eq(selectReasons.type, targetType)
            )
        );

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
            id: zones.id,
            name: zones.name
        }
    })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .leftJoin(branches, eq(orders.branchId, branches.id))
        .leftJoin(restaurants, eq(orders.restaurantId, restaurants.id))
        .leftJoin(addresses, eq(orders.addressId, addresses.id))
        .leftJoin(restaurantZoneDeliveryFees, eq(orders.zoneId, restaurantZoneDeliveryFees.id))
        .leftJoin(zones, eq(restaurantZoneDeliveryFees.zoneId, zones.id))
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

    // ==========================================
    // 🗺️ Fallback: استنتاج الزون والفرع للـ PDF من إحداثيات العنوان إذا كانت فارغة
    // ==========================================
    let pdfZoneName = orderDetail.zone?.name || "";
    let pdfZoneId = orderDetail.zone?.id || null;

    if (!pdfZoneName && orderDetail.address?.lat && orderDetail.address?.lng) {
        const addrLat = parseFloat(String(orderDetail.address.lat));
        const addrLng = parseFloat(String(orderDetail.address.lng));
        if (!isNaN(addrLat) && !isNaN(addrLng)) {
            const detected = await resolveZoneFromCoords(addrLat, addrLng, orderDetail.order.restaurantId);
            if (detected) {
                pdfZoneName = detected.name;
                pdfZoneId = detected.id;
            }
        }
    }

    let pdfBranchName = orderDetail.branch?.name || "";
    if (!pdfBranchName && pdfZoneId && orderDetail.order.restaurantId) {
        const [matchedBranch] = await db
            .select({ name: branches.name })
            .from(branches)
            .where(
                and(
                    eq(branches.restaurantId, orderDetail.order.restaurantId),
                    eq(branches.zoneId, pdfZoneId),
                    eq(branches.status, "active")
                )
            )
            .limit(1);
        if (matchedBranch) {
            pdfBranchName = matchedBranch.name;
        }
    }

    // 2. جلب أصناف الأكل والتفاصيل (Variations)
    const items = await db.select({
        quantity: orderItems.quantity,
        basePrice: orderItems.basePrice,
        variationsPrice: orderItems.variationsPrice,
        totalPrice: orderItems.totalPrice,
        variations: orderItems.variations,
        foodName: food.name,
        foodNameAr: food.nameAr,
    })
        .from(orderItems)
        .leftJoin(food, eq(orderItems.foodId, food.id))
        .where(eq(orderItems.orderId, orderId));

    // تجهيز تفاصيل الفارييشنز وحساب السعر وربطه بالاسم
    const formattedItems = await Promise.all(items.map(async (item) => {
        let cleanVariations = item.variations;
        if (typeof cleanVariations === 'string') {
            try {
                cleanVariations = JSON.parse(cleanVariations);
                if (typeof cleanVariations === 'string') cleanVariations = JSON.parse(cleanVariations);
            } catch (error) { }
        }

        let varDetails: { name: string, price: number }[] = [];
        let totalCalculatedVarPrice = 0;

        if (Array.isArray(cleanVariations) && cleanVariations.length > 0) {
            await Promise.all(cleanVariations.map(async (v: any) => {
                if (v.optionId) {
                    const [optDb] = await db.select().from(variationOptions).where(eq(variationOptions.id, v.optionId)).limit(1);
                    if (optDb) {
                        const name = optDb.optionName || "Extra";
                        const price = parseFloat((optDb as any).price || optDb.additionalPrice || "0");
                        varDetails.push({ name, price });
                        totalCalculatedVarPrice += price;
                    }
                }
            }));
        }

        const finalVarPrice = parseFloat(item.variationsPrice as string || "0") > 0 ? parseFloat(item.variationsPrice as string || "0") : totalCalculatedVarPrice;
        const finalTotalPrice = (parseFloat(item.basePrice as string || "0") + finalVarPrice) * item.quantity;

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
            const [pm] = await db.select({ name: paymentMethods.name }).from(paymentMethods).where(eq(paymentMethods.id, pmValue)).limit(1);
            if (pm) paymentName = pm.name;
            else paymentName = pmValue;
        } catch (error) {
            console.error("Error fetching payment method for PDF:", error);
            paymentName = "Cash";
        }
    } else {
        switch (pmValue) {
            case "cash_on_delivery": paymentName = "Cash on Delivery"; break;
            case "visa": paymentName = "Credit Card"; break;
            case "wallet": paymentName = "Wallet"; break;
            default: paymentName = pmValue || "Unknown";
        }
    }

    // 4. إنشاء الـ PDF بحجم إيصال حراري
    const doc = new PDFDocument({ margin: 20, size: [250, 600] });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Receipt_${orderDetail.order.dailyOrderNumber}.pdf"`);

    doc.pipe(res);

    // Header
    doc.fontSize(16).text(fixArabicText(orderDetail.restaurant?.name) || 'Restaurant', { align: 'center' });
    if (pdfBranchName) {
        doc.fontSize(12).text(fixArabicText(pdfBranchName), { align: 'center' });
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

    doc.text(`Branch: ${fixArabicText(pdfBranchName) || 'N/A'}`);
    doc.text(`Client: ${fixArabicText(orderDetail.customer?.name) || 'Guest'}`);
    doc.text(`Phone: ${orderDetail.customer?.phone || 'N/A'}`);
    doc.text(`Order Type: ${orderDetail.order.orderType}`);
    doc.text(`Payment: ${paymentName}`);

    doc.moveDown(0.5);
    doc.moveTo(10, doc.y).lineTo(240, doc.y).dash(2, { space: 2 }).stroke();
    doc.undash();
    doc.moveDown(0.5);

    // Delivery Address if applicable
    if (orderDetail.order.orderType === 'delivery' && orderDetail.address) {
        doc.text('Delivery Address:', { underline: true });
        doc.text(`Zone: ${fixArabicText(pdfZoneName)}`);
        doc.text(`Street: ${fixArabicText(orderDetail.address.street) || ''}`);
        let details = `Bldg: ${orderDetail.address.number || ''}`;
        if (orderDetail.address.floor) details += ` | Floor: ${orderDetail.address.floor}`;
        if (orderDetail.address.landmark) details += ` | ${fixArabicText(orderDetail.address.landmark)}`;
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
    for (const item of formattedItems) {
        const currentY = doc.y;
        const name = fixArabicText(item.foodNameAr || item.foodName) || fixArabicText(item.foodName) || 'Item';

        doc.text(name, 10, currentY, { width: 100 });
        const nextY = doc.y;

        doc.text(item.quantity.toString(), 110, currentY, { width: 30, align: 'right' });
        doc.text(parseFloat(item.basePrice as string).toFixed(2), 140, currentY, { width: 45, align: 'right' });
        doc.text(item.finalTotalPrice.toFixed(2), 185, currentY, { width: 55, align: 'right' });

        doc.y = nextY;

        // طباعة الفارييشنز تحت الصنف مع عرض السعر
        if (item.variationDetails.length > 0) {
            doc.fontSize(8);
            for (const v of item.variationDetails) {
                const vY = doc.y;
                const vName = fixArabicText(v.name);
                doc.text(`  + ${vName}`, 10, vY, { width: 120 });
                if (v.price > 0) {
                    doc.text(v.price.toFixed(2), 140, vY, { width: 45, align: 'right' });
                }
            }
            doc.fontSize(10);
        }

        doc.moveDown(0.5);
    }

    doc.moveTo(10, doc.y).lineTo(240, doc.y).stroke();
    doc.moveDown(0.5);

    // Totals
    const subtotal = parseFloat(orderDetail.order.subtotal as string).toFixed(2);
    const deliveryFee = parseFloat(orderDetail.order.deliveryFee as string).toFixed(2);
    const serviceFee = parseFloat(orderDetail.order.serviceFee as string).toFixed(2);
    const total = parseFloat(orderDetail.order.totalAmount as string).toFixed(2);

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

export const getallnumbersoforders = async (req: Request, res: Response) => {
    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    const adminBranchId = req.user?.branchId; // لو Null يبقى ده المالك

    if (!adminRestaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    // بناء الـ Query الأساسي
    const conditions: any[] = [
        eq(orders.restaurantId, adminRestaurantId)
    ];

    const queryBranchId = (req.query?.branchId as string)?.trim();
    const filterBranchId = adminBranchId || (queryBranchId && queryBranchId !== "null" && queryBranchId !== "undefined" ? queryBranchId : undefined);

    if (filterBranchId) {
        conditions.push(eq(orders.branchId, filterBranchId));
    }

    const source = ((req.query?.source || req.query?.orderSource) as string)?.trim();
    if (source && source !== "null" && source !== "undefined") {
        conditions.push(eq(orders.orderSource, source as any));
    }

    const zoneId = (req.query?.zoneId as string)?.trim();
    if (zoneId && zoneId !== "null" && zoneId !== "undefined") {
        conditions.push(
            or(
                eq(orders.zoneId, zoneId),
                eq(restaurantZoneDeliveryFees.zoneId, zoneId),
                eq(zones.id, zoneId)
            )
        );
    }

    const cityId = (req.query?.cityId as string)?.trim();
    if (cityId && cityId !== "null" && cityId !== "undefined") {
        conditions.push(eq(zones.cityId, cityId));
    }

    //-----------------------
    const dateConditions = await buildOrderDateConditions(req, adminRestaurantId);
    conditions.push(...dateConditions);
    //-----------------------

    const statusCountsResult = await db
        .select({
            status: orders.status,
            count: sql<number>`count(${orders.id})`,
        })
        .from(orders)
        .leftJoin(branches, eq(orders.branchId, branches.id))
        .leftJoin(addresses, eq(orders.addressId, addresses.id))
        .leftJoin(restaurantZoneDeliveryFees, eq(orders.zoneId, restaurantZoneDeliveryFees.id))
        .leftJoin(zones, eq(restaurantZoneDeliveryFees.zoneId, zones.id))
        .where(and(...conditions))
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

// ==========================================
// 6. تعيين مندوب توصيل لطلب (Assign Delivery)
// ==========================================
export const assignDelivery = async (req: Request, res: Response) => {
    const { orderId } = req.params;
    const { deliveryManId } = req.body;

    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    const adminBranchId = req.user?.branchId;

    if (!deliveryManId) throw new BadRequest("Delivery Man ID is required");

    // 1. تحقق من الطلب
    const [existingOrder] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!existingOrder) throw new NotFound("Order not found");

    if (existingOrder.restaurantId !== adminRestaurantId) throw new BadRequest("Unauthorized");
    if (adminBranchId && existingOrder.branchId !== adminBranchId) throw new BadRequest("Unauthorized");

    const orderType = existingOrder.orderType || (existingOrder as any).type;
    if (orderType !== "delivery") {
        throw new BadRequest("Cannot assign a delivery man to a non-delivery order");
    }
    const [deliveryMan] = await db.select().from(deliveryMen).where(eq(deliveryMen.id, deliveryManId)).limit(1);
    if (!deliveryMan) throw new NotFound("Delivery Man not found");
    if (deliveryMan.restaurantId !== adminRestaurantId) {
        throw new BadRequest("Unauthorized: Delivery man does not belong to your restaurant");
    }

    // 3. تحديث الطلب وإسناد المندوب
    await db.update(orders)
        .set({ deliveryManId, updatedAt: new Date() })
        .where(eq(orders.id, orderId));

    return SuccessResponse(res, { message: "Delivery man successfully assigned to order" });
};

//=======================================
//  select delivery men
//=======================================
export const selectDeliveryMan = async (req: Request, res: Response) => {
    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    const adminBranchId = req.user?.branchId;

    if (!adminRestaurantId) {
        throw new BadRequest("Restaurant ID not found");
    }

    const conditions: any[] = [
        eq(deliveryMen.restaurantId, adminRestaurantId),
        eq(deliveryMen.isActive, true),
    ];

    if (adminBranchId) {
        conditions.push(eq(deliveryMen.branchId, adminBranchId));
    }

    const deliveryMenList = await db.select({
        id: deliveryMen.id,
        name: deliveryMen.name,
        phone: deliveryMen.phone,
    })
        .from(deliveryMen)
        .where(and(...conditions));

    return SuccessResponse(res, { message: "Get delivery men success", data: deliveryMenList });
};

//=======================================
//  select (branch - zone - source)
//=======================================
export const getSelectData = async (req: Request, res: Response) => {
    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    const adminBranchId = req.user?.branchId;
    const queryBranchId = req.query?.branchId as string | undefined;
    const filterBranchId = adminBranchId || queryBranchId;

    if (!adminRestaurantId) {
        throw new BadRequest("Restaurant ID not found");
    }

    // 1. شروط الفروع
    const branchConditions: any[] = [
        eq(branches.restaurantId, adminRestaurantId),
        eq(branches.status, "active"),
    ];

    if (adminBranchId) {
        branchConditions.push(eq(branches.id, adminBranchId));
    }

    // 2. شروط المناطق (Zones)
    const zoneConditions: any[] = [
        eq(restaurantZoneDeliveryFees.restaurantId, adminRestaurantId),
        eq(restaurantZoneDeliveryFees.status, "active"),
        eq(zones.status, "active"),
    ];

    if (filterBranchId) {
        zoneConditions.push(
            or(
                eq(restaurantZoneDeliveryFees.branchId, filterBranchId),
                isNull(restaurantZoneDeliveryFees.branchId)
            )
        );
    }

    // 3. تنفيذ الـ Queries بالتوازي (Branches, Zones, Business Plans)
    const [branchList, rawZones, businessPlans] = await Promise.all([
        db
            .select({
                id: branches.id,
                name: branches.name,
                nameAr: branches.nameAr,
                nameFr: branches.nameFr,
                zoneId: branches.zoneId,
            })
            .from(branches)
            .where(and(...branchConditions)),

        db
            .select({
                id: zones.id,
                name: zones.name,
                nameAr: zones.nameAr,
                nameFr: zones.nameFr,
                displayName: zones.displayName,
                displayNameAr: zones.displayNameAr,
                displayNameFr: zones.displayNameFr,
                cityId: restaurantZoneDeliveryFees.cityId,
            })
            .from(restaurantZoneDeliveryFees)
            .innerJoin(zones, eq(restaurantZoneDeliveryFees.zoneId, zones.id))
            .where(and(...zoneConditions)),

        db
            .select({
                platformType: restaurantBusinessPlans.platformType,
                aggregatorStatus: restaurantBusinessPlans.aggregatorStatus,
                mykeetoStatus: restaurantBusinessPlans.mykeetoStatus,
            })
            .from(restaurantBusinessPlans)
            .where(eq(restaurantBusinessPlans.restaurantId, adminRestaurantId)),
    ]);

    // Deduplicate zones in case multiple fee rules exist for the same zone
    const zoneMap = new Map<string, (typeof rawZones)[0]>();
    for (const z of rawZones) {
        if (!zoneMap.has(z.id)) {
            zoneMap.set(z.id, z);
        }
    }
    const zoneList = Array.from(zoneMap.values());

    // 4. جلب المدن المرتبطة بالمناطق
    const cityIds = [...new Set(zoneList.map((z) => z.cityId).filter(Boolean))];
    let cityList: any[] = [];
    if (cityIds.length > 0) {
        cityList = await db
            .select({
                id: cities.id,
                name: cities.name,
                nameAr: cities.nameAr,
                nameFr: cities.nameFr,
            })
            .from(cities)
            .where(and(inArray(cities.id, cityIds as string[]), eq(cities.status, "active")));
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

    return SuccessResponse(res, {
        message: "Get select data success",
        data: {
            branches: branchList,
            zones: zoneList,
            cities: cityList,
            sources,
        },
    });
};