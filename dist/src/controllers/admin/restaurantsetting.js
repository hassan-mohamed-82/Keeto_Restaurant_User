"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBusyStatus = exports.updateBusyStatus = exports.getSettingsByRestaurantId = exports.updateSettings = void 0;
const connection_1 = require("../../models/connection"); // غير المسار حسب مكان ملف اتصال قاعدة البيانات عندك
const schema_1 = require("../../models/schema");
const admin_1 = require("../../models/schema/admin/admin");
const sendEmails_1 = require("../../utils/sendEmails");
const drizzle_orm_1 = require("drizzle-orm");
const updateSettings = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const { settings, schedules } = req.body;
    let temporaryClosureChanged;
    if (!restaurantId) {
        res.status(400).json({ success: false, message: "Restaurant id is not valid" });
        return;
    }
    // 🛡️ Both-off guard: run BEFORE the transaction to avoid double-response issues.
    // If cashEnabled or enableOnlinePayment is being changed, check the merged result
    // against existing DB values so we catch the case where one is already false.
    if (settings && (settings.cashEnabled !== undefined || settings.enableOnlinePayment !== undefined)) {
        const [currentSettings] = await connection_1.db
            .select({ cashEnabled: schema_1.restaurantSettings.cashEnabled, enableOnlinePayment: schema_1.restaurantSettings.enableOnlinePayment })
            .from(schema_1.restaurantSettings)
            .where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, restaurantId))
            .limit(1);
        const resolvedCashEnabled = settings.cashEnabled !== undefined
            ? Boolean(settings.cashEnabled)
            : (currentSettings?.cashEnabled ?? true);
        const resolvedOnlinePayment = settings.enableOnlinePayment !== undefined
            ? Boolean(settings.enableOnlinePayment)
            : (currentSettings?.enableOnlinePayment ?? false);
        if (resolvedCashEnabled === false && resolvedOnlinePayment === false) {
            res.status(400).json({
                success: false,
                message: "At least one payment method must be active. You cannot disable both cash and online payment at the same time.",
            });
            return;
        }
    }
    try {
        // بدأ الـ Transaction
        await connection_1.db.transaction(async (tx) => {
            // 1. تحديث الإعدادات (لو مبعوتة)
            if (settings && Object.keys(settings).length > 0) {
                const existingSettings = await tx.select().from(schema_1.restaurantSettings).where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, restaurantId)).limit(1);
                // ✅ تجهيز البيانات للتحديث بشكل صريح
                const settingsData = {};
                // Boolean fields
                if (settings.foodManagement !== undefined)
                    settingsData.foodManagement = settings.foodManagement;
                if (settings.scheduledDelivery !== undefined)
                    settingsData.scheduledDelivery = settings.scheduledDelivery;
                if (settings.reviewsSection !== undefined)
                    settingsData.reviewsSection = settings.reviewsSection;
                if (settings.posSection !== undefined)
                    settingsData.posSection = settings.posSection;
                if (settings.selfDelivery !== undefined)
                    settingsData.selfDelivery = settings.selfDelivery;
                if (settings.homeDelivery !== undefined)
                    settingsData.homeDelivery = settings.homeDelivery;
                if (settings.takeaway !== undefined)
                    settingsData.takeaway = settings.takeaway;
                if (settings.orderSubscription !== undefined)
                    settingsData.orderSubscription = settings.orderSubscription;
                if (settings.instantOrder !== undefined)
                    settingsData.instantOrder = settings.instantOrder;
                if (settings.halalTagStatus !== undefined)
                    settingsData.halalTagStatus = settings.halalTagStatus;
                if (settings.dineIn !== undefined)
                    settingsData.dineIn = settings.dineIn;
                if (settings.canEditOrder !== undefined)
                    settingsData.canEditOrder = settings.canEditOrder;
                if (settings.isAlwaysOpen !== undefined)
                    settingsData.isAlwaysOpen = settings.isAlwaysOpen;
                if (settings.isSameTimeEveryDay !== undefined)
                    settingsData.isSameTimeEveryDay = settings.isSameTimeEveryDay;
                if (settings.isTemporarilyClosed !== undefined) {
                    const targetIsTemporarilyClosed = settings.isTemporarilyClosed;
                    temporaryClosureChanged = Boolean(existingSettings[0]?.isTemporarilyClosed) !== targetIsTemporarilyClosed;
                    settingsData.isTemporarilyClosed = targetIsTemporarilyClosed;
                }
                if (settings.isBusy !== undefined || settings.busy !== undefined) {
                    const busyVal = settings.isBusy !== undefined ? settings.isBusy : settings.busy;
                    settingsData.isBusy = Boolean(busyVal);
                }
                // ✅ cashEnabled — toggle cash payment on/off per restaurant
                if (settings.cashEnabled !== undefined)
                    settingsData.cashEnabled = Boolean(settings.cashEnabled);
                // ✅ enableOnlinePayment
                if (settings.enableOnlinePayment !== undefined)
                    settingsData.enableOnlinePayment = Boolean(settings.enableOnlinePayment);
                // Other fields
                if (settings.productView !== undefined || settings.productview !== undefined) {
                    const val = (settings.productView ?? settings.productview);
                    if (val === "select" || val === "normal") {
                        settingsData.productView = val;
                    }
                }
                if (settings.vegType !== undefined)
                    settingsData.vegType = settings.vegType;
                if (settings.minOrderAmount !== undefined)
                    settingsData.minOrderAmount = String(settings.minOrderAmount);
                if (settings.minDeliveryTime !== undefined)
                    settingsData.minDeliveryTime = settings.minDeliveryTime;
                if (settings.maxDeliveryTime !== undefined)
                    settingsData.maxDeliveryTime = settings.maxDeliveryTime;
                if (settings.minTakeAwayTime !== undefined)
                    settingsData.minTakeAwayTime = settings.minTakeAwayTime;
                if (settings.maxTakeAwayTime !== undefined)
                    settingsData.maxTakeAwayTime = settings.maxTakeAwayTime;
                if (settings.minDineInTime !== undefined)
                    settingsData.minDineInTime = settings.minDineInTime;
                if (settings.maxDineInTime !== undefined)
                    settingsData.maxDineInTime = settings.maxDineInTime;
                if (settings.firstColor !== undefined)
                    settingsData.firstColor = settings.firstColor;
                if (settings.secondColor !== undefined)
                    settingsData.secondColor = settings.secondColor;
                if (settings.firstTextColor !== undefined)
                    settingsData.firstTextColor = settings.firstTextColor;
                if (settings.secondTextColor !== undefined)
                    settingsData.secondTextColor = settings.secondTextColor;
                if (settings.repeatNotification !== undefined)
                    settingsData.repeatNotification = settings.repeatNotification;
                if (settings.repeatNotificationDuration !== undefined)
                    settingsData.repeatNotificationDuration = settings.repeatNotificationDuration;
                if (settings.repeatNotificationStatuses !== undefined)
                    settingsData.repeatNotificationStatuses = settings.repeatNotificationStatuses;
                if (settings.resetDailyOrderNumberTime !== undefined)
                    settingsData.resetDailyOrderNumberTime = settings.resetDailyOrderNumberTime;
                if (existingSettings.length > 0) {
                    // ✅ Update existing settings
                    await tx.update(schema_1.restaurantSettings)
                        .set(settingsData)
                        .where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, restaurantId));
                }
                else {
                    // ✅ Insert new settings
                    await tx.insert(schema_1.restaurantSettings).values({
                        restaurantId,
                        ...settingsData,
                    });
                }
            }
            // 2. تحديث المواعيد والفترات (لو مبعوتة)
            if (schedules && Array.isArray(schedules)) {
                // خطوة أ: مسح كل المواعيد القديمة للمطعم ده
                await tx.delete(schema_1.restaurantSchedules)
                    .where((0, drizzle_orm_1.eq)(schema_1.restaurantSchedules.restaurantId, restaurantId));
                // لو المصفوفة مش فاضية، هنضيف الجديد
                if (schedules.length > 0) {
                    // تجهيز الداتا الجديدة للـ Insert
                    const schedulesToInsert = schedules.map((schedule) => ({
                        restaurantId: restaurantId,
                        dayOfWeek: schedule.dayOfWeek,
                        isOffDay: schedule.isOffDay || false,
                        // لو اليوم إجازة، هنخلي الأوقات null لضمان نظافة الداتا
                        openingTime: schedule.isOffDay ? null : schedule.openingTime,
                        closingTime: schedule.isOffDay ? null : schedule.closingTime,
                    }));
                    // خطوة ب: إضافة المواعيد والفترات الجديدة
                    await tx.insert(schema_1.restaurantSchedules).values(schedulesToInsert);
                }
            }
        });
        let notificationWarning;
        if (temporaryClosureChanged !== undefined) {
            try {
                const [[restaurant], superAdmins] = await Promise.all([
                    connection_1.db
                        .select({ name: schema_1.restaurants.name })
                        .from(schema_1.restaurants)
                        .where((0, drizzle_orm_1.eq)(schema_1.restaurants.id, restaurantId))
                        .limit(1),
                    connection_1.db
                        .select({ email: admin_1.admins.email })
                        .from(admin_1.admins)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(admin_1.admins.type, "super_admin"), (0, drizzle_orm_1.eq)(admin_1.admins.status, "active"))),
                ]);
                const recipients = [...new Set(superAdmins.map(({ email }) => email.trim()).filter(Boolean))];
                if (recipients.length === 0) {
                    notificationWarning = "No active super admin email recipients were found";
                    console.error(`⚠️ Restaurant status changed, but ${notificationWarning.toLowerCase()}.`);
                }
                else {
                    const restaurantName = restaurant?.name || restaurantId;
                    const escapedRestaurantName = restaurantName
                        .replace(/&/g, "&amp;")
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;")
                        .replace(/"/g, "&quot;")
                        .replace(/'/g, "&#39;");
                    const status = temporaryClosureChanged ? "temporarily closed" : "open";
                    const subject = `Restaurant ${temporaryClosureChanged ? "closed" : "open"}: ${restaurantName}`;
                    const emailHtml = `<p>Hello,</p><p><strong>${escapedRestaurantName}</strong> is now ${status}.</p>`;
                    const emailResults = await Promise.allSettled(recipients.map((to) => (0, sendEmails_1.sendEmail)({ to, subject, html: emailHtml })));
                    const failedEmails = emailResults.filter((result) => result.status === "rejected");
                    emailResults.forEach((result, index) => {
                        if (result.status === "rejected") {
                            console.error(`❌ Failed to send restaurant status email to ${recipients[index]}:`, result.reason);
                        }
                    });
                    if (failedEmails.length > 0) {
                        notificationWarning = `Failed to send restaurant status email to ${failedEmails.length} super admin(s)`;
                    }
                }
            }
            catch (error) {
                notificationWarning = "Unable to send restaurant status notification email";
                console.error("❌ Failed to notify super admins about restaurant status change:", error);
            }
        }
        res.status(200).json({
            success: true,
            message: "Update settings success",
            ...(notificationWarning ? { notificationWarning } : {}),
        });
    }
    catch (error) {
        console.error("❌ Error updating settings:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update settings",
            error: error.message
        });
    }
};
exports.updateSettings = updateSettings;
const getSettingsByRestaurantId = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        res.status(400).json({ success: false, message: "Restaurant id is required" });
        return;
    }
    const settings = await connection_1.db.select().from(schema_1.restaurantSettings).where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, restaurantId)).limit(1);
    const schedules = await connection_1.db.select().from(schema_1.restaurantSchedules).where((0, drizzle_orm_1.eq)(schema_1.restaurantSchedules.restaurantId, restaurantId));
    let settingsResult = settings[0];
    // لو مفيش إعدادات خالص للمطعم ده، هنكريتله إعدادات افتراضية
    if (!settingsResult) {
        await connection_1.db.insert(schema_1.restaurantSettings).values({ restaurantId });
        const newSettings = await connection_1.db.select().from(schema_1.restaurantSettings).where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, restaurantId)).limit(1);
        settingsResult = newSettings[0];
    }
    const isBusy = Boolean(settingsResult?.isBusy);
    res.status(200).json({
        success: true,
        data: {
            settings: settingsResult,
            schedules: schedules || [],
            busyStatus: isBusy ? "busy" : "available",
        }
    });
};
exports.getSettingsByRestaurantId = getSettingsByRestaurantId;
const updateBusyStatus = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        res.status(400).json({ success: false, message: "Restaurant id is required" });
        return;
    }
    // 1. Verify restaurant has an active MyKeeto plan
    const [mykeetoPlan] = await connection_1.db
        .select()
        .from(schema_1.restaurantBusinessPlans)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restaurantBusinessPlans.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.restaurantBusinessPlans.platformType, "mykeeto")))
        .limit(1);
    if (!mykeetoPlan || mykeetoPlan.mykeetoStatus === "inactive") {
        res.status(400).json({
            success: false,
            message: "This feature is only available for restaurants subscribed to the active MyKeeto plan"
        });
        return;
    }
    // 2. Determine target busy status
    let targetIsBusy;
    if (req.body.isBusy !== undefined) {
        targetIsBusy = Boolean(req.body.isBusy);
    }
    else if (req.body.busy !== undefined) {
        targetIsBusy = Boolean(req.body.busy);
    }
    else if (req.body.status !== undefined) {
        targetIsBusy = req.body.status === "busy";
    }
    else {
        res.status(400).json({ success: false, message: "isBusy or status is required" });
        return;
    }
    // 3. Update restaurantSettings
    const existingSettings = await connection_1.db
        .select()
        .from(schema_1.restaurantSettings)
        .where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, restaurantId))
        .limit(1);
    if (existingSettings.length > 0) {
        await connection_1.db
            .update(schema_1.restaurantSettings)
            .set({ isBusy: targetIsBusy })
            .where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, restaurantId));
    }
    else {
        await connection_1.db
            .insert(schema_1.restaurantSettings)
            .values({ restaurantId, isBusy: targetIsBusy });
    }
    res.status(200).json({
        success: true,
        message: `Restaurant status updated to ${targetIsBusy ? "busy" : "available"} successfully`,
        data: {
            restaurantId,
            isBusy: targetIsBusy,
            busyStatus: targetIsBusy ? "busy" : "available",
            status: targetIsBusy ? "busy" : "available"
        }
    });
};
exports.updateBusyStatus = updateBusyStatus;
const getBusyStatus = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        res.status(400).json({ success: false, message: "Restaurant id is required" });
        return;
    }
    const [settings] = await connection_1.db
        .select({ isBusy: schema_1.restaurantSettings.isBusy })
        .from(schema_1.restaurantSettings)
        .where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, restaurantId))
        .limit(1);
    const [mykeetoPlan] = await connection_1.db
        .select()
        .from(schema_1.restaurantBusinessPlans)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restaurantBusinessPlans.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.restaurantBusinessPlans.platformType, "mykeeto")))
        .limit(1);
    const isBusy = Boolean(settings?.isBusy);
    const hasMykeetoPlan = Boolean(mykeetoPlan && mykeetoPlan.mykeetoStatus === "active");
    res.status(200).json({
        success: true,
        data: {
            restaurantId,
            isBusy,
            busyStatus: isBusy ? "busy" : "available",
            status: isBusy ? "busy" : "available",
            hasMykeetoPlan
        }
    });
};
exports.getBusyStatus = getBusyStatus;
