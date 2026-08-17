import { Request, Response } from 'express';
import { db } from '../../models/connection'; // غير المسار حسب مكان ملف اتصال قاعدة البيانات عندك
import { restaurantSettings, restaurantSchedules } from '../../models/schema';
import { eq } from 'drizzle-orm';

export const updateSettings = async (req: Request, res: Response): Promise<void> => {
  const restaurantId = req.user?.restaurantId || req.user?.id;
  const { settings, schedules } = req.body;

  if (!restaurantId) {
    res.status(400).json({ success: false, message: "Restaurant id is not valid" });
    return;
  }

  try {
    // بدأ الـ Transaction
    await db.transaction(async (tx) => {

      // 1. تحديث الإعدادات (لو مبعوتة)
      if (settings && Object.keys(settings).length > 0) {
        const existingSettings = await tx.select().from(restaurantSettings).where(eq(restaurantSettings.restaurantId, restaurantId)).limit(1);

        // ✅ تجهيز البيانات للتحديث بشكل صريح
        const settingsData: any = {};

        // Boolean fields
        if (settings.foodManagement !== undefined) settingsData.foodManagement = settings.foodManagement;
        if (settings.scheduledDelivery !== undefined) settingsData.scheduledDelivery = settings.scheduledDelivery;
        if (settings.reviewsSection !== undefined) settingsData.reviewsSection = settings.reviewsSection;
        if (settings.posSection !== undefined) settingsData.posSection = settings.posSection;
        if (settings.selfDelivery !== undefined) settingsData.selfDelivery = settings.selfDelivery;
        if (settings.homeDelivery !== undefined) settingsData.homeDelivery = settings.homeDelivery;
        if (settings.takeaway !== undefined) settingsData.takeaway = settings.takeaway;
        if (settings.orderSubscription !== undefined) settingsData.orderSubscription = settings.orderSubscription;
        if (settings.instantOrder !== undefined) settingsData.instantOrder = settings.instantOrder;
        if (settings.halalTagStatus !== undefined) settingsData.halalTagStatus = settings.halalTagStatus;
        if (settings.dineIn !== undefined) settingsData.dineIn = settings.dineIn;
        if (settings.canEditOrder !== undefined) settingsData.canEditOrder = settings.canEditOrder;
        if (settings.isAlwaysOpen !== undefined) settingsData.isAlwaysOpen = settings.isAlwaysOpen;
        if (settings.isSameTimeEveryDay !== undefined) settingsData.isSameTimeEveryDay = settings.isSameTimeEveryDay;

        // Other fields
        if (settings.vegType !== undefined) settingsData.vegType = settings.vegType;
        if (settings.minOrderAmount !== undefined) settingsData.minOrderAmount = String(settings.minOrderAmount);
        if (settings.minDeliveryTime !== undefined) settingsData.minDeliveryTime = settings.minDeliveryTime;
        if (settings.maxDeliveryTime !== undefined) settingsData.maxDeliveryTime = settings.maxDeliveryTime;
        if (settings.firstColor !== undefined) settingsData.firstColor = settings.firstColor;
        if (settings.secondColor !== undefined) settingsData.secondColor = settings.secondColor;
        if (settings.firstTextColor !== undefined) settingsData.firstTextColor = settings.firstTextColor;
        if (settings.secondTextColor !== undefined) settingsData.secondTextColor = settings.secondTextColor;

        if (existingSettings.length > 0) {
          // ✅ Update existing settings
          await tx.update(restaurantSettings)
            .set(settingsData)
            .where(eq(restaurantSettings.restaurantId, restaurantId));
        } else {
          // ✅ Insert new settings
          await tx.insert(restaurantSettings).values({
            restaurantId,
            ...settingsData,
          });
        }
      }

      // 2. تحديث المواعيد والفترات (لو مبعوتة)
      if (schedules && Array.isArray(schedules)) {
        // خطوة أ: مسح كل المواعيد القديمة للمطعم ده
        await tx.delete(restaurantSchedules)
          .where(eq(restaurantSchedules.restaurantId, restaurantId));

        // لو المصفوفة مش فاضية، هنضيف الجديد
        if (schedules.length > 0) {
          // تجهيز الداتا الجديدة للـ Insert
          const schedulesToInsert = schedules.map((schedule: any) => ({
            restaurantId: restaurantId,
            dayOfWeek: schedule.dayOfWeek,
            isOffDay: schedule.isOffDay || false,
            // لو اليوم إجازة، هنخلي الأوقات null لضمان نظافة الداتا
            openingTime: schedule.isOffDay ? null : schedule.openingTime,
            closingTime: schedule.isOffDay ? null : schedule.closingTime,
          }));

          // خطوة ب: إضافة المواعيد والفترات الجديدة
          await tx.insert(restaurantSchedules).values(schedulesToInsert);
        }
      }
    });

    res.status(200).json({
      success: true,
      message: "Update settings success"
    });
  } catch (error: any) {
    console.error("❌ Error updating settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update settings",
      error: error.message
    });
  }
}

export const getSettingsByRestaurantId = async (req: Request, res: Response): Promise<void> => {
  const restaurantId = req.user?.restaurantId || req.user?.id;

  if (!restaurantId) {
    res.status(400).json({ success: false, message: "Restaurant id is required" });
    return;
  }

  const settings = await db.select().from(restaurantSettings).where(eq(restaurantSettings.restaurantId, restaurantId)).limit(1);
  const schedules = await db.select().from(restaurantSchedules).where(eq(restaurantSchedules.restaurantId, restaurantId));

  let settingsResult = settings[0];

  // لو مفيش إعدادات خالص للمطعم ده، هنكريتله إعدادات افتراضية
  if (!settingsResult) {
    await db.insert(restaurantSettings).values({ restaurantId });
    const newSettings = await db.select().from(restaurantSettings).where(eq(restaurantSettings.restaurantId, restaurantId)).limit(1);
    settingsResult = newSettings[0];
  }

  res.status(200).json({
    success: true,
    data: {
      settings: settingsResult,
      schedules: schedules || []
    }
  });
};
