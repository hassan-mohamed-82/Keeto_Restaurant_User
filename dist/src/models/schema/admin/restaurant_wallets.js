"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.restaurantWalletTransactions = exports.restaurantWallets = void 0;
// models/restaurantWallet.ts
const mysql_core_1 = require("drizzle-orm/mysql-core");
const drizzle_orm_1 = require("drizzle-orm");
const restaurants_1 = require("./restaurants");
// ==========================================
// Restaurant Wallet
// ==========================================
exports.restaurantWallets = (0, mysql_core_1.mysqlTable)("restaurant_wallets", {
    id: (0, mysql_core_1.char)("id", { length: 36 }).primaryKey().default((0, drizzle_orm_1.sql) `(UUID())`),
    restaurantId: (0, mysql_core_1.char)("restaurant_id", { length: 36 })
        .references(() => restaurants_1.restaurants.id)
        .notNull()
        .unique(),
    balance: (0, mysql_core_1.decimal)("balance", { precision: 10, scale: 2 }).default("0.00"),
    collectedCash: (0, mysql_core_1.decimal)("collected_cash", { precision: 10, scale: 2 }).default("0.00"),
    pendingWithdraw: (0, mysql_core_1.decimal)("pending_withdraw", { precision: 10, scale: 2 }).default("0.00"),
    totalWithdrawn: (0, mysql_core_1.decimal)("total_withdrawn", { precision: 10, scale: 2 }).default("0.00"),
    totalEarning: (0, mysql_core_1.decimal)("total_earning", { precision: 10, scale: 2 }).default("0.00"),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at").defaultNow().onUpdateNow(),
});
// ==========================================
// Wallet Transactions (IMPORTANT)
// ==========================================
exports.restaurantWalletTransactions = (0, mysql_core_1.mysqlTable)("restaurant_wallet_transactions", {
    id: (0, mysql_core_1.char)("id", { length: 36 }).primaryKey().default((0, drizzle_orm_1.sql) `(UUID())`),
    restaurantId: (0, mysql_core_1.char)("restaurant_id", { length: 36 })
        .references(() => restaurants_1.restaurants.id)
        .notNull(),
    type: (0, mysql_core_1.mysqlEnum)("type", [
        "order_payment",
        "cash_collection",
        "withdraw_request",
        "withdraw_approved",
        "adjustment"
    ]).notNull(),
    amount: (0, mysql_core_1.decimal)("amount", { precision: 10, scale: 2 }).notNull(),
    balanceBefore: (0, mysql_core_1.decimal)("balance_before", { precision: 10, scale: 2 }).notNull(),
    balanceAfter: (0, mysql_core_1.decimal)("balance_after", { precision: 10, scale: 2 }).notNull(),
    method: (0, mysql_core_1.varchar)("method", { length: 50 }).default("cash"),
    reference: (0, mysql_core_1.varchar)("reference", { length: 255 }),
    note: (0, mysql_core_1.text)("note"),
    createdAt: (0, mysql_core_1.timestamp)("created_at").defaultNow(),
});
