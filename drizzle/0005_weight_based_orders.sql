-- Migration: 0005_weight_based_orders
-- Weight-based products with "weigh first, pay after approval" flow

-- 1. Create weight_requests table (pending weighing state in cart)
CREATE TABLE `weight_requests` (
	`id` char(36) NOT NULL DEFAULT (UUID()),
	`user_id` char(36) NOT NULL,
	`restaurant_id` char(36) NOT NULL,
	`branch_id` char(36),
	`status` enum('awaiting_weighing','awaiting_customer_approval','approved','cancelled','expired') NOT NULL DEFAULT 'awaiting_weighing',
	`cancel_reason` varchar(255),
	`expires_at` timestamp NOT NULL,
	`order_id` char(36),
	`weighed_by` char(36),
	`weighed_at` timestamp,
	`weighing_log` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `weight_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `weight_requests` ADD CONSTRAINT `weight_requests_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `weight_requests` ADD CONSTRAINT `weight_requests_restaurant_id_restaurants_id_fk` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `weight_requests` ADD CONSTRAINT `weight_requests_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `weight_requests` ADD CONSTRAINT `weight_requests_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `idx_wr_status_expires` ON `weight_requests` (`status`,`expires_at`);
--> statement-breakpoint
CREATE INDEX `idx_wr_user_restaurant` ON `weight_requests` (`user_id`,`restaurant_id`);
--> statement-breakpoint

-- 2. Food table: weight selling columns
ALTER TABLE `food` ADD `sold_by` enum('unit','weight') NOT NULL DEFAULT 'unit';
--> statement-breakpoint
ALTER TABLE `food` ADD `weight_unit` enum('kg','gm');
--> statement-breakpoint

-- 3. Restaurant settings: weight timeout & max increase limits
ALTER TABLE `restaurant_settings` ADD `weight_max_increase_percent` int NOT NULL DEFAULT 10;
--> statement-breakpoint
ALTER TABLE `restaurant_settings` ADD `weight_restaurant_timeout_min` int NOT NULL DEFAULT 10;
--> statement-breakpoint
ALTER TABLE `restaurant_settings` ADD `weight_customer_timeout_min` int NOT NULL DEFAULT 15;
--> statement-breakpoint

-- 4. Cart items: weight locking and weighing columns
ALTER TABLE `cart_items` ADD `weight` decimal(10,3);
--> statement-breakpoint
ALTER TABLE `cart_items` ADD `final_weight` decimal(10,3);
--> statement-breakpoint
ALTER TABLE `cart_items` ADD `is_unavailable` boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE `cart_items` ADD `weight_unit` enum('kg','gm');
--> statement-breakpoint
ALTER TABLE `cart_items` ADD `weight_request_id` char(36);
--> statement-breakpoint
ALTER TABLE `cart_items` ADD CONSTRAINT `cart_items_weight_request_id_weight_requests_id_fk` FOREIGN KEY (`weight_request_id`) REFERENCES `weight_requests`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

-- 5. Order items: weight result columns (only what is needed to show the result)
ALTER TABLE `order_items` ADD `ordered_weight` decimal(10,3);
--> statement-breakpoint
ALTER TABLE `order_items` ADD `final_weight` decimal(10,3);
--> statement-breakpoint
ALTER TABLE `order_items` ADD `weight_unit` enum('kg','gm');