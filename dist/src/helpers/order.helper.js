"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOrderStatusConditions = exports.normalizeOrderStatus = exports.VALID_ORDER_STATUSES = exports.buildOrderCancellationConditions = exports.buildOrderUserAndTypeConditions = exports.buildOrderDiscountAndPaymentConditions = exports.parseMultiFilterValues = exports.resolvePaymentMethodDetails = exports.parseShippingAddress = exports.buildOrderDateConditions = exports.getRestaurantShiftStartTime = exports.excludeUnpaidVisaOrders = void 0;
const dayjs_1 = __importDefault(require("dayjs"));
const utc_1 = __importDefault(require("dayjs/plugin/utc"));
const timezone_1 = __importDefault(require("dayjs/plugin/timezone"));
const connection_1 = require("../models/connection");
const schema_1 = require("../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const BadRequest_1 = require("../Errors/BadRequest");
const forbiddenError_1 = require("../Errors/forbiddenError");
dayjs_1.default.extend(utc_1.default);
dayjs_1.default.extend(timezone_1.default);
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
const excludeUnpaidVisaOrders = () => (0, drizzle_orm_1.sql) `(
        (
            (
                ${schema_1.orders.paymentMethod} IS NULL
                OR (
                    LOWER(${schema_1.orders.paymentMethod}) <> 'visa'
                    AND ${schema_1.orders.paymentMethod} NOT IN (
                        SELECT id FROM payment_methods
                        WHERE LOWER(name) LIKE '%visa%'
                    )
                )
            )
            AND ${schema_1.orders.paymentGateway} IS NULL
        )
        OR ${schema_1.orders.paymentStatus} IS NULL
        OR ${schema_1.orders.paymentStatus} NOT IN ('pending_payment', 'payment_failed')
    )`;
exports.excludeUnpaidVisaOrders = excludeUnpaidVisaOrders;
// ==========================================
// 1. Helper: حساب تاريخ بداية الشيفت الحالي للمطعم
// ==========================================
const getRestaurantShiftStartTime = async (restaurantId) => {
    // الوقت الحالي محول فوراً لتوقيت القاهرة
    const nowCairo = (0, dayjs_1.default)().tz(TIMEZONE);
    const currentDayOfWeek = nowCairo.day(); // 0 = Sunday, 6 = Saturday
    const [settings] = await connection_1.db
        .select()
        .from(schema_1.restaurantSettings)
        .where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, restaurantId))
        .limit(1);
    if (settings && !settings.isAlwaysOpen) {
        const allSchedules = await connection_1.db
            .select()
            .from(schema_1.restaurantSchedules)
            .where((0, drizzle_orm_1.eq)(schema_1.restaurantSchedules.restaurantId, restaurantId));
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
exports.getRestaurantShiftStartTime = getRestaurantShiftStartTime;
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
const buildOrderDateConditions = async (req, restaurantId, hasFilterPermission = true) => {
    const conditions = [];
    const rawStartDate = (req.query?.startDate ||
        req.query?.start_date ||
        req.query?.startt ||
        req.query?.fromDate ||
        req.query?.from_date ||
        req.query?.date);
    const rawEndDate = (req.query?.endDate ||
        req.query?.end_date ||
        req.query?.toDate ||
        req.query?.to_date);
    let startDate;
    let endDate;
    // 0. إذا لم يكن للمستخدم صلاحية filter، يُسمح فقط بتاريخ اليوم الحالي / الشيفت الحالي، وأي تاريخ آخر يُرفض بـ 403
    if (!hasFilterPermission && (rawStartDate || rawEndDate)) {
        const todayCairoStr = (0, dayjs_1.default)().tz(TIMEZONE).format("YYYY-MM-DD");
        const shiftStart = await (0, exports.getRestaurantShiftStartTime)(restaurantId);
        const shiftStartDayStr = (0, dayjs_1.default)(shiftStart).tz(TIMEZONE).format("YYYY-MM-DD");
        const parseToCairoDay = (val) => {
            if (!val)
                return null;
            if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
                return val;
            }
            const d = (0, dayjs_1.default)(val);
            return d.isValid() ? d.tz(TIMEZONE).format("YYYY-MM-DD") : null;
        };
        const startDayStr = parseToCairoDay(rawStartDate);
        const endDayStr = parseToCairoDay(rawEndDate);
        const isStartValid = !startDayStr || startDayStr === todayCairoStr || startDayStr === shiftStartDayStr;
        const isEndValid = !endDayStr || endDayStr === todayCairoStr || endDayStr === shiftStartDayStr;
        if (!isStartValid || !isEndValid) {
            throw new forbiddenError_1.ForbiddenError("You don't have permission to filter orders by date. Only current date/shift orders are available.");
        }
    }
    // 1. معالجة تاريخ البداية
    if (rawStartDate) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(rawStartDate)) {
            // YYYY-MM-DD يحول لبداية اليوم بتوقيت القاهرة
            startDate = dayjs_1.default.tz(rawStartDate, TIMEZONE).startOf("day").toDate();
        }
        else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(rawStartDate)) {
            // datetime مع توقيت (ISO 8601): لو فيه offset (Z أو +HH:MM) يتعامل dayjs معه تلقائيًا
            // لو بدون offset يُعامَل كتوقيت القاهرة
            const hasOffset = /[Z+\-]\d*:\d*$|Z$/.test(rawStartDate);
            startDate = hasOffset
                ? (0, dayjs_1.default)(rawStartDate).toDate()
                : dayjs_1.default.tz(rawStartDate, TIMEZONE).toDate();
        }
        else {
            const parsed = (0, dayjs_1.default)(rawStartDate);
            if (!parsed.isValid())
                throw new BadRequest_1.BadRequest("startDate format is invalid. Use YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss");
            startDate = parsed.toDate();
        }
    }
    else {
        startDate = await (0, exports.getRestaurantShiftStartTime)(restaurantId);
    }
    // 2. معالجة تاريخ النهاية
    if (rawEndDate) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(rawEndDate)) {
            // YYYY-MM-DD يحول لنهاية اليوم بتوقيت القاهرة (23:59:59)
            endDate = dayjs_1.default.tz(rawEndDate, TIMEZONE).endOf("day").toDate();
        }
        else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(rawEndDate)) {
            // datetime مع توقيت (ISO 8601)
            const hasOffset = /[Z+\-]\d*:\d*$|Z$/.test(rawEndDate);
            endDate = hasOffset
                ? (0, dayjs_1.default)(rawEndDate).toDate()
                : dayjs_1.default.tz(rawEndDate, TIMEZONE).toDate();
        }
        else {
            const parsed = (0, dayjs_1.default)(rawEndDate);
            if (!parsed.isValid())
                throw new BadRequest_1.BadRequest("endDate format is invalid. Use YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss");
            endDate = parsed.toDate();
        }
    }
    // 3. التحقق من صحة المدخلات (فحص خطأ startDate > endDate)
    if (startDate && endDate && startDate > endDate) {
        throw new BadRequest_1.BadRequest("startDate cannot be after endDate");
    }
    conditions.push((0, drizzle_orm_1.gte)(schema_1.orders.createdAt, startDate));
    if (endDate) {
        conditions.push((0, drizzle_orm_1.lte)(schema_1.orders.createdAt, endDate));
    }
    return conditions;
};
exports.buildOrderDateConditions = buildOrderDateConditions;
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
const parseShippingAddress = (value) => {
    if (!value)
        return null;
    if (typeof value === "object")
        return value;
    try {
        const parsed = JSON.parse(value);
        return typeof parsed === "object" && parsed !== null ? parsed : null;
    }
    catch {
        return null;
    }
};
exports.parseShippingAddress = parseShippingAddress;
// ==========================================
// Helper: استخراج وتنسيق بيانات وسيلة الدفع (ID, Name, NameAr)
// ==========================================
/**
 * Resolves payment method ID, English name, and Arabic name.
 * Handles database payment methods join or fallback for known slugs
 * like 'cash_on_delivery', 'visa', 'wallet', 'cash', etc.
 */
const resolvePaymentMethodDetails = (pmId, pmName, pmNameAr) => {
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
exports.resolvePaymentMethodDetails = resolvePaymentMethodDetails;
/**
 * Helper to parse query parameter values that can be passed as:
 * - A single string (e.g. "product_discount" or a UUID)
 * - Comma-separated strings (e.g. "product_discount,discount_id" or "id1,id2")
 * - JSON array string (e.g. '["id1","id2"]')
 * - An array of strings / values (e.g. ['product_discount', 'discount_id'])
 */
const parseMultiFilterValues = (val) => {
    if (!val)
        return [];
    if (Array.isArray(val)) {
        return val.flatMap((v) => (0, exports.parseMultiFilterValues)(v)).filter(Boolean);
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
            }
            catch {
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
exports.parseMultiFilterValues = parseMultiFilterValues;
// ==========================================
// Helper: فلترة الطلبات حسب نوع الخصم وطريقة الدفع
// ==========================================
const buildOrderDiscountAndPaymentConditions = (req) => {
    const conditions = [];
    const query = req.query || {};
    // 1. فلترة وسيلة الدفع (يدعم طريقة واحدة أو عدة طرق كـ comma-separated أو مصفوفة)
    const paymentMethodParams = (0, exports.parseMultiFilterValues)(query.paymentMethod ?? query.payment_method ?? query.paymentMethods ?? query.payment_methods);
    if (paymentMethodParams.length > 0) {
        const pmConditions = paymentMethodParams.map((param) => {
            const pm = param.toLowerCase();
            if (pm === "cash" || pm === "cash_on_delivery" || pm === "كاش" || pm === "استلام") {
                return (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, "cash"), (0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, "cash_on_delivery"), (0, drizzle_orm_1.like)(schema_1.paymentMethods.name, "%cash%"), (0, drizzle_orm_1.like)(schema_1.paymentMethods.nameAr, "%استلام%"), (0, drizzle_orm_1.like)(schema_1.paymentMethods.nameAr, "%كاش%"));
            }
            else if (pm === "visa" || pm === "card" || pm === "online" || pm === "فيزا" || pm === "بطاقة") {
                return (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, "visa"), (0, drizzle_orm_1.like)(schema_1.paymentMethods.name, "%visa%"), (0, drizzle_orm_1.like)(schema_1.paymentMethods.name, "%card%"), (0, drizzle_orm_1.like)(schema_1.paymentMethods.nameAr, "%فيزا%"), (0, drizzle_orm_1.like)(schema_1.paymentMethods.nameAr, "%بطاقة%"));
            }
            else if (pm === "wallet" || pm === "محفظة" || pm === "محفظتي") {
                return (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, "wallet"), (0, drizzle_orm_1.like)(schema_1.paymentMethods.name, "%wallet%"), (0, drizzle_orm_1.like)(schema_1.paymentMethods.nameAr, "%محفظ%"));
            }
            else {
                return (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, param), (0, drizzle_orm_1.like)(schema_1.paymentMethods.name, `%${param}%`), (0, drizzle_orm_1.like)(schema_1.paymentMethods.nameAr, `%${param}%`));
            }
        });
        if (pmConditions.length === 1) {
            conditions.push(pmConditions[0]);
        }
        else if (pmConditions.length > 1) {
            conditions.push((0, drizzle_orm_1.or)(...pmConditions));
        }
    }
    // 2. فلترة خصم معين بالـ ID (يدعم ID واحد أو عدة IDs مفصولة بفاصلة أو JSON أو مصفوفة)
    const discountIds = (0, exports.parseMultiFilterValues)(query.discountId ?? query.discount_id ?? query.discountIds ?? query.discount_ids);
    if (discountIds.length === 1) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.discountId, discountIds[0]));
    }
    else if (discountIds.length > 1) {
        conditions.push((0, drizzle_orm_1.inArray)(schema_1.orders.discountId, discountIds));
    }
    // 3. فلترة كوبون معين بالـ ID أو الكود (يدعم ID واحد أو عدة IDs مفصولة بفاصلة أو JSON أو مصفوفة)
    const couponIds = (0, exports.parseMultiFilterValues)(query.couponId ?? query.coupon_id ?? query.couponIds ?? query.coupon_ids);
    if (couponIds.length === 1) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.couponId, couponIds[0]));
    }
    else if (couponIds.length > 1) {
        conditions.push((0, drizzle_orm_1.inArray)(schema_1.orders.couponId, couponIds));
    }
    const couponCodes = (0, exports.parseMultiFilterValues)(query.couponCode ?? query.coupon_code ?? query.couponCodes ?? query.coupon_codes);
    if (couponCodes.length === 1) {
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.orders.couponCode, couponCodes[0]), (0, drizzle_orm_1.like)(schema_1.orders.couponCode, `%${couponCodes[0]}%`)));
    }
    else if (couponCodes.length > 1) {
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.inArray)(schema_1.orders.couponCode, couponCodes), ...couponCodes.map((code) => (0, drizzle_orm_1.like)(schema_1.orders.couponCode, `%${code}%`))));
    }
    // 4. فلترة خصم أول طلب بالـ ID (يدعم ID واحد أو عدة IDs مفصولة بفاصلة أو JSON أو مصفوفة)
    const firstOrderDiscountIds = (0, exports.parseMultiFilterValues)(query.firstOrderDiscountId ?? query.first_order_discount_id ?? query.firstOrderDiscountIds ?? query.first_order_discount_ids);
    if (firstOrderDiscountIds.length === 1) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.firstOrderDiscountId, firstOrderDiscountIds[0]));
    }
    else if (firstOrderDiscountIds.length > 1) {
        conditions.push((0, drizzle_orm_1.inArray)(schema_1.orders.firstOrderDiscountId, firstOrderDiscountIds));
    }
    // 5. فلترة مصدر الخصم discountSource (يدعم قيمة واحدة أو قيم متعددة)
    const discountSources = (0, exports.parseMultiFilterValues)(query.discountSource ?? query.discount_source ?? query.discountSources ?? query.discount_sources);
    if (discountSources.length === 1) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.discountSource, discountSources[0]));
    }
    else if (discountSources.length > 1) {
        conditions.push((0, drizzle_orm_1.inArray)(schema_1.orders.discountSource, discountSources));
    }
    // 6. فلترة نوع الخصم (يدعم قيمة واحدة أو قيم متعددة مثل ?discountType=product_discount,discount_id)
    const discountTypes = (0, exports.parseMultiFilterValues)(query.discountType ?? query.discount_type ?? query.discountTypes ?? query.discount_types);
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
                    return (0, drizzle_orm_1.eq)(schema_1.orders.discountSource, "food_level");
                case "discount_id":
                case "discount":
                case "restaurant_discount":
                case "global_discount":
                case "campaign":
                case "خصم_مطعم":
                case "خصم_حملة":
                case "خصم":
                    return (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNotNull)(schema_1.orders.discountId), (0, drizzle_orm_1.eq)(schema_1.orders.discountSource, "restaurant_discount"), (0, drizzle_orm_1.eq)(schema_1.orders.discountSource, "global_discount"));
                case "coupon":
                case "coupon_code":
                case "promo":
                case "promo_code":
                case "كوبون":
                case "كود_خصم":
                    return (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNotNull)(schema_1.orders.couponId), (0, drizzle_orm_1.and)((0, drizzle_orm_1.isNotNull)(schema_1.orders.couponCode), (0, drizzle_orm_1.sql) `${schema_1.orders.couponCode} <> ''`), (0, drizzle_orm_1.eq)(schema_1.orders.discountSource, "coupon"));
                case "first_order_discount":
                case "first_order":
                case "firstorder":
                case "أول_طلب":
                case "اول_طلب":
                case "خصم_اول_طلب":
                    return (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNotNull)(schema_1.orders.firstOrderDiscountId), (0, drizzle_orm_1.eq)(schema_1.orders.discountSource, "first_order_discount"));
                case "free_delivery":
                case "free_shipping":
                case "freedelivery":
                case "توصيل_مجاني":
                    return (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orders.orderType, "delivery"), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.orders.deliveryFee, "0.00"), (0, drizzle_orm_1.isNull)(schema_1.orders.deliveryFee), (0, drizzle_orm_1.sql) `EXISTS (
                                    SELECT 1 FROM coupons c
                                    WHERE (c.id = ${schema_1.orders.couponId} OR c.code = ${schema_1.orders.couponCode})
                                    AND c.discount_type = 'free_delivery'
                                )`));
                case "points":
                case "redeem_points":
                case "points_redeemed":
                case "reedem_points":
                case "نقاط":
                    return (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.orders.isPointsRedeemed, true), (0, drizzle_orm_1.and)((0, drizzle_orm_1.isNotNull)(schema_1.orders.redeemCode), (0, drizzle_orm_1.sql) `${schema_1.orders.redeemCode} <> ''`));
                case "percentage":
                case "نسبة":
                    return (0, drizzle_orm_1.eq)(schema_1.orders.discountType, "percentage");
                case "fixed_amount":
                case "fixed":
                case "مبلغ_ثابت":
                    return (0, drizzle_orm_1.eq)(schema_1.orders.discountType, "fixed_amount");
                default:
                    return (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.orders.discountType, rawType), (0, drizzle_orm_1.eq)(schema_1.orders.discountSource, rawType));
            }
        })
            .filter(Boolean);
        if (typeConditions.length === 1) {
            conditions.push(typeConditions[0]);
        }
        else if (typeConditions.length > 1) {
            conditions.push((0, drizzle_orm_1.or)(...typeConditions));
        }
    }
    // 7. فلترة الطلبات التي تحتوي على خصم بشكل عام (hasDiscount)
    const discountFilter = (query.hasDiscount || query.discounted || query.isDiscounted || query.hasDiscounts);
    if (discountFilter !== undefined && discountFilter !== "") {
        const isDiscount = discountFilter === "true" || discountFilter === "1";
        if (isDiscount) {
            conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.gt)(schema_1.orders.discountAmount, "0.00"), (0, drizzle_orm_1.isNotNull)(schema_1.orders.discountId), (0, drizzle_orm_1.isNotNull)(schema_1.orders.couponId), (0, drizzle_orm_1.isNotNull)(schema_1.orders.firstOrderDiscountId)));
        }
        else {
            conditions.push((0, drizzle_orm_1.and)((0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(schema_1.orders.discountAmount), (0, drizzle_orm_1.eq)(schema_1.orders.discountAmount, "0.00")), (0, drizzle_orm_1.isNull)(schema_1.orders.discountId), (0, drizzle_orm_1.isNull)(schema_1.orders.couponId), (0, drizzle_orm_1.isNull)(schema_1.orders.firstOrderDiscountId)));
        }
    }
    // 8. فلترة طلبات استبدال النقاط (isPointsRedeemed)
    const redeemFilter = (query.isPointsRedeemed || query.reedempoints || query.redeemPoints || query.reedemPoints || query.hasRedeemPoints);
    if (redeemFilter !== undefined && redeemFilter !== "") {
        const isRedeem = redeemFilter === "true" || redeemFilter === "1";
        if (isRedeem) {
            conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.orders.isPointsRedeemed, true), (0, drizzle_orm_1.isNotNull)(schema_1.orders.redeemCode)));
        }
        else {
            conditions.push((0, drizzle_orm_1.and)((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.orders.isPointsRedeemed, false), (0, drizzle_orm_1.isNull)(schema_1.orders.isPointsRedeemed)), (0, drizzle_orm_1.isNull)(schema_1.orders.redeemCode)));
        }
    }
    return conditions;
};
exports.buildOrderDiscountAndPaymentConditions = buildOrderDiscountAndPaymentConditions;
// ==========================================
// Helper: فلترة الطلبات حسب نوع الطلب (orderType) وبيانات العميل (الاسم، الإيميل، الهاتف)
// ==========================================
const buildOrderUserAndTypeConditions = (req) => {
    const conditions = [];
    const query = req.query || {};
    // 1. فلترة نوع الطلب (Order Type: delivery, takeaway, dine_in)
    const rawOrderType = query.orderType?.trim();
    if (rawOrderType && rawOrderType !== "all" && rawOrderType !== "null" && rawOrderType !== "undefined") {
        const normalizeOrderType = (t) => {
            const s = t.trim().toLowerCase();
            if (s === "delivery" || s === "توصيل" || s === "دليفري")
                return "delivery";
            if (s === "takeaway" || s === "take_away" || s === "استلام" || s === "تيك_اواي" || s === "تيك اوي" || s === "سفري")
                return "takeaway";
            if (s === "dine_in" || s === "dinein" || s === "صالة" || s === "محلي")
                return "dine_in";
            return s;
        };
        if (rawOrderType.includes(",")) {
            const types = rawOrderType
                .split(",")
                .map((t) => normalizeOrderType(t))
                .filter((t) => ["delivery", "takeaway", "dine_in"].includes(t));
            if (types.length > 1) {
                conditions.push((0, drizzle_orm_1.inArray)(schema_1.orders.orderType, types));
            }
            else if (types.length === 1) {
                conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.orderType, types[0]));
            }
        }
        else {
            const normalized = normalizeOrderType(rawOrderType);
            if (["delivery", "takeaway", "dine_in"].includes(normalized)) {
                conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.orderType, normalized));
            }
        }
    }
    // 2. البحث عن العميل (Search by name, email, or phone)
    const search = (query.search || query.q)?.trim();
    if (search && search !== "null" && search !== "undefined") {
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(schema_1.users.name, `%${search}%`), (0, drizzle_orm_1.like)(schema_1.users.email, `%${search}%`), (0, drizzle_orm_1.like)(schema_1.users.phone, `%${search}%`), (0, drizzle_orm_1.like)(schema_1.users.alternatePhone, `%${search}%`), (0, drizzle_orm_1.sql) `JSON_UNQUOTE(JSON_EXTRACT(${schema_1.orders.shippingAddress}, '$.phone')) LIKE ${`%${search}%`}`));
    }
    return conditions;
};
exports.buildOrderUserAndTypeConditions = buildOrderUserAndTypeConditions;
// ==========================================
// Helper: فلترة الطلبات الملغاة حسب من قام بالإلغاء (User vs Restaurant)
// ==========================================
/**
 * Filters cancelled orders by who cancelled them:
 * - cancelReasonType or canceledType: 'user' | 'restaurant'
 */
const buildOrderCancellationConditions = (req, options) => {
    const conditions = [];
    const query = req.query || {};
    const rawType = (query.cancelReasonType || query.canceledType || query.cancelledType);
    if (rawType) {
        const val = rawType.trim().toLowerCase();
        if (val === "user" || val === "restaurant") {
            if (options?.enforceCancelledStatusIfFiltered) {
                conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.status, "cancelled"));
            }
            conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.orders.cancelReasonType, val), (0, drizzle_orm_1.sql) `EXISTS (SELECT 1 FROM select_reasons sr WHERE sr.id = ${schema_1.orders.cancelReasonId} AND sr.type = ${val})`));
        }
    }
    return conditions;
};
exports.buildOrderCancellationConditions = buildOrderCancellationConditions;
// ==========================================
// Helper: فلترة الطلبات حسب حالة الطلب (Order Status)
// ==========================================
exports.VALID_ORDER_STATUSES = [
    "pending",
    "accepted",
    "preparing",
    "out_for_delivery",
    "delivered",
    "cancelled",
    "refund",
    "failed",
];
const normalizeOrderStatus = (val) => {
    if (!val || typeof val !== "string")
        return "";
    const s = val.trim().toLowerCase().replace(/[- ]+/g, "_");
    switch (s) {
        case "pending":
        case "معلق":
        case "قيد_الانتظار":
        case "جديد":
            return "pending";
        case "accepted":
        case "مقبول":
        case "تم_القبول":
            return "accepted";
        case "preparing":
        case "قيد_التحضير":
        case "تحضير":
        case "جاري_التحضير":
            return "preparing";
        case "out_for_delivery":
        case "outfordelivery":
        case "out_delivery":
        case "في_الطريق":
        case "خرج_للتوصيل":
            return "out_for_delivery";
        case "delivered":
        case "تم_التوصيل":
        case "مكتمل":
        case "مسلم":
            return "delivered";
        case "cancelled":
        case "canceled":
        case "ملغي":
        case "ملغى":
        case "تم_الإلغاء":
        case "تم_الالغاء":
            return "cancelled";
        case "refund":
        case "refunded":
        case "مسترجع":
            return "refund";
        case "failed":
        case "فاشل":
            return "failed";
        default:
            return s;
    }
};
exports.normalizeOrderStatus = normalizeOrderStatus;
/**
 * Builds SQL conditions for filtering orders by status / orderStatus.
 * Supports:
 * - Query parameters: orderStatus, status, order_status, orderStatuses, order_statuses, and params.status
 * - Multiple formats: single string, comma-separated ("pending,accepted"), JSON array ('["pending","accepted"]'), array of strings
 * - Arabic / normalized status values
 * - Optional fallbackStatus if no query parameter is provided (e.g. for getPendingOrders)
 */
const buildOrderStatusConditions = (req, fallbackStatus) => {
    const conditions = [];
    const query = req.query || {};
    const rawValues = (0, exports.parseMultiFilterValues)(query.orderStatus ?? query.status ?? req.params?.status);
    let statuses = rawValues
        .map((v) => (0, exports.normalizeOrderStatus)(v))
        .filter((v) => exports.VALID_ORDER_STATUSES.includes(v));
    // إذا لم يأتِ أي status في الـ query وكان هناك fallbackStatus ممرر (مثل "pending" في getPendingOrders)
    if (statuses.length === 0 && fallbackStatus) {
        const normalizedFallback = (0, exports.normalizeOrderStatus)(fallbackStatus);
        if (exports.VALID_ORDER_STATUSES.includes(normalizedFallback)) {
            statuses = [normalizedFallback];
        }
    }
    if (statuses.length === 1) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.orders.status, statuses[0]));
    }
    else if (statuses.length > 1) {
        conditions.push((0, drizzle_orm_1.inArray)(schema_1.orders.status, statuses));
    }
    return conditions;
};
exports.buildOrderStatusConditions = buildOrderStatusConditions;
