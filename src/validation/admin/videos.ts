import { z } from "zod";

export const videoIdParamSchema = z.object({
    id: z.string().uuid("Invalid video ID"),
});

export const getVideosQuerySchema = z.object({
    search: z.string().trim().optional(),
    status: z.enum(["active", "inactive", "all"]).optional().default("all"),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type GetVideosQueryInput = z.infer<typeof getVideosQuerySchema>;
