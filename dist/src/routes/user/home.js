"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
// استيراد الدوال من الكنترولر بتاع الـ Explore اللي عملناه
const home_1 = require("../../controllers/user/home");
// استيراد دوال المفضلة من الكنترولر بتاعها
const home_2 = require("../../controllers/user/home");
const router = (0, express_1.Router)();
// ==========================================
// 🏠 راوتس التصفح والشاشة الرئيسية (Explore & Home)
// ==========================================
// 1. جلب الشاشة الرئيسية (المطابخ، الفئات، المطاعم)
// 🟢 GET: /api/user/explore/home
router.get("/", home_1.getHomeScreen);
// 2. جلب المطاعم الخاصة بمطبخ معين (مثال: المطاعم التركية)
// 🟢 GET: /api/user/explore/cuisines/:cuisineId/restaurants
router.get("/cuisines/:cuisineId/restaurants", home_1.getRestaurantsByCuisine);
// 3. جلب الأكلات الخاصة بفئة معينة (مثال: الشاورما)
// 🟢 GET: /api/user/explore/categories/:categoryId/items
router.get("/categories/:categoryId/items", home_1.getFoodsByCategory);
// 4. جلب تفاصيل مطعم معين والمنيو بتاعه
// 🟢 GET: /api/user/explore/restaurants/:restaurantId
router.get("/restaurants/:restaurantId", home_1.getRestaurantDetails);
// 5. إضافة أو إزالة مطعم/أكلة من المفضلة (زرار القلب)
// 🟡 POST: /api/user/explore/favorites/toggle
// Body: { "userId": "...", "type": "restaurant" | "food", "restaurantId": "...", "foodId": "..." }
router.post("/favorites/toggle", home_2.toggleFavorite);
// 6. جلب قائمة الرغبات الخاصة بيوزر معين (Wishlist)
// 🟢 GET: /api/user/explore/favorites/:userId
router.get("/favorites", home_2.getUserFavorites);
exports.default = router;
