-- Migration: 0009_add_status_changed_at_to_orders
-- يضيف عمود status_changed_at لتتبع وقت تغيير الحالة بمعزل عن أي تعديلات أخرى.
-- يستخدمه الـ Auto-Deliver Cron لقياس المدة المنقضية على الحالة الحالية بدقة.

ALTER TABLE `orders`
    ADD COLUMN `status_changed_at` timestamp NULL AFTER `delivered_at`;

-- نملأ القيمة الابتدائية بـ updatedAt للأوردرات الموجودة حتى لا تكون NULL
-- (الأوردرات الجديدة ستُكتب فيها القيمة صراحةً عند كل تغيير حالة)
UPDATE `orders` SET `status_changed_at` = `updated_at` WHERE `status_changed_at` IS NULL;

-- Index على (status, status_changed_at) لاستعلام الـ Cron:
-- يبحث فقط في الأوردرات ذات الحالات النشطة وقديمة بما يكفي
CREATE INDEX `idx_orders_status_changed` ON `orders` (`status`, `status_changed_at`);

