"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.zoneDeliveryFees = void 0;
const mysql_core_1 = require("drizzle-orm/mysql-core");
const drizzle_orm_1 = require("drizzle-orm");
const zone_1 = require("./zone"); // مسار ملف الـ zones بتاعك
exports.zoneDeliveryFees = (0, mysql_core_1.mysqlTable)("zone_delivery_fees", {
    id: (0, mysql_core_1.char)("id", { length: 36 }).primaryKey().default((0, drizzle_orm_1.sql) `(UUID())`),
    fromZoneId: (0, mysql_core_1.char)("from_zone_id", { length: 36 }).references(() => zone_1.zones.id).notNull(), // منطقة المطعم
    toZoneId: (0, mysql_core_1.char)("to_zone_id", { length: 36 }).references(() => zone_1.zones.id).notNull(), // منطقة العميل
    fee: (0, mysql_core_1.decimal)("fee", { precision: 10, scale: 2 }).notNull(), // سعر التوصيل
    createdAt: (0, mysql_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at").defaultNow().onUpdateNow(),
});
