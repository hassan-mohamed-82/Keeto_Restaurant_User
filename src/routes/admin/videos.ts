import { Router } from "express";
import {
    getVideoById,
    getVideos,
} from "../../controllers/admin/videos";
import { validate } from "../../middlewares/validation";
import { catchAsync } from "../../utils/catchAsync";
import {
    getVideosQuerySchema,
    videoIdParamSchema,
} from "../../validation/admin/videos";
import { hasPermission } from "../../middlewares/hasPermission";

const router = Router();

router.get(
    "/",
    hasPermission("Videos", "read"),
    validate(getVideosQuerySchema, "query"),
    catchAsync(getVideos)
);

router.get(
    "/:id",
    hasPermission("Videos", "read"),
    validate(videoIdParamSchema, "params"),
    catchAsync(getVideoById)
);

export default router;
