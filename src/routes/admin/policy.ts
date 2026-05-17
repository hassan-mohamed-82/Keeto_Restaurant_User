import { Router } from "express";
import { createRestaurantPolicy, deleteRestaurantPolicy, getRestaurantPolicies 
    , updateRestaurantPolicy, getRestaurantPolicyById} from "../../controllers/admin/policy";
import { catchAsync } from "../../utils/catchAsync";
const router = Router();

router.post("/",catchAsync(createRestaurantPolicy));
router.put("/:id", catchAsync(updateRestaurantPolicy));
router.delete("/:id", catchAsync(deleteRestaurantPolicy));
router.get("/", catchAsync(getRestaurantPolicies));
router.get("/:id", catchAsync(getRestaurantPolicyById));
export default router;