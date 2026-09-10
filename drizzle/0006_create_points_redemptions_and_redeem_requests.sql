CREATE TABLE IF NOT EXISTS `redeem_requests` (
    `id` char(36) NOT NULL DEFAULT (UUID()),
    `user_id` char(36) NOT NULL,
    `restaurant_id` char(36) NOT NULL,
    `food_id` char(36) NOT NULL,
    `code` varchar(10) NOT NULL,
    `points_deducted` int NOT NULL,
    `status` enum('pending','used','expired','cancelled') DEFAULT 'pending',
    `expires_at` timestamp NOT NULL,
    `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
    `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `redeem_requests_id` PRIMARY KEY (`id`),
    CONSTRAINT `redeem_requests_code_unique` UNIQUE (`code`),
    CONSTRAINT `redeem_requests_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
    CONSTRAINT `redeem_requests_restaurant_id_fk` FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants` (`id`),
    CONSTRAINT `redeem_requests_food_id_fk` FOREIGN KEY (`food_id`) REFERENCES `food` (`id`)
);
