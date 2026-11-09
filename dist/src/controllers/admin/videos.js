"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVideoById = exports.getVideos = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const Errors_1 = require("../../Errors");
const response_1 = require("../../utils/response");
const videos_1 = require("../../validation/admin/videos");
// ─── Get All Videos (Paginated + Filter) ───
const getVideos = async (req, res) => {
    const { search, status, page, limit } = videos_1.getVideosQuerySchema.parse(req.query);
    const offset = (page - 1) * limit;
    const filters = [];
    if (status && status !== "all") {
        filters.push((0, drizzle_orm_1.eq)(schema_1.videos.status, status));
    }
    if (search) {
        const pattern = `%${search}%`;
        filters.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(schema_1.videos.title, pattern), (0, drizzle_orm_1.like)(schema_1.videos.titleAr, pattern), (0, drizzle_orm_1.like)(schema_1.videos.description, pattern), (0, drizzle_orm_1.like)(schema_1.videos.descriptionAr, pattern)));
    }
    const whereClause = filters.length > 0 ? (0, drizzle_orm_1.and)(...filters) : undefined;
    const [rows, totalRows] = await Promise.all([
        connection_1.db
            .select()
            .from(schema_1.videos)
            .where(whereClause)
            .orderBy((0, drizzle_orm_1.desc)(schema_1.videos.createdAt))
            .limit(limit)
            .offset(offset),
        connection_1.db
            .select({ total: (0, drizzle_orm_1.count)() })
            .from(schema_1.videos)
            .where(whereClause),
    ]);
    const totalItems = Number(totalRows[0]?.total ?? 0);
    return (0, response_1.SuccessResponse)(res, {
        data: rows,
        pagination: {
            page,
            limit,
            totalItems,
            totalPages: Math.ceil(totalItems / limit),
        },
    });
};
exports.getVideos = getVideos;
// ─── Get Video By ID ───
const getVideoById = async (req, res) => {
    const { id } = videos_1.videoIdParamSchema.parse(req.params);
    const [video] = await connection_1.db
        .select()
        .from(schema_1.videos)
        .where((0, drizzle_orm_1.eq)(schema_1.videos.id, id))
        .limit(1);
    if (!video) {
        throw new Errors_1.NotFound("Video not found");
    }
    return (0, response_1.SuccessResponse)(res, { data: video });
};
exports.getVideoById = getVideoById;
