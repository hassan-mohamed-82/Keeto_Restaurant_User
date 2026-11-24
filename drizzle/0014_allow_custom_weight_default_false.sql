-- Migration: 0014_allow_custom_weight_default_false
-- food.allow_custom_weight: column default becomes false, and every food sold by unit is set to false.
-- Foods sold by weight keep the value they already have.
-- Hand-written: contains ONLY these changes. The drizzle snapshot is NOT updated.

ALTER TABLE `food` ALTER COLUMN `allow_custom_weight` SET DEFAULT false;
--> statement-breakpoint
UPDATE `food` SET `allow_custom_weight` = false WHERE `sold_by` IS NULL OR `sold_by` = 'unit';
