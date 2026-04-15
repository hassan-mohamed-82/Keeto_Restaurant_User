import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import {
  createZone,
  getAllZones,
  getZoneById,
  updateZone,
  deleteZone,
  getallcities
} from "../../controllers/admin/zone";

const router = Router();

router.post("/", catchAsync(createZone));
router.get("/", catchAsync(getAllZones));
router.get("/:id", catchAsync(getZoneById));
router.put("/:id", catchAsync(updateZone));
router.delete("/:id", catchAsync(deleteZone));
router.get("/cities/active", catchAsync(getallcities));

export default router;
