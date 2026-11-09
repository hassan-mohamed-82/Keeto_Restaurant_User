"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertFreeDeliveryOfferSchema = void 0;
const zod_1 = require("zod");
exports.upsertFreeDeliveryOfferSchema = zod_1.z.object({
    status: zod_1.z.enum(["active", "inactive"]).optional(),
    minOrderAmount: zod_1.z.coerce.number().min(0, "minOrderAmount must be a non-negative number").optional(),
    maxOrdersPerUser: zod_1.z.coerce.number().int().min(1, "maxOrdersPerUser must be at least 1").nullable().optional(),
    startDate: zod_1.z.string().datetime({ offset: true }).nullable().optional(),
    endDate: zod_1.z.string().datetime({ offset: true }).nullable().optional(),
});
