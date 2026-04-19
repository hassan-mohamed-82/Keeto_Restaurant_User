ALTER TABLE `users` DROP FOREIGN KEY `users_country_id_countries_id_fk`;
--> statement-breakpoint
ALTER TABLE `users` DROP FOREIGN KEY `users_city_id_cities_id_fk`;
--> statement-breakpoint
ALTER TABLE `users` DROP FOREIGN KEY `users_zone_id_zones_id_fk`;
--> statement-breakpoint
ALTER TABLE `users` ADD `fcm_token` text;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `country_id`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `city_id`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `zone_id`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `address`;