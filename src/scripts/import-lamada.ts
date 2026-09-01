import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { db } from '../models/connection';
import { users, restaurant_users, userRestaurantPoints } from '../models/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

// ⚠️ ضع ID مطعم لماضه الحقيقي هنا
const LAMADA_RESTAURANT_ID = 'baf7318a-7936-425d-8d99-b25ef3be365d';
const CSV_FILE_PATH = path.join(process.cwd(), 'lamada_users.csv');

async function importLamadaData() {
    console.log('🚀 Starting Lamada users import process...');

    if (!fs.existsSync(CSV_FILE_PATH)) {
        console.error(`❌ File not found at: ${CSV_FILE_PATH}`);
        process.exit(1);
    }

    // 1. جلب البيانات الحالية لمنع التكرار (Memory Caching)
    console.log('⏳ Fetching existing records from Keeto DB...');
    const existingUsers = await db.query.users.findMany({
        columns: { id: true, email: true, phone: true, totalOrders: true }
    });

    const emailMap = new Map<string, typeof existingUsers[0]>();
    const phoneMap = new Map<string, typeof existingUsers[0]>();
    for (const u of existingUsers) {
        if (u.email) emailMap.set(u.email, u);
        if (u.phone) phoneMap.set(u.phone, u);
    }

    const existingRestaurantUsers = await db.query.restaurant_users.findMany({
        where: eq(restaurant_users.restaurantId, LAMADA_RESTAURANT_ID)
    });
    const restaurantUserSet = new Set<string>(existingRestaurantUsers.map(ru => ru.userId));

    const existingPoints = await db.query.userRestaurantPoints.findMany({
        where: eq(userRestaurantPoints.restaurantId, LAMADA_RESTAURANT_ID)
    });
    const pointsMap = new Map<string, { id: string; points: number }>();
    for (const p of existingPoints) {
        pointsMap.set(p.userId, { id: p.id, points: p.points });
    }

    // 2. قراءة الملف واستخراج البيانات
    const fileStream = fs.createReadStream(CSV_FILE_PATH);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let isHeader = true;
    const newUsersToInsert: any[] = [];
    const newRestaurantUsersToInsert: any[] = [];
    const newPointsToInsert: any[] = [];

    for await (const line of rl) {
        if (isHeader) { isHeader = false; continue; }
        if (!line.trim()) continue;

        const columns = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
        const [name, emailRaw, phoneRaw, altPhone, photo, password, status, ordersCountStr, pointsStr, createdAtStr] = columns;

        const email = emailRaw || null;
        const phone = phoneRaw || null;
        const csvOrders = Number(ordersCountStr || 0);
        const csvPoints = Number(pointsStr || 0);

        let targetUserId: string;
        let existingUser = (email && emailMap.get(email)) || (phone && phoneMap.get(phone)) || null;

        if (existingUser) {
            // مستخدم موجود سابقاً -> نحدّث عدد الطلبات فقط ونستخدم معرّفه
            targetUserId = existingUser.id;
            const updatedOrders = (existingUser.totalOrders || 0) + csvOrders;

            await db.update(users)
                .set({ totalOrders: updatedOrders })
                .where(eq(users.id, targetUserId));

            existingUser.totalOrders = updatedOrders;
        } else {
            // مستخدم جديد -> ننشئ UUID جديد
            targetUserId = crypto.randomUUID();
            const newUserObj = {
                id: targetUserId,
                name: name || 'User',
                email: email || `${targetUserId}@placeholder.com`,
                phone: phone || '00000000000',
                password: password || '123456',
                alternatePhone: altPhone || null,
                photo: photo || null,
                status: status === 'active' ? 'active' : 'blocked',
                totalOrders: csvOrders,
                createdAt: createdAtStr ? new Date(createdAtStr) : new Date(),
            };

            newUsersToInsert.push(newUserObj);

            if (email) emailMap.set(email, newUserObj as any);
            if (phone) phoneMap.set(phone, newUserObj as any);
        }

        // 🔴 جدول restaurant_users
        if (!restaurantUserSet.has(targetUserId)) {
            newRestaurantUsersToInsert.push({
                id: crypto.randomUUID(),
                restaurantId: LAMADA_RESTAURANT_ID,
                userId: targetUserId,
                status: status === 'active' ? 'active' : 'blocked',
                createdAt: new Date(),
                updatedAt: new Date()
            });
            restaurantUserSet.add(targetUserId);
        }

        // 🔴 جدول user_restaurant_points
        if (csvPoints > 0) {
            const existingPoint = pointsMap.get(targetUserId);
            if (existingPoint) {
                await db.update(userRestaurantPoints)
                    .set({ points: existingPoint.points + csvPoints, updatedAt: new Date() })
                    .where(eq(userRestaurantPoints.id, existingPoint.id));
            } else {
                const newPointObj = {
                    id: crypto.randomUUID(),
                    userId: targetUserId,
                    restaurantId: LAMADA_RESTAURANT_ID,
                    points: csvPoints,
                    updatedAt: new Date(),
                    createdAt: createdAtStr ? new Date(createdAtStr) : new Date(),
                };
                newPointsToInsert.push(newPointObj);
                pointsMap.set(targetUserId, { id: newPointObj.id, points: csvPoints });
            }
        }
    }

    // 3. الإدخال بالدفعات (Batch Operations)
    const BATCH_SIZE = 500;

    if (newUsersToInsert.length > 0) {
        console.log(`⚡ Inserting ${newUsersToInsert.length} users into [users]...`);
        for (let i = 0; i < newUsersToInsert.length; i += BATCH_SIZE) {
            await db.insert(users).values(newUsersToInsert.slice(i, i + BATCH_SIZE));
        }
    }

    if (newRestaurantUsersToInsert.length > 0) {
        console.log(`⚡ Linking ${newRestaurantUsersToInsert.length} records into [restaurant_users]...`);
        for (let i = 0; i < newRestaurantUsersToInsert.length; i += BATCH_SIZE) {
            await db.insert(restaurant_users).values(newRestaurantUsersToInsert.slice(i, i + BATCH_SIZE));
        }
    }

    if (newPointsToInsert.length > 0) {
        console.log(`⚡ Inserting ${newPointsToInsert.length} records into [user_restaurant_points]...`);
        for (let i = 0; i < newPointsToInsert.length; i += BATCH_SIZE) {
            await db.insert(userRestaurantPoints).values(newPointsToInsert.slice(i, i + BATCH_SIZE));
        }
    }

    console.log('🎉 Import completed successfully across all 3 tables!');
}

importLamadaData().catch(console.error).finally(() => process.exit(0));