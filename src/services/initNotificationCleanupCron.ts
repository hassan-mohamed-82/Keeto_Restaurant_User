import cron from "node-cron";
import { db } from "../models/connection";
import { notifications } from "../models/schema";
import { eq, and, lte, inArray } from "drizzle-orm";

// دالة مساعدة لعمل تريث (Delay) بين الدفعات لتخفيف الضغط على MySQL
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function initNotificationCleanupCron() {
    console.log("🧹 Notification Chunked Cleanup Service initialized...");

    // يشتغل يومياً الساعة 3:00 فجراً
    cron.schedule("0 3 * * *", async () => {
        try {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const BATCH_SIZE = 1000; // حجم الدفعة الواحدة
            let totalDeleted = 0;
            let hasMore = true;

            while (hasMore) {
                // 1. جلب المعرفات (IDs) للدفعة الحالية فقط
                const idsToDelete = await db
                    .select({ id: notifications.id })
                    .from(notifications)
                    .where(
                        and(
                            eq(notifications.isRead, true),
                            lte(notifications.createdAt, thirtyDaysAgo)
                        )
                    )
                    .limit(BATCH_SIZE);

                // إذا لم يتبق أي إشعارات تنطبق عليها الشروط، ننهي الـ Loop
                if (idsToDelete.length === 0) {
                    hasMore = false;
                    break;
                }

                const idList = idsToDelete.map((row) => row.id);

                // 2. حذف الدفعة المحددة بواسطة الـ IDs
                await db
                    .delete(notifications)
                    .where(inArray(notifications.id, idList));

                totalDeleted += idsToDelete.length;

                // إذا كان عدد العناصر المجلوبة أقل من الـ Batch Size، فهذه كانت آخر دفعة
                if (idsToDelete.length < BATCH_SIZE) {
                    hasMore = false;
                } else {
                    // انتظر 100 مللي ثانية بين الدفعات للسماح لـ MySQL بمعالجة استعلامات أخرى
                    await sleep(100);
                }
            }

            console.log(`✅ Old read notifications cleaned up: ${totalDeleted} records removed.`);
        } catch (error) {
            console.error("❌ Error running chunked notification cleanup:", error);
        }
    });
}