import { db } from '../models/connection';
import { users, userRestaurantPoints } from '../models/schema'; 
import { eq, or, and } from 'drizzle-orm';
import crypto from 'crypto';

const FOOD2GO_API_URL = 'https://lamadafoodbcknd.food2go.online/api/user/auth/users';
const TARGET_RESTAURANT_ID = 'baf7318a-7936-425d-8d99-b25ef3be365d';

async function syncAndUpdateUsers() {
  console.log('🚀 Starting API data sync...');

  try {
    const response = await fetch(FOOD2GO_API_URL, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
    }

    const result = await response.json();
    const apiUsers = Array.isArray(result) 
      ? result 
      : result.users || result.data || [];

    const totalUsers = apiUsers.length;
    console.log(`📦 Received ${totalUsers} users from API. Starting batch processing...`);

    let createdCount = 0;
    let updatedCount = 0;
    let processed = 0;

    for (const oldUser of apiUsers) {
      processed++;
      const email = oldUser.email || null;
      const phone = oldUser.phone || null;
      const oldPoints = Number(oldUser.points || 0);

      let existingUser = null;
      if (email || phone) {
        const conditions = [];
        if (email) conditions.push(eq(users.email, email));
        if (phone) conditions.push(eq(users.phone, phone));

        existingUser = await db.query.users.findFirst({
          where: or(...conditions),
        });
      }

      let targetUserId: string;

      if (existingUser) {
        targetUserId = existingUser.id;
        const updateData: Record<string, any> = {};

        if (!existingUser.email && email) updateData.email = email;
        if (!existingUser.phone && phone) updateData.phone = phone;
        if (!existingUser.photo && (oldUser.image || oldUser.photo)) {
          updateData.photo = oldUser.image || oldUser.photo;
        }
        if (!existingUser.alternatePhone && oldUser.phone_2) {
          updateData.alternatePhone = oldUser.phone_2;
        }

        if (Object.keys(updateData).length > 0) {
          await db.update(users).set(updateData).where(eq(users.id, targetUserId));
          updatedCount++;
        }
      } else {
        const fullName = [oldUser.f_name, oldUser.l_name].filter(Boolean).join(' ') || oldUser.name || 'User';
        targetUserId = crypto.randomUUID();

        await db.insert(users).values({
          id: targetUserId,
          name: fullName,
          photo: oldUser.image || oldUser.photo || null,
          email: email,
          phone: phone,
          alternatePhone: oldUser.phone_2 || null,
          password: oldUser.password || null,
          googleId: oldUser.google_id || null,
          isVerified: Boolean(oldUser.email_verified_at),
          status: oldUser.status == 1 || oldUser.status === 'active' ? 'active' : 'blocked',
          isDeleted: Boolean(oldUser.deleted_at),
          createdAt: oldUser.created_at ? new Date(oldUser.created_at) : new Date(),
        });

        createdCount++;
      }

      if (oldPoints > 0) {
        const existingPointsRecord = await db.query.userRestaurantPoints.findFirst({
          where: and(
            eq(userRestaurantPoints.userId, targetUserId),
            eq(userRestaurantPoints.restaurantId, TARGET_RESTAURANT_ID)
          ),
        });

        if (existingPointsRecord) {
          await db
            .update(userRestaurantPoints)
            .set({
              points: existingPointsRecord.points + oldPoints,
              updatedAt: new Date(),
            })
            .where(eq(userRestaurantPoints.id, existingPointsRecord.id));
        } else {
          await db.insert(userRestaurantPoints).values({
            id: crypto.randomUUID(),
            userId: targetUserId,
            restaurantId: TARGET_RESTAURANT_ID,
            points: oldPoints,
            updatedAt: new Date(),
          });
        }
      }

      // طباعة التقدم كل 500 مستخدم
      if (processed % 500 === 0 || processed === totalUsers) {
        console.log(`⏳ Progress: ${processed}/${totalUsers} users processed...`);
      }
    }

    console.log(`\n🎉 Process Completed Successfully!`);
    console.log(`✅ New Users Created: ${createdCount}`);
    console.log(`🔄 Existing Users Updated: ${updatedCount}`);

  } catch (error) {
    console.error('❌ Sync Error:', error);
  } finally {
    process.exit(0);
  }
}

syncAndUpdateUsers();