-- Migration: Add addons_ids column to subcategories table
-- Date: 2026-05-24
-- Description: إضافة عمود addons_ids كـ JSON Array لجدول subcategories

ALTER TABLE `subcategories` 
ADD COLUMN `addons_ids` JSON DEFAULT ('[]') AFTER `category_id`;
