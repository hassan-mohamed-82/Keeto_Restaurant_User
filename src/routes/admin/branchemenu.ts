import { Router } from "express";
import {assignFoodToBranch,getBranchMenu,updateBranchMenuItem,deleteBranchMenuItem,getRestaurantSelectData,toggleBranchFoodStatus,getFoodAvailabilityAcrossBranches} from "../../controllers/admin/branchemenu";
import { catchAsync } from "../../utils/catchAsync";

const router = Router();
router.get("/select-data", catchAsync(getRestaurantSelectData));
router.post("/", catchAsync(assignFoodToBranch));
router.get("/food-availability/:foodId", catchAsync(getFoodAvailabilityAcrossBranches));
router.get("/:branchId", catchAsync(getBranchMenu));
router.put("/:id", catchAsync(updateBranchMenuItem));
router.patch("/:branchId/food/:foodId/toggle", catchAsync(toggleBranchFoodStatus));
router.delete("/:id", catchAsync(deleteBranchMenuItem));
export default router;