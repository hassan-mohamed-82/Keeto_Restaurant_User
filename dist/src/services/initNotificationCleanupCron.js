"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initNotificationCleanupCron = initNotificationCleanupCron;
const node_cron_1 = __importDefault(require("node-cron"));
const connection_1 = require("../models/connection");
const schema_1 = require("../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
// دالة مساعدة لعمل تريث (Delay) بين الدفعات لتخفيف الضغط على MySQL
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function initNotificationCleanupCron() {
    console.log("🧹 Notification Chunked Cleanup Service initialized...");
    // يشتغل يومياً الساعة 3:00 فجراً
    node_cron_1.default.schedule("0 3 * * *", async () => {
        try {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const BATCH_SIZE = 1000; // حجم الدفعة الواحدة
            let totalDeleted = 0;
            let hasMore = true;
            while (hasMore) {
                // 1. جلب المعرفات (IDs) للدفعة الحالية فقط
                const idsToDelete = await connection_1.db
                    .select({ id: schema_1.notifications.id })
                    .from(schema_1.notifications)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.notifications.isRead, true), (0, drizzle_orm_1.lte)(schema_1.notifications.createdAt, thirtyDaysAgo)))
                    .limit(BATCH_SIZE);
                // إذا لم يتبق أي إشعارات تنطبق عليها الشروط، ننهي الـ Loop
                if (idsToDelete.length === 0) {
                    hasMore = false;
                    break;
                }
                const idList = idsToDelete.map((row) => row.id);
                // 2. حذف الدفعة المحددة بواسطة الـ IDs
                await connection_1.db
                    .delete(schema_1.notifications)
                    .where((0, drizzle_orm_1.inArray)(schema_1.notifications.id, idList));
                totalDeleted += idsToDelete.length;
                // إذا كان عدد العناصر المجلوبة أقل من الـ Batch Size، فهذه كانت آخر دفعة
                if (idsToDelete.length < BATCH_SIZE) {
                    hasMore = false;
                }
                else {
                    // انتظر 100 مللي ثانية بين الدفعات للسماح لـ MySQL بمعالجة استعلامات أخرى
                    await sleep(100);
                }
            }
            console.log(`✅ Old read notifications cleaned up: ${totalDeleted} records removed.`);
        }
        catch (error) {
            console.error("❌ Error running chunked notification cleanup:", error);
        }
    });
}
