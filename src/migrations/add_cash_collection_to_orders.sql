-- Migration: Add cash collection tracking columns to orders table
-- Date: 2026-09-21
-- Description: إضافة أعمدة توريد الكاش من مندوب التوصيل لإدارة المطعم

ALTER TABLE `orders` 
ADD COLUMN `is_cash_collected` BOOLEAN DEFAULT FALSE AFTER `delivery_man_id`,
ADD COLUMN `cash_collected_at` TIMESTAMP NULL AFTER `is_cash_collected`,
ADD COLUMN `cash_collected_by` CHAR(36) NULL AFTER `cash_collected_at`;
