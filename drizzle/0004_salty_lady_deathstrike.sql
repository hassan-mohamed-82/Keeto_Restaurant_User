CREATE TABLE `food_ingredients` (
	`id` char(36) NOT NULL DEFAULT (UUID()),
	`food_id` char(36) NOT NULL,
	`ingredient_id` char(36) NOT NULL,
	`is_removable` boolean DEFAULT false,
	CONSTRAINT `food_ingredients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ingredient_categories` (
	`id` char(36) NOT NULL DEFAULT (UUID()),
	`restaurant_id` char(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`status` enum('active','inactive') DEFAULT 'active',
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ingredient_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ingredients` (
	`id` char(36) NOT NULL DEFAULT (UUID()),
	`restaurant_id` char(36) NOT NULL,
	`category_id` char(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`in_stock` boolean DEFAULT true,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ingredients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `favorites` (
	`id` char(36) NOT NULL DEFAULT (UUID()),
	`user_id` char(36) NOT NULL,
	`restaurant_id` char(36),
	`food_id` char(36),
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `favorites_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `phone` varchar(20);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `password` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `google_id` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `facebook_id` varchar(255);--> statement-breakpoint
ALTER TABLE `food_ingredients` ADD CONSTRAINT `food_ingredients_food_id_food_id_fk` FOREIGN KEY (`food_id`) REFERENCES `food`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `food_ingredients` ADD CONSTRAINT `food_ingredients_ingredient_id_ingredients_id_fk` FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ingredient_categories` ADD CONSTRAINT `ingredient_categories_restaurant_id_restaurants_id_fk` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ingredients` ADD CONSTRAINT `ingredients_restaurant_id_restaurants_id_fk` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ingredients` ADD CONSTRAINT `ingredients_category_id_ingredient_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `ingredient_categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `favorites` ADD CONSTRAINT `favorites_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `favorites` ADD CONSTRAINT `favorites_restaurant_id_restaurants_id_fk` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `favorites` ADD CONSTRAINT `favorites_food_id_food_id_fk` FOREIGN KEY (`food_id`) REFERENCES `food`(`id`) ON DELETE no action ON UPDATE no action;