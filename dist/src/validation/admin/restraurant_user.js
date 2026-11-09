"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserStatsParamsSchema = exports.getRestaurantUsersQuerySchema = void 0;
const zod_1 = require("zod");
exports.getRestaurantUsersQuerySchema = zod_1.z.object({
    status: zod_1.z.enum(["active", "blocked"]).optional(),
    search: zod_1.z.string().optional(),
    phone: zod_1.z.string().optional(),
    name: zod_1.z.string().optional(),
    email: zod_1.z.string().optional(),
    startDate: zod_1.z.string().optional(),
    endDate: zod_1.z.string().optional(),
    totalSpending: zod_1.z.string().optional(),
    page: zod_1.z.string().optional(),
    limit: zod_1.z.string().optional(),
    sortBy: zod_1.z.string().optional(),
    sortOrder: zod_1.z.enum(["asc", "desc"]).optional(),
}).passthrough();
exports.getUserStatsParamsSchema = zod_1.z.object({
    id: zod_1.z.string().uuid("Invalid user ID — must be a valid UUID"),
});
