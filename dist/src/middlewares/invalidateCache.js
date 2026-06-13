"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.invalidateCache = void 0;
const redis_1 = __importDefault(require("../config/redis"));
const invalidateCache = (req, res, next) => {
    // Only intercept modifying requests
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        // Wait for the response to finish
        res.on('finish', async () => {
            // Only invalidate if the request was successful
            if (res.statusCode >= 200 && res.statusCode < 300) {
                try {
                    // Invalidate home screen
                    await redis_1.default.del('home_screen_data');
                    // Invalidate all dynamic cached data (restaurants by cuisine, foods by category, restaurant details)
                    const cuisineKeys = await redis_1.default.keys('restaurants_cuisine:*');
                    if (cuisineKeys.length > 0)
                        await redis_1.default.del(...cuisineKeys);
                    const categoryKeys = await redis_1.default.keys('foods_category:*');
                    if (categoryKeys.length > 0)
                        await redis_1.default.del(...categoryKeys);
                    const restaurantKeys = await redis_1.default.keys('restaurant_details:*');
                    if (restaurantKeys.length > 0)
                        await redis_1.default.del(...restaurantKeys);
                    console.log("Admin modified data - Successfully invalidated Redis caches.");
                }
                catch (err) {
                    console.error("Redis Cache invalidation error:", err);
                }
            }
        });
    }
    next();
};
exports.invalidateCache = invalidateCache;
