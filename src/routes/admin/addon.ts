import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import {
    createAddon,
    getAllAddons,
    getAddonById,
    updateAddon,
    deleteAddon,
    getAllRestaurantsandaddonscategory,
} from "../../controllers/admin/addon";
import { hasPermission } from "../../middlewares/hasPermission";

const router = Router();
router.get("/select",hasPermission("addon","read"),catchAsync(getAllRestaurantsandaddonscategory));
router.post("/",hasPermission("addon","create"), catchAsync(createAddon));
router.get("/",hasPermission("addon","read"), catchAsync(getAllAddons));
router.get("/:id",hasPermission("addon","read"), catchAsync(getAddonById));
router.put("/:id",hasPermission("addon","update"), catchAsync(updateAddon));
router.delete("/:id",hasPermission("addon","delete"), catchAsync(deleteAddon));

export default router;