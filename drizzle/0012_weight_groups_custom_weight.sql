-- Migration: 0012_weight_groups_custom_weight  (journal idx 8)
-- Weight groups (preset weights) and the custom-weight switch for weight-based foods.
-- Hand-written: contains ONLY these changes. The drizzle snapshot is NOT updated.

ALTER TABLE `food` ADD `allow_custom_weight` boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE `food_variations` ADD `is_weight_group` boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE `variation_options` ADD `weight_value` decimal(10,3) NULL;
