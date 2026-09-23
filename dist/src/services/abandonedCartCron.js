"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initAbandonedCartCron = initAbandonedCartCron;
const node_cron_1 = __importDefault(require("node-cron"));
const connection_1 = require("../models/connection");
const schema_1 = require("../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
function initAbandonedCartCron() {
    console.log("⏰ Abandoned Guest Cart Cleanup Cron initialized...");
    // Run daily at 00:05 (midnight + 5 mins)
    node_cron_1.default.schedule("5 0 * * *", async () => {
        try {
            console.log("🧹 Running daily abandoned guest cart cleanup...");
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            // 1. Find inactive guest user IDs created more than 30 days ago
            const staleGuests = await connection_1.db
                .select({ id: schema_1.users.id })
                .from(schema_1.users)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.users.isGuest, true), (0, drizzle_orm_1.lt)(schema_1.users.createdAt, thirtyDaysAgo)))
                .limit(500);
            if (!staleGuests.length) {
                console.log("🧹 No stale guest accounts found to clean up.");
                return;
            }
            const guestIds = staleGuests.map((u) => u.id);
            // 2. Identify which of these guest users have placed orders (we preserve them)
            const orderedGuestRows = await connection_1.db
                .select({ userId: schema_1.orders.userId })
                .from(schema_1.orders)
                .where((0, drizzle_orm_1.inArray)(schema_1.orders.userId, guestIds));
            const orderedUserIds = new Set(orderedGuestRows.map((o) => o.userId));
            // Guest IDs that never placed any order
            const abandonGuestIds = guestIds.filter((id) => !orderedUserIds.has(id));
            if (abandonGuestIds.length > 0) {
                // 3. Delete stale cart items
                await connection_1.db
                    .delete(schema_1.cartItems)
                    .where((0, drizzle_orm_1.inArray)(schema_1.cartItems.userId, abandonGuestIds));
                // 4. Delete stale temporary addresses created for these guests
                await connection_1.db
                    .delete(schema_1.addresses)
                    .where((0, drizzle_orm_1.inArray)(schema_1.addresses.userId, abandonGuestIds));
                // 5. Delete empty shadow guest accounts
                await connection_1.db
                    .delete(schema_1.users)
                    .where((0, drizzle_orm_1.inArray)(schema_1.users.id, abandonGuestIds));
                console.log(`✅ Cleaned up abandoned carts and guest data for ${abandonGuestIds.length} stale guest account(s).`);
            }
            else {
                console.log("🧹 All stale guest accounts had active orders, preserving records.");
            }
        }
        catch (error) {
            console.error("❌ Error running abandoned cart cleanup cron:", error);
        }
    });
}
