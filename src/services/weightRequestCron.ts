import cron from "node-cron";
import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "../models/connection";
import { weightRequests, cartItems } from "../models/schema";

let isRunning = false;

/**
 * Checks for expired weight requests and cleans up associated cart items.
 * Applies the same cleanup as cancel:
 * - Unlocks and resets customer's own items (finalWeight = null, isUnavailable = false, weightRequestId = null).
 * - Deletes restaurant-added items.
 */
export async function processExpiredWeightRequests() {
    if (isRunning) return;
    isRunning = true;

    try {
        const now = new Date();

        // Find candidate expired requests
        const candidates = await db
            .select({
                id: weightRequests.id,
                userId: weightRequests.userId,
                status: weightRequests.status,
            })
            .from(weightRequests)
            .where(
                and(
                    inArray(weightRequests.status, ["awaiting_weighing", "awaiting_customer_approval"]),
                    lt(weightRequests.expiresAt, now)
                )
            )
            .limit(50);

        for (const candidate of candidates) {
            await db.transaction(async (tx) => {
                // Conditional/idempotent update
                const [locked] = await tx
                    .select({ id: weightRequests.id })
                    .from(weightRequests)
                    .where(
                        and(
                            eq(weightRequests.id, candidate.id),
                            inArray(weightRequests.status, ["awaiting_weighing", "awaiting_customer_approval"]),
                            lt(weightRequests.expiresAt, new Date())
                        )
                    )
                    .for("update");

                if (!locked) return; // Already processed by another runner or approved/cancelled

                await tx
                    .update(weightRequests)
                    .set({
                        status: "expired",
                        updatedAt: new Date(),
                    })
                    .where(eq(weightRequests.id, candidate.id));

                // 1. Delete restaurant-added items
                await tx
                    .delete(cartItems)
                    .where(
                        and(
                            eq(cartItems.weightRequestId, candidate.id),
                            eq(cartItems.addedBy, "restaurant")
                        )
                    );

                // 2. Unlock and reset customer's own items
                await tx
                    .update(cartItems)
                    .set({
                        weightRequestId: null,
                        finalWeight: null,
                        isUnavailable: false,
                        updatedAt: new Date(),
                    })
                    .where(
                        and(
                            eq(cartItems.weightRequestId, candidate.id),
                            eq(cartItems.addedBy, "customer")
                        )
                    );
            });
        }
    } catch (err) {
        console.error("[weightRequestCron] Error processing expired requests:", err);
    } finally {
        isRunning = false;
    }
}

export function initWeightRequestCron() {
    // Run every minute
    cron.schedule("* * * * *", async () => {
        await processExpiredWeightRequests();
    });
    console.log("[weightRequestCron] Initialized: running every minute.");
}
