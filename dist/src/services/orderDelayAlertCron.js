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
            max-width: 650px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        .header {
            background: linear-gradient(135deg, #e53e3e 0%, #c53030 100%);
            color: #ffffff;
            padding: 24px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 700;
        }
        .header p {
            margin: 8px 0 0;
            font-size: 15px;
            opacity: 0.9;
        }
        .content {
            padding: 24px;
        }
        .alert-box {
            background-color: #fff5f5;
            border-right: 4px solid #e53e3e;
            padding: 16px;
            border-radius: 8px;
            margin-bottom: 24px;
            text-align: center;
        }
        .alert-box strong {
            color: #c53030;
            font-size: 18px;
            display: block;
            margin-bottom: 5px;
        }
        .alert-box span {
            color: #e53e3e;
            font-size: 14px;
        }
        .section-title {
            font-size: 16px;
            color: #4a5568;
            border-bottom: 2px solid #edf2f7;
            padding-bottom: 8px;
            margin-bottom: 16px;
            margin-top: 24px;
            font-weight: bold;
        }
        .details-table {
            width: 100%;
            border-collapse: collapse;
        }
        .details-table th, .details-table td {
            padding: 12px;
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
        .note-box {
            background-color: #ebf8ff;
            border: 1px solid #bee3f8;
            padding: 12px;
            border-radius: 6px;
            color: #2b6cb0;
            font-size: 14px;
            margin-top: 10px;
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
            <h1>⚠️ تنبيه عاجل: تأخير في تسليم الطلب</h1>
            <p>${params.restaurantName ? `مطعم: ${params.restaurantName} | ` : ""}فرع: ${params.branchName} | مجموعة: ${params.groupName}</p>
        </div>
        <div class="content">
            
            <div class="alert-box">
                <strong>تأخر الطلب بـ ${params.elapsedMinutes} دقيقة!</strong>
                <span>(الحد الأقصى المسموح لهذا الفرع هو ${params.thresholdMinutes} دقيقة)</span>
            </div>

            <div class="section-title">📌 التفاصيل الأساسية للطلب</div>
            <table class="details-table">
                ${params.restaurantName ? `
                <tr>
                    <th>المطعم</th>
                    <td><strong style="color: #c53030; font-size: 15px;">${params.restaurantName}</strong></td>
                </tr>
                ` : ""}
                <tr>
                    <th>الفرع</th>
                    <td><strong>${params.branchName}</strong></td>
                </tr>
                <tr>
                    <th>رقم الطلب اليومي</th>
                    <td><strong style="font-size: 16px; color: #2d3748;">#${params.dailyOrderNumber || "-"}</strong></td>
                </tr>
                <tr>
                    <th>حالة الطلب الحالية</th>
                    <td><span style="background: #edf2f7; padding: 4px 8px; border-radius: 4px;">${params.statusAr}</span></td>
                </tr>
                <tr>
                    <th>نوع الطلب</th>
                    <td>${params.orderTypeAr} (${params.orderSourceAr})</td>
                </tr>
                <tr>
                    <th>عدد الأصناف</th>
                    <td><strong style="color: #e53e3e;">${params.itemsCount} أصناف</strong></td>
                </tr>
                <tr>
                    <th>إجمالي القيمة</th>
                    <td><strong>${params.totalAmount} ج.م</strong></td>
                </tr>
            </table>

            <div class="section-title">⏱️ التوقيت الزمني</div>
            <table class="details-table">
                <tr>
                    <th>تاريخ الطلب</th>
                    <td>${params.orderDate}</td>
                </tr>
                <tr>
                    <th>وقت استلام الطلب</th>
                    <td>${params.orderTime}</td>
                </tr>
            </table>

            <div class="section-title">👤 بيانات العميل والتوصيل</div>
            <table class="details-table">
                <tr>
                    <th>رقم هاتف العميل</th>
                    <td dir="ltr" style="text-align: right;"><strong>${params.customerPhone || "غير متوفر"}</strong></td>
                </tr>
                ${params.deliveryAddress ? `
                <tr>
                    <th>عنوان التوصيل</th>
                    <td>${params.deliveryAddress}</td>
                </tr>
                ` : ''}
            </table>

            ${params.orderNote ? `
            <div class="section-title">📝 ملاحظات الطلب</div>
            <div class="note-box">
                ${params.orderNote}
            </div>
            ` : ''}

            <p style="font-size: 13px; color: #718096; line-height: 1.6; margin-top: 24px; text-align: center;">
                💡 <strong>ملاحظة:</strong> تم إرسال هذا التنبيه آلياً لاتخاذ إجراء سريع لتجنب استياء العميل.
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
function parseJsonField(val, fallback) {
    if (typeof val === "string") {
        try {
            const parsed = JSON.parse(val);
            return parsed !== null && parsed !== undefined ? parsed : fallback;
        }
        catch {
            return fallback;
        }
    }
    if (val !== undefined && val !== null) {
        return val;
    }
    return fallback;
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
                dailyOrderNumber: schema_1.orders.dailyOrderNumber,
                restaurantId: schema_1.orders.restaurantId,
                branchId: schema_1.orders.branchId,
                status: schema_1.orders.status,
                totalAmount: schema_1.orders.totalAmount,
                createdAt: schema_1.orders.createdAt,
                branchSnapshot: schema_1.orders.branchSnapshot,
                orderType: schema_1.orders.orderType,
                orderSource: schema_1.orders.orderSource,
                paymentMethod: schema_1.orders.paymentMethod,
                shippingAddress: schema_1.orders.shippingAddress,
                note: schema_1.orders.note,
                restaurantName: schema_1.restaurants.name,
                restaurantNameAr: schema_1.restaurants.nameAr,
            })
                .from(schema_1.orders)
                .leftJoin(schema_1.restaurants, (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, schema_1.restaurants.id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.orders.isDelayEmailSent, false), (0, drizzle_orm_1.isNull)(schema_1.orders.isDelayEmailSent)), (0, drizzle_orm_1.inArray)(schema_1.orders.status, ["pending", "accepted", "preparing", "out_for_delivery"])));
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
            // Group alert groups into superadmin and per-restaurant groups
            const superAdminGroups = [];
            const groupsByRestaurant = new Map();
            for (const group of activeGroups) {
                if (group.isSuperAdmin || !group.restaurantId) {
                    superAdminGroups.push(group);
                }
                else {
                    const list = groupsByRestaurant.get(group.restaurantId) || [];
                    list.push(group);
                    groupsByRestaurant.set(group.restaurantId, list);
                }
            }
            // 3. Process each overdue order
            for (const order of activeOrders) {
                if (!order.createdAt)
                    continue;
                const elapsedMinutes = Math.floor((now.getTime() - new Date(order.createdAt).getTime()) / 60000);
                const restaurantGroups = order.restaurantId ? (groupsByRestaurant.get(order.restaurantId) || []) : [];
                const relevantGroups = [...restaurantGroups, ...superAdminGroups];
                if (relevantGroups.length === 0) {
                    continue;
                }
                // Check which groups match this order, branch, status, and delay
                const matchingOverdueGroups = relevantGroups.filter((g) => {
                    const allowedStatuses = parseJsonField(g.orderStatus, ["pending"]);
                    const isStatusMatch = order.status ? allowedStatuses.includes(order.status) : false;
                    const isDelayMatch = elapsedMinutes >= g.maxDelayMinutes;
                    if (!isStatusMatch || !isDelayMatch) {
                        return false;
                    }
                    // For SuperAdmin groups: check restaurant scope precisely
                    if (g.isSuperAdmin) {
                        // إذا كان مفعلاً اختيار كل المطاعم أو القيمة فارغة/true
                        const isAllRestaurants = g.allRestaurants === true || g.allRestaurants === null || g.allRestaurants === undefined;
                        if (isAllRestaurants) {
                            return true; // يشمل كل المطاعم بدون استثناء
                        }
                        // وإلا، نتحقق هل مطعم الأوردر موجود ضمن القائمة المحددة
                        const restaurantIds = parseJsonField(g.restaurantIds, []);
                        return order.restaurantId && Array.isArray(restaurantIds) && restaurantIds.includes(order.restaurantId);
                    }
                    // For Restaurant groups: check branch scope
                    const branchIds = parseJsonField(g.branchIds, []);
                    const isBranchMatch = Boolean(g.allBranches) ||
                        (order.branchId && Array.isArray(branchIds) && branchIds.includes(order.branchId));
                    return isBranchMatch;
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
                    const groupEmails = parseJsonField(g.emails, []);
                    if (Array.isArray(groupEmails)) {
                        for (const email of groupEmails) {
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
                // Status translation
                let statusAr = "معلق";
                if (order.status === "accepted")
                    statusAr = "مقبول";
                else if (order.status === "preparing")
                    statusAr = "جاري التحضير";
                else if (order.status === "out_for_delivery")
                    statusAr = "خرج للتوصيل";
                // Order Type translation
                const orderTypesMap = {
                    delivery: "توصيل",
                    takeaway: "استلام من الفرع",
                    dine_in: "صالة (داخل المطعم)"
                };
                const orderTypeAr = order.orderType ? (orderTypesMap[order.orderType] || order.orderType) : "غير محدد";
                // Order Source translation
                const orderSourcesMap = {
                    online_order_web: "طلب عبر الويب",
                    online_order_app: "تطبيق الهاتف",
                    food_aggregator: "تطبيق توصيل خارجي",
                    my_keeto: "نظام كيتو"
                };
                const orderSourceAr = order.orderSource ? (orderSourcesMap[order.orderSource] || order.orderSource) : "غير محدد";
                // Date and Time formatting
                const orderDateObj = new Date(order.createdAt);
                const orderDate = orderDateObj.toLocaleDateString("ar-EG", {
                    weekday: "long", year: "numeric", month: "long", day: "numeric"
                });
                const orderTime = orderDateObj.toLocaleTimeString("ar-EG", {
                    hour: "2-digit", minute: "2-digit"
                });
                // Address & Phone extraction
                let customerPhone = "";
                let deliveryAddress = "";
                if (order.shippingAddress) {
                    const addressData = typeof order.shippingAddress === "string"
                        ? parseJsonField(order.shippingAddress, {})
                        : order.shippingAddress;
                    customerPhone = addressData?.phone || "";
                    deliveryAddress = addressData?.fulladdress || addressData?.street || "";
                }
                // Query total item count for the order
                const orderItemsList = await connection_1.db
                    .select({ id: schema_1.orderItems.id })
                    .from(schema_1.orderItems)
                    .where((0, drizzle_orm_1.eq)(schema_1.orderItems.orderId, order.id));
                const itemsCount = orderItemsList.length;
                // Prepare restaurant name
                const restaurantName = order.restaurantNameAr || order.restaurantName || "";
                const emailHtml = buildDelayAlertEmailHtml({
                    restaurantName,
                    dailyOrderNumber: order.dailyOrderNumber,
                    branchName,
                    statusAr,
                    elapsedMinutes,
                    thresholdMinutes: primaryGroup.maxDelayMinutes,
                    groupName: primaryGroup.name,
                    totalAmount: order.totalAmount,
                    orderDate,
                    orderTime,
                    orderTypeAr,
                    orderSourceAr,
                    customerPhone,
                    deliveryAddress,
                    orderNote: order.note || "",
                    itemsCount,
                });
                const restPrefix = restaurantName ? `[${restaurantName}] ` : "";
                const subject = `⚠️ تنبيه تأخير: ${restPrefix}الطلب #${order.dailyOrderNumber} تجاوز ${elapsedMinutes} دقيقة!`;
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
                console.log(`📧 [Delay Alert] Sent once for Order #${order.dailyOrderNumber} (${restaurantName ? `${restaurantName} - ` : ""}Delay: ${elapsedMinutes}m) to: ${Array.from(recipientEmails).join(", ")}`);
            }
        }
        catch (error) {
            console.error("❌ Error running order delay alert cron:", error);
        }
    });
}
