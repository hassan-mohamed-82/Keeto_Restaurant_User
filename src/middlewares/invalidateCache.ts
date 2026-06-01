import { Request, Response, NextFunction } from "express";
import redis from "../config/redis";

export const invalidateCache = (req: Request, res: Response, next: NextFunction) => {
    // Only intercept modifying requests
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        // Wait for the response to finish
        res.on('finish', async () => {
            // Only invalidate if the request was successful
            if (res.statusCode >= 200 && res.statusCode < 300) {
                try {
                    // Invalidate home screen
                    await redis.del('home_screen_data');

                    // Invalidate all dynamic cached data (restaurants by cuisine, foods by category, restaurant details)
                    const cuisineKeys = await redis.keys('restaurants_cuisine:*');
                    if (cuisineKeys.length > 0) await redis.del(...cuisineKeys);

                    const categoryKeys = await redis.keys('foods_category:*');
                    if (categoryKeys.length > 0) await redis.del(...categoryKeys);

                    const restaurantKeys = await redis.keys('restaurant_details:*');
                    if (restaurantKeys.length > 0) await redis.del(...restaurantKeys);

                    console.log("Admin modified data - Successfully invalidated Redis caches.");
                } catch (err) {
                    console.error("Redis Cache invalidation error:", err);
                }
            }
        });
    }
    
    next();
};
