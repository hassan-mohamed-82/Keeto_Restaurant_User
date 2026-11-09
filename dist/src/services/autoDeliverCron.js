"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrderTimeoutMinutes = getOrderTimeoutMinutes;
exports.processAutoDeliverOrders = processAutoDeliverOrders;
exports.initAutoDeliverCron = initAutoDeliverCron;
const node_cron_1 = __importDefault(require("node-cron"));
const drizzle_orm_1 = require("drizzle-orm");
const connection_1 = require("../models/connection");
const schema_1 = require("../models/schema");
const orderStatusService_1 = require("./orderStatusService");
const ACTIVE_STATUSES = ["preparing", "out_for_delivery"];
const MIN_AGE_MS = 5 * 60 * 1000; // safety minimum; orders newer than this are never eligible
const PAGE_SIZE = 100;
const MAX_PAGES = 20; // hard cap per run so one run can never go on forever
let isRunning = false; // prevents overlapping runs inside one instance
/**
 * Timeout in minutes for an order, based strictly on
 * order.durationOrderPreparing and restaurantSettings.
 * Returns null when nothing is configured (=> never auto-deliver).
 */
function getOrderTimeoutMinutes(order) {
    if (order.status === "preparing") {
        if (order.durationOrderPreparing && order.durationOrderPreparing > 0) {
            return order.durationOrderPreparing;
        }
        if (order.minDeliveryTime && order.minDeliveryTime > 0) {
            return order.minDeliveryTime;
        }
    }
    else if (order.status === "out_for_delivery") {
        const orderType = order.orderType || "delivery";
        if (orderType === "takeaway" && order.maxTakeAwayTime && order.maxTakeAwayTime > 0) {
            return order.maxTakeAwayTime;
        }
        if (orderType === "dine_in" && order.maxDineInTime && order.maxDineInTime > 0) {
            return order.maxDineInTime;
        }
        if (order.maxDeliveryTime && order.maxDeliveryTime > 0) {
            return order.maxDeliveryTime;
        }
        if (order.durationOrderPreparing && order.durationOrderPreparing > 0) {
            return order.durationOrderPreparing;
        }
    }
    if (order.durationOrderPreparing && order.durationOrderPreparing > 0) {
        return order.durationOrderPreparing;
    }
    if (order.maxDeliveryTime && order.maxDeliveryTime > 0) {
        return order.maxDeliveryTime;
    }
    return null;
}
/**
 * Finds overdue orders and delivers them through the shared changeOrderStatus.
 * Returns the number of orders actually delivered.
 */
async function processAutoDeliverOrders() {
    const now = new Date();
    const minCutoff = new Date(now.getTime() - MIN_AGE_MS);
    let deliveredCount = 0;
    let skipped = 0; // orders that stay in the result set (not yet due / not configured)
    for (let page = 0; page < MAX_PAGES; page++) {
        // Oldest first, so the longest-waiting orders are always seen first.
        // `skipped` is used as offset: delivered orders leave the set, skipped ones stay.
        const candidates = await connection_1.db
            .select({
            id: schema_1.orders.id,
            orderNumber: schema_1.orders.orderNumber,
            status: schema_1.orders.status,
            orderType: schema_1.orders.orderType,
            durationOrderPreparing: schema_1.orders.durationOrderPreparing,
            statusChangedAt: schema_1.orders.statusChangedAt, // وقت دخول الحالة (بدل updatedAt)
            createdAt: schema_1.orders.createdAt,
            maxDeliveryTime: schema_1.restaurantSettings.maxDeliveryTime,
            minDeliveryTime: schema_1.restaurantSettings.minDeliveryTime,
            maxTakeAwayTime: schema_1.restaurantSettings.maxTakeAwayTime,
            maxDineInTime: schema_1.restaurantSettings.maxDineInTime,
        })
            .from(schema_1.orders)
            .leftJoin(schema_1.restaurantSettings, (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, schema_1.restaurantSettings.restaurantId))
            // فقط الأوردرات التي دخلت حالتها قبل MIN_AGE_MS على الأقل
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.orders.status, ACTIVE_STATUSES), (0, drizzle_orm_1.lt)(schema_1.orders.statusChangedAt, minCutoff)))
            .orderBy((0, drizzle_orm_1.asc)(schema_1.orders.statusChangedAt)) // الأقدم أولاً حسب وقت الحالة
            .limit(PAGE_SIZE)
            .offset(skipped);
        if (candidates.length === 0)
            break;
        for (const order of candidates) {
            try {
                const thresholdMinutes = getOrderTimeoutMinutes(order);
                if (!thresholdMinutes || thresholdMinutes <= 0) {
                    skipped++;
                    continue;
                }
                // نقيس من statusChangedAt (وقت دخول الحالة بالضبط)
                // fallback لـ createdAt للأوردرات القديمة قبل Migration
                const referenceTime = order.statusChangedAt || order.createdAt || now;
                const elapsedMinutes = Math.floor((now.getTime() - new Date(referenceTime).getTime()) / 60000);
                if (elapsedMinutes < thresholdMinutes) {
                    skipped++;
                    continue;
                }
                const result = await (0, orderStatusService_1.changeOrderStatus)({
                    orderId: order.id,
                    status: "delivered",
                    expectedCurrentStatuses: [order.status], // race-condition guard
                    source: "auto",
                    autoNote: `Auto-delivered (${thresholdMinutes}m timeout)`,
                });
                if (result.changed) {
                    deliveredCount++;
                    console.log(`[AutoDeliver] Order #${order.orderNumber} (${order.id}) auto-delivered after ${elapsedMinutes}m (threshold ${thresholdMinutes}m).`);
                }
                else {
                    // Someone changed it first; it left the result set, so no offset change.
                }
            }
            catch (err) {
                skipped++; // failed orders stay in the set; don't let them shift paging
                console.error(`[AutoDeliver] Failed to auto-deliver order ${order.id}:`, err?.message || err);
            }
        }
        if (candidates.length < PAGE_SIZE)
            break;
    }
    return deliveredCount;
}
/**
 * Starts the cron (every 5 minutes).
 * Multi-instance setups: set RUN_CRON=true on ONE instance only.
 */
function initAutoDeliverCron() {
    if (process.env.RUN_CRON === "false") {
        console.log("⏰ Auto-Deliver Cron disabled on this instance (RUN_CRON=false).");
        return;
    }
    console.log("⏰ Auto-Deliver Cron initialized (dynamic threshold per order)...");
    node_cron_1.default.schedule("*/5 * * * *", async () => {
        if (isRunning)
            return;
        isRunning = true;
        try {
            const count = await processAutoDeliverOrders();
            if (count > 0) {
                console.log(`✅ [AutoDeliverCron] Auto-delivered ${count} stuck orders.`);
            }
        }
        catch (error) {
            console.error("❌ [AutoDeliverCron] Error executing auto-deliver cron:", error);
        }
        finally {
            isRunning = false;
        }
    });
}
