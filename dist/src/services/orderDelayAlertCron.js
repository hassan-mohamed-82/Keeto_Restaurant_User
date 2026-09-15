"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initOrderDelayAlertCron = initOrderDelayAlertCron;
const node_cron_1 = __importDefault(require("node-cron"));
const connection_1 = require("../models/connection");
const schema_1 = require("../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const sendEmails_1 = require("../utils/sendEmails");
/**
 * Generate a responsive, professional HTML template for order delay notifications.
 */
function buildDelayAlertEmailHtml(params) {
    return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>تنبيه تأخير طلب</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: #f4f6f8;
            margin: 0;
            padding: 20px;
            color: #2d3748;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }
        .header {
            background: linear-gradient(135deg, #e53e3e 0%, #dd6b20 100%);
            color: #ffffff;
            padding: 24px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 22px;
            font-weight: 700;
        }
        .header p {
            margin: 8px 0 0;
            font-size: 14px;
            opacity: 0.9;
        }
        .content {
            padding: 24px;
        }
        .badge-warning {
            display: inline-block;
            background-color: #feebc8;
            color: #c05621;
            padding: 6px 14px;
            border-radius: 9999px;
            font-weight: bold;
            font-size: 14px;
            margin-bottom: 20px;
        }
        .details-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            margin-bottom: 20px;
        }
        .details-table th, .details-table td {
            padding: 12px 14px;
            border-bottom: 1px solid #edf2f7;
            text-align: right;
            font-size: 14px;
        }
        .details-table th {
            background-color: #f7fafc;
            color: #718096;
            width: 35%;
            font-weight: 600;
        }
        .details-table td {
            color: #1a202c;
            font-weight: 500;
        }
        .delay-highlight {
            color: #e53e3e;
            font-weight: bold;
            font-size: 16px;
        }
        .footer {
            background-color: #f7fafc;
            padding: 16px 24px;
            text-align: center;
            font-size: 12px;
            color: #a0aec0;
            border-top: 1px solid #edf2f7;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⚠️ تنبيه: تجاوز وقت الطلب المحدد</h1>
            <p>مجموعة التنبيه: ${params.groupName}</p>
        </div>
        <div class="content">
            <div style="text-align: center;">
                <span class="badge-warning">
                    تأخر الطلب بـ ${params.elapsedMinutes} دقيقة (الحد الأقصى المسموح: ${params.thresholdMinutes} دقيقة)
                </span>
            </div>
            
            <table class="details-table">
                <tr>
                    <th>رقم الطلب اليومي</th>
                    <td><strong>#${params.dailyOrderNumber || "-"}</strong></td>
                </tr>
                <tr>
                    <th>رقم الطلب المرجعي</th>
                    <td>${params.orderNumber}</td>
                </tr>
                <tr>
                    <th>الفرع</th>
                    <td>${params.branchName}</td>
                </tr>
                <tr>
                    <th>حالة الطلب الحالية</th>
                    <td>${params.statusAr}</td>
                </tr>
                <tr>
                    <th>مدة التأخير</th>
                    <td class="delay-highlight">${params.elapsedMinutes} دقيقة</td>
                </tr>
                <tr>
                    <th>إجمالي قيمة الطلب</th>
                    <td>${params.totalAmount} ج.م</td>
                </tr>
                <tr>
                    <th>وقت استلام الطلب</th>
                    <td>${params.createdAtFormatted}</td>
                </tr>
            </table>

            <p style="font-size: 13px; color: #718096; line-height: 1.6; margin: 0;">
                💡 <strong>ملاحظة:</strong> تم إرسال هذا التنبيه آلياً مرة واحدة وفقاً لإعدادات مجموعة تنبيهات التأخير المعينة لهذا الفرع لاتخاذ الإجراء السريع.
            </p>
        </div>
        <div class="footer">
            نظام إدارة المطاعم &copy; ${new Date().getFullYear()}
        </div>
    </div>
</body>
</html>
    `;
}
/**
 * Initialize Order Delay Alert Cron Service.
 * Checks for overdue orders every minute and sends an email alert exactly once per delayed order.
 */
function initOrderDelayAlertCron() {
    console.log("⏰ Order Delay Email Alert Cron initialized (runs every minute)...");
    node_cron_1.default.schedule("*/1 * * * *", async () => {
        try {
            const now = new Date();
            // 1. Get active orders that have NOT yet received a delay alert email
            const activeOrders = await connection_1.db
                .select({
                id: schema_1.orders.id,
                orderNumber: schema_1.orders.orderNumber,
                dailyOrderNumber: schema_1.orders.dailyOrderNumber,
                restaurantId: schema_1.orders.restaurantId,
                branchId: schema_1.orders.branchId,
                status: schema_1.orders.status,
                totalAmount: schema_1.orders.totalAmount,
                createdAt: schema_1.orders.createdAt,
                branchSnapshot: schema_1.orders.branchSnapshot,
            })
                .from(schema_1.orders)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orders.isDelayEmailSent, false), (0, drizzle_orm_1.inArray)(schema_1.orders.status, ["pending", "accepted", "preparing", "out_for_delivery"])));
            if (!activeOrders || activeOrders.length === 0) {
                return;
            }
            // 2. Fetch all active alert groups across restaurants
            const activeGroups = await connection_1.db
                .select()
                .from(schema_1.orderDelayAlertGroups)
                .where((0, drizzle_orm_1.eq)(schema_1.orderDelayAlertGroups.isActive, true));
            if (!activeGroups || activeGroups.length === 0) {
                return;
            }
            // Group alert groups by restaurantId for fast matching
            const groupsByRestaurant = new Map();
            for (const group of activeGroups) {
                const list = groupsByRestaurant.get(group.restaurantId) || [];
                list.push(group);
                groupsByRestaurant.set(group.restaurantId, list);
            }
            // 3. Process each overdue order
            for (const order of activeOrders) {
                if (!order.createdAt)
                    continue;
                const elapsedMinutes = Math.floor((now.getTime() - new Date(order.createdAt).getTime()) / 60000);
                const restaurantGroups = groupsByRestaurant.get(order.restaurantId) || [];
                if (restaurantGroups.length === 0)
                    continue;
                // Check which groups match this order's branch, orderStatus, and are overdue
                const matchingOverdueGroups = restaurantGroups.filter((g) => {
                    const isBranchMatch = g.allBranches ||
                        (order.branchId && Array.isArray(g.branchIds) && g.branchIds.includes(order.branchId));
                    const allowedStatuses = Array.isArray(g.orderStatus) && g.orderStatus.length > 0
                        ? g.orderStatus
                        : ["pending"];
                    const isStatusMatch = order.status ? allowedStatuses.includes(order.status) : false;
                    return isBranchMatch && isStatusMatch && elapsedMinutes >= g.maxDelayMinutes;
                });
                if (matchingOverdueGroups.length === 0) {
                    continue;
                }
                // Pick the group with the minimum threshold or combine them
                matchingOverdueGroups.sort((a, b) => a.maxDelayMinutes - b.maxDelayMinutes);
                const primaryGroup = matchingOverdueGroups[0];
                // Collect unique recipient emails from all matching overdue groups
                const recipientEmails = new Set();
                for (const g of matchingOverdueGroups) {
                    if (Array.isArray(g.emails)) {
                        for (const email of g.emails) {
                            if (email && typeof email === "string" && email.includes("@")) {
                                recipientEmails.add(email.trim().toLowerCase());
                            }
                        }
                    }
                }
                if (recipientEmails.size === 0) {
                    // Mark as sent so we don't query it continuously if no valid emails
                    await connection_1.db
                        .update(schema_1.orders)
                        .set({ isDelayEmailSent: true })
                        .where((0, drizzle_orm_1.eq)(schema_1.orders.id, order.id));
                    continue;
                }
                // Prepare branch name
                let branchName = "الفرع الرئيسي";
                if (order.branchSnapshot && order.branchSnapshot.name) {
                    branchName = order.branchSnapshot.name;
                }
                else if (order.branchId) {
                    const [foundBranch] = await connection_1.db
                        .select({ name: schema_1.branches.name, nameAr: schema_1.branches.nameAr })
                        .from(schema_1.branches)
                        .where((0, drizzle_orm_1.eq)(schema_1.branches.id, order.branchId))
                        .limit(1);
                    if (foundBranch) {
                        branchName = foundBranch.nameAr || foundBranch.name;
                    }
                }
                // Arabic status translation
                let statusAr = "معلق";
                if (order.status === "accepted")
                    statusAr = "مقبول";
                else if (order.status === "preparing")
                    statusAr = "جاري التحضير";
                else if (order.status === "out_for_delivery")
                    statusAr = "خرج للتوصيل";
                const createdAtFormatted = new Date(order.createdAt).toLocaleTimeString("ar-EG", {
                    hour: "2-digit",
                    minute: "2-digit",
                });
                const emailHtml = buildDelayAlertEmailHtml({
                    orderNumber: order.orderNumber,
                    dailyOrderNumber: order.dailyOrderNumber,
                    branchName,
                    statusAr,
                    elapsedMinutes,
                    thresholdMinutes: primaryGroup.maxDelayMinutes,
                    groupName: primaryGroup.name,
                    totalAmount: order.totalAmount,
                    createdAtFormatted,
                });
                const subject = `⚠️ تنبيه تأخير: الطلب #${order.dailyOrderNumber || order.orderNumber} تجاوز ${elapsedMinutes} دقيقة!`;
                // Send email to all recipients
                const sendPromises = Array.from(recipientEmails).map((to) => (0, sendEmails_1.sendEmail)({
                    to,
                    subject,
                    html: emailHtml,
                }).catch((err) => {
                    console.error(`❌ Failed to send delay alert email to ${to}:`, err);
                }));
                await Promise.allSettled(sendPromises);
                // 4. Mark isDelayEmailSent = true immediately to ensure it's sent ONLY ONCE!
                await connection_1.db
                    .update(schema_1.orders)
                    .set({ isDelayEmailSent: true })
                    .where((0, drizzle_orm_1.eq)(schema_1.orders.id, order.id));
                console.log(`📧 [Delay Alert] Sent once for Order #${order.dailyOrderNumber || order.orderNumber} (Delay: ${elapsedMinutes}m) to: ${Array.from(recipientEmails).join(", ")}`);
            }
        }
        catch (error) {
            console.error("❌ Error running order delay alert cron:", error);
        }
    });
}
