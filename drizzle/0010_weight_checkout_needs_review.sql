-- Migration: 0010_weight_checkout_needs_review  (journal idx 6)
-- Weight-based orders, Visa checkout claim + late-payment review.
-- Hand-written: contains ONLY the weight-flow changes. The drizzle snapshot is NOT updated.
-- File number 0010 because 0006-0009 are already used by hand-written files outside the journal.

ALTER TABLE `weight_requests` MODIFY COLUMN `status` enum('awaiting_weighing','awaiting_customer_approval','checking_out','approved','cancelled','expired') NOT NULL DEFAULT 'awaiting_weighing';
--> statement-breakpoint
ALTER TABLE `weight_requests` ADD `payment_attempts` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `weight_requests` ADD `checkout_started_at` timestamp NULL;
--> statement-breakpoint
CREATE INDEX `idx_wr_order_id` ON `weight_requests` (`order_id`);
--> statement-breakpoint
ALTER TABLE `payment_transactions` MODIFY COLUMN `status` enum('pending','success','failed','needs_review') NOT NULL DEFAULT 'pending';
