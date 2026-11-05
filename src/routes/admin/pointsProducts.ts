import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { hasPermission } from "../../middlewares/hasPermission";
import {
    getFoodsForPointsSelect,
    getPointsProducts,
    enrollPointsProducts,
    togglePointsProduct,
    removePointsProduct,
} from "../../controllers/admin/pointsProducts";

const router = Router();

// ✅ Food picker — returns all active foods, marking which are already enrolled
// GET /points-products/food-select
router.get("/food-select", hasPermission("pointsProducts", "read"), catchAsync(getFoodsForPointsSelect));

// ✅ List all foods currently enrolled in the points program
// GET /points-products
router.get("/", hasPermission("pointsProducts", "read"), catchAsync(getPointsProducts));

// ✅ Enroll foods — accepts single food OR bulk array in one request
// POST /points-products
// Body: { foodId: "uuid" }             ← single
// Body: { foodIds: ["uuid", "uuid"] }  ← multiple
router.post("/", hasPermission("pointsProducts", "update"), catchAsync(enrollPointsProducts));

// ✅ Toggle isActive on / off for one enrollment entry
// PUT /points-products/:id/toggle
router.put("/:id/toggle", hasPermission("pointsProducts", "update"), catchAsync(togglePointsProduct));

// ✅ Remove a food from the enrollment list
// DELETE /points-products/:id
router.delete("/:id", hasPermission("pointsProducts", "delete"), catchAsync(removePointsProduct));

export default router;
