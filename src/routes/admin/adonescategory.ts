import { Router } from "express";
import { createAdone, getAllAdones, getAdoneById, updateAdone, deleteAdone, toggleAdoneStatus } from "../../controllers/admin/adonescategory";

const router = Router();

router.post("/", createAdone);
router.get("/", getAllAdones);
router.get("/:id", getAdoneById);
router.put("/:id", updateAdone);
router.delete("/:id", deleteAdone);
router.patch("/:id/status", toggleAdoneStatus);

export default router;