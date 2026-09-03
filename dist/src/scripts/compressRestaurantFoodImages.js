"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTest = runTest;
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const sharp_1 = __importDefault(require("sharp"));
const connection_1 = require("../models/connection"); // عدلي المسار حسب مشروعك
const drizzle_orm_1 = require("drizzle-orm");
const schema_1 = require("../models/schema");
const TARGET_RESTAURANT_ID = "729426f5-a6b8-4345-adf6-6e31942d69ea";
const rootDir = path_1.default.resolve(__dirname, "../");
async function testCompressImage(imageUrl) {
    if (!imageUrl || imageUrl.endsWith(".webp") || imageUrl.includes("data:image")) {
        return;
    }
    if (!imageUrl.includes("/uploads/"))
        return;
    const relativePath = "uploads/" + imageUrl.split("/uploads/")[1];
    const oldFilePath = path_1.default.join(rootDir, relativePath);
    try {
        await promises_1.default.access(oldFilePath);
    }
    catch {
        console.warn(`⚠️ File not found, skipping: ${oldFilePath}`);
        return;
    }
    const ext = path_1.default.extname(oldFilePath);
    if (![".jpg", ".jpeg", ".png"].includes(ext.toLowerCase()))
        return;
    const newFilePath = oldFilePath.replace(new RegExp(`${ext}$`), ".webp");
    const oldFileName = path_1.default.basename(oldFilePath);
    const newFileName = path_1.default.basename(newFilePath);
    try {
        const buffer = await promises_1.default.readFile(oldFilePath);
        // إنشاء نسخة webp دون مسح الأصلي ودون تعديل الداتابيز
        await (0, sharp_1.default)(buffer)
            .resize(1200, null, { fit: "inside", withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(newFilePath);
        console.log(`📸 Test created: ${newFileName} (Original ${oldFileName} kept)`);
    }
    catch (error) {
        console.error(`❌ Failed: ${oldFileName}`, error.message);
    }
}
async function runTest() {
    console.log(`🧪 Testing compression for Restaurant: ${TARGET_RESTAURANT_ID}...`);
    const items = await connection_1.db
        .select({ image: schema_1.food.image })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.eq)(schema_1.food.restaurantid, TARGET_RESTAURANT_ID));
    for (const item of items) {
        if (item.image) {
            await testCompressImage(item.image);
        }
    }
    console.log("🔍 Done creating test images! Check your uploads folder.");
}
runTest();
