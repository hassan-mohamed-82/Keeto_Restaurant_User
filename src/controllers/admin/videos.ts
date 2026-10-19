import { Request, Response } from "express";
import { and, count, desc, eq, like, or } from "drizzle-orm";
import { db } from "../../models/connection";
import { videos } from "../../models/schema";
import { NotFound } from "../../Errors";
import { SuccessResponse } from "../../utils/response";
import {
    getVideosQuerySchema,
    videoIdParamSchema,
} from "../../validation/admin/videos";

// ─── Get All Videos (Paginated + Filter) ───
export const getVideos = async (req: Request, res: Response) => {
    const { search, status, page, limit } = getVideosQuerySchema.parse(req.query);
    const offset = (page - 1) * limit;

    const filters = [];

    if (status && status !== "all") {
        filters.push(eq(videos.status, status));
    }

    if (search) {
        const pattern = `%${search}%`;
        filters.push(
            or(
                like(videos.title, pattern),
                like(videos.titleAr, pattern),
                like(videos.description, pattern),
                like(videos.descriptionAr, pattern)
            )!
        );
    }

    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    const [rows, totalRows] = await Promise.all([
        db
            .select()
            .from(videos)
            .where(whereClause)
            .orderBy(desc(videos.createdAt))
            .limit(limit)
            .offset(offset),
        db
            .select({ total: count() })
            .from(videos)
            .where(whereClause),
    ]);

    const totalItems = Number(totalRows[0]?.total ?? 0);

    return SuccessResponse(res, {
        data: rows,
        pagination: {
            page,
            limit,
            totalItems,
            totalPages: Math.ceil(totalItems / limit),
        },
    });
};

// ─── Get Video By ID ───
export const getVideoById = async (req: Request, res: Response) => {
    const { id } = videoIdParamSchema.parse(req.params);

    const [video] = await db
        .select()
        .from(videos)
        .where(eq(videos.id, id))
        .limit(1);

    if (!video) {
        throw new NotFound("Video not found");
    }

    return SuccessResponse(res, { data: video });
};
