import { Request } from "express";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { db } from "../models/connection";
import { orders, restaurantSettings, restaurantSchedules, paymentMethods, coupons, orderItems, food, users } from "../models/schema";
import { eq, gte, lte, sql, or, and, isNull, isNotNull, gt, like, inArray } from "drizzle-orm";
import { BadRequest } from "../Errors/BadRequest";
import { ForbiddenError } from "../Errors/forbiddenError";

dayjs.extend(utc);
dayjs.extend(timezone);

const TIMEZONE = "Africa/Cairo";

// ==========================================
// Helper: استبعاد طلبات الفيزا غير المدفوعة من أي كويري
// ==========================================
/**
 * يرجع شرط SQL جاهز يُضاف لأي conditions array.
 * يُخفي طلبات الفيزا التي لم يتم تأكيد الدفع فيها بعد
 * (paymentStatus = pending_payment أو payment_failed).
 * الطلب يظهر فقط لما paymentStatus = 'paid'،
 * أما طلبات الكاش والمحفظة فلا تتأثر.
 * طلبات بدون payment_method (NULL) لا تتأثر وتظهر دائماً.
 *
 * ⚠️ payment_method يخزّن UUID وليس اسم الطريقة —
 *    لذا نستخدم subquery لجلب ID الفيزا من جدول payment_methods.
 *
 * @example
 * const conditions = [
 *   eq(orders.restaurantId, restaurantId),
 *   excludeUnpaidVisaOrders(),
 * ];
 */
export const excludeUnpaidVisaOrders = () =>
    sql`(
        (
            (
                ${orders.paymentMethod} IS NULL
                OR (
                    LOWER(${orders.paymentMethod}) <> 'visa'
                    AND ${orders.paymentMethod} NOT IN (
                        SELECT id FROM payment_methods
                        WHERE LOWER(name) LIKE '%visa%'
                    )
                )
            )
            AND ${orders.paymentGateway} IS NULL
        )
        OR ${orders.paymentStatus} IS NULL
        OR ${orders.paymentStatus} NOT IN ('pending_payment', 'payment_failed')
    )`;


// ==========================================
// 1. Helper: حساب تاريخ بداية الشيفت الحالي للمطعم
// ==========================================
export const getRestaurantShiftStartTime = async (restaurantId: string): Promise<Date> => {
    // الوقت الحالي محول فوراً لتوقيت القاهرة
    const nowCairo = dayjs().tz(TIMEZONE);
    const currentDayOfWeek = nowCairo.day(); // 0 = Sunday, 6 = Saturday

    const [settings] = await db
        .select()
        .from(restaurantSettings)
        .where(eq(restaurantSettings.restaurantId, restaurantId))
        .limit(1);

    if (settings && !settings.isAlwaysOpen) {
        const allSchedules = await db
            .select()
            .from(restaurantSchedules)
            .where(eq(restaurantSchedules.restaurantId, restaurantId));

        const todaySchedule = allSchedules.find((s) => s.dayOfWeek === currentDayOfWeek);

        if (todaySchedule && todaySchedule.openingTime && !todaySchedule.isOffDay) {
            const [openHour, openMinute] = todaySchedule.openingTime.split(":").map(Number);
            
            // وقت الفتح لليوم الحالي بتوقيت القاهرة
            const todayOpeningTime = nowCairo
                .hour(openHour)
                .minute(openMinute)
                .second(0)
                .millisecond(0);

            // إذا كان الوقت الحالي قبل موعد الفتح اليومي -> الشيفت بدأ في اليوم السابق
            if (nowCairo.isBefore(todayOpeningTime)) {
                const yesterdayCairo = nowCairo.subtract(1, "day");
                const yesterdaySchedule = allSchedules.find((s) => s.dayOfWeek === yesterdayCairo.day());
                
                const [yOpenHour, yOpenMinute] = (yesterdaySchedule?.openingTime || "00:00").split(":").map(Number);

                return yesterdayCairo
                    .hour(yOpenHour)
                    .minute(yOpenMinute)
                    .second(0)
                    .millisecond(0)
                    .toDate();
            }

            return todayOpeningTime.toDate();
        }
    }

    // الافتراضي: بداية اليوم الحالي 00:00:00 بتوقيت القاهرة
    return nowCairo.startOf("day").toDate();
};

// ==========================================
// 2. Helper: بناء شروط التاريخ وفحص مدخلات المطور/العميل
// ==========================================
/**
 * @param req              - Express request
 * @param restaurantId     - Restaurant context
 * @param hasFilterPermission - Whether the caller has the "filter" permission on the orders module.
 *                             When false, any attempt to supply custom date params throws a ForbiddenError
 *                             and only the current shift's orders are returned.
 */
export const buildOrderDateConditions = async (
    req: Request,
    restaurantId: string,
    hasFilterPermission: boolean = true
): Promise<any[]> => {
    const conditions: any[] = [];

    const rawStartDate = (
        req.query?.startDate ||
        req.query?.start_date ||
        req.query?.startt ||
        req.query?.fromDate ||
        req.query?.from_date ||
        req.query?.date
    ) as string | undefined;

    const rawEndDate = (
        req.query?.endDate ||
        req.query?.end_date ||
        req.query?.toDate ||
        req.query?.to_date
    ) as string | undefined;

    let startDate: Date;
    let endDate: Date | undefined;

    // 0. إذا لم يكن للمستخدم صلاحية filter، يُسمح فقط بتاريخ اليوم الحالي / الشيفت الحالي، وأي تاريخ آخر يُرفض بـ 403
    if (!hasFilterPermission && (rawStartDate || rawEndDate)) {
        const todayCairoStr = dayjs().tz(TIMEZONE).format("YYYY-MM-DD");
        const shiftStart = await getRestaurantShiftStartTime(restaurantId);
        const shiftStartDayStr = dayjs(shiftStart).tz(TIMEZONE).format("YYYY-MM-DD");

        const parseToCairoDay = (val?: string): string | null => {
            if (!val) return null;
            if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
                return val;
            }
            const d = dayjs(val);
            return d.isValid() ? d.tz(TIMEZONE).format("YYYY-MM-DD") : null;
        };

        const startDayStr = parseToCairoDay(rawStartDate);
        const endDayStr = parseToCairoDay(rawEndDate);

        const isStartValid = !startDayStr || startDayStr === todayCairoStr || startDayStr === shiftStartDayStr;
        const isEndValid = !endDayStr || endDayStr === todayCairoStr || endDayStr === shiftStartDayStr;

        if (!isStartValid || !isEndValid) {
            throw new ForbiddenError(
                "You don't have permission to filter orders by date. Only current date/shift orders are available."
            );
        }
    }

    // 1. معالجة تاريخ البداية
    if (rawStartDate) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(rawStartDate)) {
            // YYYY-MM-DD يحول لبداية اليوم بتوقيت القاهرة
            startDate = dayjs.tz(rawStartDate, TIMEZONE).startOf("day").toDate();
        } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(rawStartDate)) {
            // datetime مع توقيت (ISO 8601): لو فيه offset (Z أو +HH:MM) يتعامل dayjs معه تلقائيًا
            // لو بدون offset يُعامَل كتوقيت القاهرة
            const hasOffset = /[Z+\-]\d*:\d*$|Z$/.test(rawStartDate);
            startDate = hasOffset
                ? dayjs(rawStartDate).toDate()
                : dayjs.tz(rawStartDate, TIMEZONE).toDate();
        } else {
            const parsed = dayjs(rawStartDate);
            if (!parsed.isValid()) throw new BadRequest("startDate format is invalid. Use YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss");
            startDate = parsed.toDate();
        }
    } else {
        startDate = await getRestaurantShiftStartTime(restaurantId);
    }

    // 2. معالجة تاريخ النهاية
    if (rawEndDate) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(rawEndDate)) {
            // YYYY-MM-DD يحول لنهاية اليوم بتوقيت القاهرة (23:59:59)
            endDate = dayjs.tz(rawEndDate, TIMEZONE).endOf("day").toDate();
        } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(rawEndDate)) {
            // datetime مع توقيت (ISO 8601)
            const hasOffset = /[Z+\-]\d*:\d*$|Z$/.test(rawEndDate);
            endDate = hasOffset
                ? dayjs(rawEndDate).toDate()
                : dayjs.tz(rawEndDate, TIMEZONE).toDate();
        } else {
            const parsed = dayjs(rawEndDate);
            if (!parsed.isValid()) throw new BadRequest("endDate format is invalid. Use YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss");
            endDate = parsed.toDate();
        }
    }

    // 3. التحقق من صحة المدخلات (فحص خطأ startDate > endDate)
    if (startDate && endDate && startDate > endDate) {
        throw new BadRequest("startDate cannot be after endDate");
    }

    conditions.push(gte(orders.createdAt, startDate));
    if (endDate) {
        conditions.push(lte(orders.createdAt, endDate));
    }

    return conditions;
};


// ==========================================
// Helper: تحويل shippingAddress من JSON string إلى object
// ==========================================
/**
 * Safely parses a shippingAddress value that may be stored as a
 * JSON-encoded string in the database.
 *
 * @param value - The raw shippingAddress value (string | object | null | undefined)
 * @returns Parsed object, or null if the value is absent / invalid JSON
 *
 * @example
 * const address = parseShippingAddress(order.shippingAddress);
 * // { title: 'work', street: 'شارع مسجد حاتم', lat: 31.21, lng: 29.94, ... }
 */
export const parseShippingAddress = (
    value: string | object | null | undefined
): Record<string, unknown> | null => {
    if (!value) return null;
    if (typeof value === "object") return value as Record<string, unknown>;
    try {
        const parsed = JSON.parse(value);
        return typeof parsed === "object" && parsed !== null ? parsed : null;
    } catch {
        return null;
    }
};

// ==========================================
// Helper: استخراج وتنسيق بيانات وسيلة الدفع (ID, Name, NameAr)
// ==========================================
/**
 * Resolves payment method ID, English name, and Arabic name.
 * Handles database payment methods join or fallback for known slugs
 * like 'cash_on_delivery', 'visa', 'wallet', 'cash', etc.
 */
export const resolvePaymentMethodDetails = (
    pmId: string | null | undefined,
    pmName?: string | null,
    pmNameAr?: string | null
): { id: string | null; name: string | null; nameAr: string | null } => {
    if (pmName) {
        return {
            id: pmId ?? null,
            name: pmName,
            nameAr: pmNameAr || pmName,
        };
    }
    if (!pmId) {
        return { id: null, name: null, nameAr: null };
    }
    switch (pmId) {
        case "cash_on_delivery":
        case "cash":
            return { id: pmId, name: "Cash on Delivery", nameAr: "الدفع عند الاستلام" };
        case "visa":
            return { id: pmId, name: "Credit Card", nameAr: "بطاقة" };
        case "wallet":
            return { id: pmId, name: "Wallet", nameAr: "محفظتي" };
        default:
            return { id: pmId, name: pmId, nameAr: pmId };
    }
};

/**
 * Helper to parse query parameter values that can be passed as:
 * - A single string (e.g. "product_discount" or a UUID)
 * - Comma-separated strings (e.g. "product_discount,discount_id" or "id1,id2")
 * - JSON array string (e.g. '["id1","id2"]')
 * - An array of strings / values (e.g. ['product_discount', 'discount_id'])
 */
export const parseMultiFilterValues = (val: any): string[] => {
    if (!val) return [];
    if (Array.isArray(val)) {
        return val.flatMap((v) => parseMultiFilterValues(v)).filter(Boolean);
    }
    if (typeof val === "string") {
        const trimmed = val.trim();
        if (!trimmed || trimmed === "null" || trimmed === "undefined" || trimmed === "all") {
            return [];
        }
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    return parsed
                        .map((item) => String(item).trim())
                        .filter((item) => item && item !== "null" && item !== "undefined" && item !== "all");
                }
            } catch {
                // Not valid JSON, continue with comma separation
            }
        }
        return trimmed
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item && item !== "null" && item !== "undefined" && item !== "all");
    }
    return [];
};

// ==========================================
// Helper: فلترة الطلبات حسب نوع الخصم وطريقة الدفع
// ==========================================
export const buildOrderDiscountAndPaymentConditions = (req: Request): any[] => {
    const conditions: any[] = [];
    const query = req.query || {};

    // 1. فلترة وسيلة الدفع (يدعم طريقة واحدة أو عدة طرق كـ comma-separated أو مصفوفة)
    const paymentMethodParams = parseMultiFilterValues(
        query.paymentMethod ?? query.payment_method ?? query.paymentMethods ?? query.payment_methods
    );
    if (paymentMethodParams.length > 0) {
        const pmConditions = paymentMethodParams.map((param) => {
            const pm = param.toLowerCase();
            if (pm === "cash" || pm === "cash_on_delivery" || pm === "كاش" || pm === "استلام") {
                return or(
                    eq(orders.paymentMethod, "cash"),
                    eq(orders.paymentMethod, "cash_on_delivery"),
                    like(paymentMethods.name, "%cash%"),
                    like(paymentMethods.nameAr, "%استلام%"),
                    like(paymentMethods.nameAr, "%كاش%")
                );
            } else if (pm === "visa" || pm === "card" || pm === "online" || pm === "فيزا" || pm === "بطاقة") {
                return or(
                    eq(orders.paymentMethod, "visa"),
                    like(paymentMethods.name, "%visa%"),
                    like(paymentMethods.name, "%card%"),
                    like(paymentMethods.nameAr, "%فيزا%"),
                    like(paymentMethods.nameAr, "%بطاقة%")
                );
            } else if (pm === "wallet" || pm === "محفظة" || pm === "محفظتي") {
                return or(
                    eq(orders.paymentMethod, "wallet"),
                    like(paymentMethods.name, "%wallet%"),
                    like(paymentMethods.nameAr, "%محفظ%")
                );
            } else {
                return or(
                    eq(orders.paymentMethod, param),
                    like(paymentMethods.name, `%${param}%`),
                    like(paymentMethods.nameAr, `%${param}%`)
                );
            }
        });

        if (pmConditions.length === 1) {
            conditions.push(pmConditions[0]);
        } else if (pmConditions.length > 1) {
            conditions.push(or(...pmConditions));
        }
    }

    // 2. فلترة خصم معين بالـ ID (يدعم ID واحد أو عدة IDs مفصولة بفاصلة أو JSON أو مصفوفة)
    const discountIds = parseMultiFilterValues(
        query.discountId ?? query.discount_id ?? query.discountIds ?? query.discount_ids
    );
    if (discountIds.length === 1) {
        conditions.push(eq(orders.discountId, discountIds[0]));
    } else if (discountIds.length > 1) {
        conditions.push(inArray(orders.discountId, discountIds));
    }

    // 3. فلترة كوبون معين بالـ ID أو الكود (يدعم ID واحد أو عدة IDs مفصولة بفاصلة أو JSON أو مصفوفة)
    const couponIds = parseMultiFilterValues(
        query.couponId ?? query.coupon_id ?? query.couponIds ?? query.coupon_ids
    );
    if (couponIds.length === 1) {
        conditions.push(eq(orders.couponId, couponIds[0]));
    } else if (couponIds.length > 1) {
        conditions.push(inArray(orders.couponId, couponIds));
    }

    const couponCodes = parseMultiFilterValues(
        query.couponCode ?? query.coupon_code ?? query.couponCodes ?? query.coupon_codes
    );
    if (couponCodes.length === 1) {
        conditions.push(or(eq(orders.couponCode, couponCodes[0]), like(orders.couponCode, `%${couponCodes[0]}%`)));
    } else if (couponCodes.length > 1) {
        conditions.push(
            or(
                inArray(orders.couponCode, couponCodes),
                ...couponCodes.map((code) => like(orders.couponCode, `%${code}%`))
            )
        );
    }

    // 4. فلترة خصم أول طلب بالـ ID (يدعم ID واحد أو عدة IDs مفصولة بفاصلة أو JSON أو مصفوفة)
    const firstOrderDiscountIds = parseMultiFilterValues(
        query.firstOrderDiscountId ?? query.first_order_discount_id ?? query.firstOrderDiscountIds ?? query.first_order_discount_ids
    );
    if (firstOrderDiscountIds.length === 1) {
        conditions.push(eq(orders.firstOrderDiscountId, firstOrderDiscountIds[0]));
    } else if (firstOrderDiscountIds.length > 1) {
        conditions.push(inArray(orders.firstOrderDiscountId, firstOrderDiscountIds));
    }

    // 5. فلترة مصدر الخصم discountSource (يدعم قيمة واحدة أو قيم متعددة)
    const discountSources = parseMultiFilterValues(
        query.discountSource ?? query.discount_source ?? query.discountSources ?? query.discount_sources
    );
    if (discountSources.length === 1) {
        conditions.push(eq(orders.discountSource, discountSources[0] as any));
    } else if (discountSources.length > 1) {
        conditions.push(inArray(orders.discountSource, discountSources as any));
    }

    // 6. فلترة نوع الخصم (يدعم قيمة واحدة أو قيم متعددة مثل ?discountType=product_discount,discount_id)
    const discountTypes = parseMultiFilterValues(
        query.discountType ?? query.discount_type ?? query.discountTypes ?? query.discount_types
    );
    if (discountTypes.length > 0) {
        const typeConditions = discountTypes
            .map((rawType) => {
                const normalized = rawType.toLowerCase().replace(/[-_ ]+/g, "_");
                switch (normalized) {
                    case "product_discount":
                    case "product":
                    case "food_level":
                    case "food":
                    case "food_discount":
                    case "وجبة":
                    case "منتج":
                    case "خصم_منتج":
                    case "خصم_وجبة":
                        return eq(orders.discountSource, "food_level");

                    case "discount_id":
                    case "discount":
                    case "restaurant_discount":
                    case "global_discount":
                    case "campaign":
                    case "خصم_مطعم":
                    case "خصم_حملة":
                    case "خصم":
                        return or(
                            isNotNull(orders.discountId),
                            eq(orders.discountSource, "restaurant_discount"),
                            eq(orders.discountSource, "global_discount")
                        );

                    case "coupon":
                    case "coupon_code":
                    case "promo":
                    case "promo_code":
                    case "كوبون":
                    case "كود_خصم":
                        return or(
                            isNotNull(orders.couponId),
                            and(isNotNull(orders.couponCode), sql`${orders.couponCode} <> ''`),
                            eq(orders.discountSource, "coupon")
                        );

                    case "first_order_discount":
                    case "first_order":
                    case "firstorder":
                    case "أول_طلب":
                    case "اول_طلب":
                    case "خصم_اول_طلب":
                        return or(
                            isNotNull(orders.firstOrderDiscountId),
                            eq(orders.discountSource, "first_order_discount")
                        );

                    case "free_delivery":
                    case "free_shipping":
                    case "freedelivery":
                    case "توصيل_مجاني":
                        return and(
                            eq(orders.orderType, "delivery"),
                            or(
                                eq(orders.deliveryFee, "0.00"),
                                isNull(orders.deliveryFee),
                                sql`EXISTS (
                                    SELECT 1 FROM coupons c
                                    WHERE (c.id = ${orders.couponId} OR c.code = ${orders.couponCode})
                                    AND c.discount_type = 'free_delivery'
                                )`
                            )
                        );

                    case "points":
                    case "redeem_points":
                    case "points_redeemed":
                    case "reedem_points":
                    case "نقاط":
                        return or(
                            eq(orders.isPointsRedeemed, true),
                            and(isNotNull(orders.redeemCode), sql`${orders.redeemCode} <> ''`)
                        );

                    case "percentage":
                    case "نسبة":
                        return eq(orders.discountType, "percentage");

                    case "fixed_amount":
                    case "fixed":
                    case "مبلغ_ثابت":
                        return eq(orders.discountType, "fixed_amount");

                    default:
                        return or(
                            eq(orders.discountType, rawType as any),
                            eq(orders.discountSource, rawType as any)
                        );
                }
            })
            .filter(Boolean);

        if (typeConditions.length === 1) {
            conditions.push(typeConditions[0]);
        } else if (typeConditions.length > 1) {
            conditions.push(or(...typeConditions));
        }
    }

    // 7. فلترة الطلبات التي تحتوي على خصم بشكل عام (hasDiscount)
    const discountFilter = (query.hasDiscount || query.discounted || query.isDiscounted || query.hasDiscounts) as string | undefined;
    if (discountFilter !== undefined && discountFilter !== "") {
        const isDiscount = discountFilter === "true" || discountFilter === "1";
        if (isDiscount) {
            conditions.push(
                or(
                    gt(orders.discountAmount, "0.00"),
                    isNotNull(orders.discountId),
                    isNotNull(orders.couponId),
                    isNotNull(orders.firstOrderDiscountId)
                )
            );
        } else {
            conditions.push(
                and(
                    or(isNull(orders.discountAmount), eq(orders.discountAmount, "0.00")),
                    isNull(orders.discountId),
                    isNull(orders.couponId),
                    isNull(orders.firstOrderDiscountId)
                )
            );
        }
    }

    // 8. فلترة طلبات استبدال النقاط (isPointsRedeemed)
    const redeemFilter = (query.isPointsRedeemed || query.reedempoints || query.redeemPoints || query.reedemPoints || query.hasRedeemPoints) as string | undefined;
    if (redeemFilter !== undefined && redeemFilter !== "") {
        const isRedeem = redeemFilter === "true" || redeemFilter === "1";
        if (isRedeem) {
            conditions.push(
                or(
                    eq(orders.isPointsRedeemed, true),
                    isNotNull(orders.redeemCode)
                )
            );
        } else {
            conditions.push(
                and(
                    or(eq(orders.isPointsRedeemed, false), isNull(orders.isPointsRedeemed)),
                    isNull(orders.redeemCode)
                )
            );
        }
    }

    return conditions;
};

// ==========================================
// Helper: فلترة الطلبات حسب نوع الطلب (orderType) وبيانات العميل (الاسم، الإيميل، الهاتف)
// ==========================================
export const buildOrderUserAndTypeConditions = (req: Request): any[] => {
    const conditions: any[] = [];
    const query = req.query || {};

    // 1. فلترة نوع الطلب (Order Type: delivery, takeaway, dine_in)
    const rawOrderType = (query.orderType as string)?.trim();
    if (rawOrderType && rawOrderType !== "all" && rawOrderType !== "null" && rawOrderType !== "undefined") {
        const normalizeOrderType = (t: string): string => {
            const s = t.trim().toLowerCase();
            if (s === "delivery" || s === "توصيل" || s === "دليفري") return "delivery";
            if (s === "takeaway" || s === "take_away" || s === "استلام" || s === "تيك_اواي" || s === "تيك اوي" || s === "سفري") return "takeaway";
            if (s === "dine_in" || s === "dinein" || s === "صالة" || s === "محلي") return "dine_in";
            return s;
        };

        if (rawOrderType.includes(",")) {
            const types = rawOrderType
                .split(",")
                .map((t) => normalizeOrderType(t))
                .filter((t) => ["delivery", "takeaway", "dine_in"].includes(t));
            if (types.length > 1) {
                conditions.push(inArray(orders.orderType, types as any));
            } else if (types.length === 1) {
                conditions.push(eq(orders.orderType, types[0] as any));
            }
        } else {
            const normalized = normalizeOrderType(rawOrderType);
            if (["delivery", "takeaway", "dine_in"].includes(normalized)) {
                conditions.push(eq(orders.orderType, normalized as any));
            }
        }
    }

    // 2. البحث عن العميل (Search by name, email, or phone)
    const search = ((query.search || query.q) as string)?.trim();
    if (search && search !== "null" && search !== "undefined") {
        conditions.push(
            or(
                like(users.name, `%${search}%`),
                like(users.email, `%${search}%`),
                like(users.phone, `%${search}%`),
                like(users.alternatePhone, `%${search}%`),
                sql`JSON_UNQUOTE(JSON_EXTRACT(${orders.shippingAddress}, '$.phone')) LIKE ${`%${search}%`}`
            )
        );
    }

    return conditions;
};


