import path from "path";
import fs from "fs/promises";
import sharp from "sharp";
import { db } from "../models/connection"; // عدلي المسار حسب مشروعك
import { eq } from "drizzle-orm";
import { food } from "../models/schema";

const TARGET_RESTAURANT_ID = "729426f5-a6b8-4345-adf6-6e31942d69ea";
const rootDir = path.resolve(__dirname, "../");

async function testCompressImage(imageUrl: string) {
    if (!imageUrl || imageUrl.endsWith(".webp") || imageUrl.includes("data:image")) {
        return;
    }

    if (!imageUrl.includes("/uploads/")) return;

    const relativePath = "uploads/" + imageUrl.split("/uploads/")[1];
    const oldFilePath = path.join(rootDir, relativePath);

    try {
        await fs.access(oldFilePath);
    } catch {
        console.warn(`⚠️ File not found, skipping: ${oldFilePath}`);
        return;
    }

    const ext = path.extname(oldFilePath);
    if (![".jpg", ".jpeg", ".png"].includes(ext.toLowerCase())) return;

    const newFilePath = oldFilePath.replace(new RegExp(`${ext}$`), ".webp");
    const oldFileName = path.basename(oldFilePath);
    const newFileName = path.basename(newFilePath);

    try {
        const buffer = await fs.readFile(oldFilePath);

        // إنشاء نسخة webp دون مسح الأصلي ودون تعديل الداتابيز
        await sharp(buffer)
            .resize(1200, null, { fit: "inside", withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(newFilePath);

        console.log(`📸 Test created: ${newFileName} (Original ${oldFileName} kept)`);
    } catch (error: any) {
        console.error(`❌ Failed: ${oldFileName}`, error.message);
    }
}

export async function runTest() {
    console.log(`🧪 Testing compression for Restaurant: ${TARGET_RESTAURANT_ID}...`);

    const items = await db
        .select({ image: food.image })
        .from(food)
        .where(eq(food.restaurantid, TARGET_RESTAURANT_ID));

    for (const item of items) {
        if (item.image) {
            await testCompressImage(item.image);
        }
    }

    console.log("🔍 Done creating test images! Check your uploads folder.");
}

runTest();