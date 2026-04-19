"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailVerifications = void 0;
const mysql_core_1 = require("drizzle-orm/mysql-core");
const drizzle_orm_1 = require("drizzle-orm");
const schema_1 = require("../../schema");
exports.emailVerifications = (0, mysql_core_1.mysqlTable)("email_verifications", {
    id: (0, mysql_core_1.char)("id", { length: 36 }).primaryKey().default((0, drizzle_orm_1.sql) `(UUID())`),
    userId: (0, mysql_core_1.char)("user_id", { length: 36 }).notNull().references(() => schema_1.users.id),
    code: (0, mysql_core_1.varchar)("code", { length: 255 }).notNull(),
    purpose: (0, mysql_core_1.mysqlEnum)("purpose", ["verify_email", "reset_password"]).default("verify_email"),
    createdAt: (0, mysql_core_1.timestamp)("created_at").defaultNow(),
    expiresAt: (0, mysql_core_1.timestamp)("expires_at").notNull(),
});
