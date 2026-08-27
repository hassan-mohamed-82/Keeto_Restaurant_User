import path from "path";
import fs from "fs/promises";
import sharp from "sharp";
import { db } from "../models/connection"; // عدلي المسار حسب مكان ملف connection لديكِ
import { eq } from "drizzle-orm";
import { food } from "../models/schema";

const TARGET_RESTAURANT_ID = "72acb976-7218-44b9-be01-36bdf321d1f3";

// Root Directory للمشروع
const rootDir = path.resolve(__dirname, "../");

async function compressSingleImage(imageUrl: string): Promise<string | null> {
    // تخطي الصور الفارغة أو التي تم تحويلها بالفعل لـ WebP أو الـ Base64
    if (!imageUrl || imageUrl.endsWith(".webp") || imageUrl.includes("data:image")) {
        return null;
    }

    // استخراج المسار النسبي من الرابط (مثال: uploads/food/12345.png)
    if (!imageUrl.includes("/uploads/")) {
        return null;
    }

    const relativePath = "uploads/" + imageUrl.split("/uploads/")[1];
    const oldFilePath = path.join(rootDir, relativePath);

    try {
        // التأكد من وجود الملف أولاً
        await fs.access(oldFilePath);
    } catch {
        console.warn(`⚠️ File not found on disk, skipping: ${oldFilePath}`);
        return null;
    }

    const ext = path.extname(oldFilePath);
    // ضغط صور JPG/PNG فقط
    if (![".jpg", ".jpeg", ".png"].includes(ext.toLowerCase())) {
        return null;
    }

    const newFilePath = oldFilePath.replace(new RegExp(`${ext}$`), ".webp");
    const oldFileName = path.basename(oldFilePath);
    const newFileName = path.basename(newFilePath);

    try {
        const buffer = await fs.readFile(oldFilePath);

        // 1. الضغط والتحويل لـ WebP باستخدام Sharp بنفس معاييرك
        await sharp(buffer)
            .resize(1200, null, { fit: "inside", withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(newFilePath);

        // 2. حذف صورة الـ PNG/JPG القديمة
        await fs.unlink(oldFilePath);

        console.log(`✅ Compressed: ${oldFileName} ➡️ ${newFileName}`);

        // إرجاع الرابط الجديد بنفس اسم الـ WebP الجديد
        return imageUrl.replace(oldFileName, newFileName);
    } catch (error: any) {
        console.error(`❌ Failed to compress ${oldFileName}:`, error.message);
        return null;
    }
}

export async function compressFoodImagesForRestaurant() {
    console.log(`🚀 Starting food images compression for Restaurant: ${TARGET_RESTAURANT_ID}...`);

    try {
        // 1. جلب عناصر الـ foodItems التابعة لهذا المطعم فقط
        const items = await db
            .select({
                id: food.id,
                image: food.image,
            })
            .from(food)
            .where(eq(food.restaurantid, TARGET_RESTAURANT_ID));

        console.log(`📦 Found ${items.length} food items for this restaurant.`);

        let updatedCount = 0;

        for (const item of items) {
            if (!item.image) continue;

            const newImageUrl = await compressSingleImage(item.image);

            // إذا تم الضغط والتحويل بنجاح، نحدث الرابط في الداتابيز
            if (newImageUrl) {
                await db
                    .update(food)
                    .set({ image: newImageUrl })
                    .where(eq(food.id, item.id));

                updatedCount++;
            }
        }

        console.log(`🎉 Finished! ${updatedCount} food images were compressed and updated.`);
    } catch (error) {
        console.error("❌ Error running compression script:", error);
    }
}

// تشغيل الدالة
compressFoodImagesForRestaurant();