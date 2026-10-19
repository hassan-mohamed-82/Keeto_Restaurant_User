import { z } from "zod";

export const getRestaurantUsersQuerySchema = z.object({
    status: z.enum(["active", "blocked"]).optional(),
    search: z.string().optional(),
    phone: z.string().optional(),
    name: z.string().optional(),
    email: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    totalSpending: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
}).passthrough();

export type GetRestaurantUsersQueryInput = z.infer<typeof getRestaurantUsersQuerySchema>;

export const getUserStatsParamsSchema = z.object({
    id: z.string().uuid("Invalid user ID — must be a valid UUID"),
});

export type GetUserStatsParamsInput = z.infer<typeof getUserStatsParamsSchema>;
