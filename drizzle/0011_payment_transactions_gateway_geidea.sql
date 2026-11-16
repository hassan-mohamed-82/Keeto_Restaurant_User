-- Migration: 0011_payment_transactions_gateway_geidea  (journal idx 7)
-- SEPARATE, approve on its own. Pure addition of 'geidea', which the customer project already
-- writes (Geidea webhook / redirect -> confirmOrderPayment / recordFailedPayment).
-- Run ONLY if `SHOW COLUMNS FROM payment_transactions LIKE 'gateway'` shows exactly
-- enum('kashier','paymob') (if it already includes 'geidea', skip it; if it has any other
-- value, do NOT run it, because this statement would remove that value).

ALTER TABLE `payment_transactions` MODIFY COLUMN `gateway` enum('kashier','paymob','geidea') NOT NULL;
