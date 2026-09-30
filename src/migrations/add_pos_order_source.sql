-- Add POS orders to the supported order sources.
ALTER TABLE `orders`
MODIFY COLUMN `order_source` ENUM('online_order_web','online_order_app','food_aggregator','my_keeto','pos') NOT NULL;