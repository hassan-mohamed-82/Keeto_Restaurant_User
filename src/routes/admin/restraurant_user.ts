import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { getRestaurantUsers, updateRestaurantUser,deleteRestaurantUser,getRestaurantUserById } from "../../controllers/admin/restraurant_user";

const router = Router();

router.get("/", catchAsync(getRestaurantUsers));
router.put("/:id", catchAsync(updateRestaurantUser));
router.delete("/:id", catchAsync(deleteRestaurantUser));
router.get("/:id", catchAsync(getRestaurantUserById));

export default router;
