"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOrderDateConditions = exports.getRestaurantShiftStartTime = void 0;
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
        else {
            startDate = (0, dayjs_1.default)(rawStartDate).toDate();
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
        else {
            endDate = (0, dayjs_1.default)(rawEndDate).toDate();
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
