-- Migration: Add channel column ('all', 'online', 'pos')
-- Target tables: food, food_pricing_overrides (pricingfood), variant_pricing_overrides (pricingvaritionfood), discounts, discount_groups (discount group)

-- 1. Food Table
ALTER TABLE `food` 
ADD COLUMN `channel` ENUM('all', 'online', 'pos') NOT NULL DEFAULT 'all';

-- 2. Food Pricing Overrides Table (pricingfood)
ALTER TABLE `food_pricing_overrides` 
ADD COLUMN `channel` ENUM('all', 'online', 'pos') NOT NULL DEFAULT 'all';

-- 3. Variant Pricing Overrides Table (pricingvaritionfood)
ALTER TABLE `variant_pricing_overrides` 
ADD COLUMN `channel` ENUM('all', 'online', 'pos') NOT NULL DEFAULT 'all';

-- 4. Discounts Table (discounts)
ALTER TABLE `discounts` 
ADD COLUMN `channel` ENUM('all', 'online', 'pos') NOT NULL DEFAULT 'all';

-- 5. Discount Groups Table (discount group)
ALTER TABLE `discount_groups` 
ADD COLUMN `channel` ENUM('all', 'online', 'pos') NOT NULL DEFAULT 'all';

-- 6. Variation Options
ALTER TABLE `variation_options` 
ADD COLUMN `channel` ENUM('all', 'online', 'pos') NOT NULL DEFAULT 'all';

-- 7. Food Variations
ALTER TABLE `food_variations` 
ADD COLUMN `channel` ENUM('all', 'online', 'pos') NOT NULL DEFAULT 'all';