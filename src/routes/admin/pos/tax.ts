import { Router } from "express";
import { catchAsync } from "../../../utils/catchAsync";
import { validate } from "../../../middlewares/validation";
import {
    createTaxSchema,
    updateTaxSchema,
} from "../../../validation/admin/taxes";
import {
    createTax,
    getAllTaxes,
    getTaxById,
    updateTax,
    deleteTax,
    toggleTaxStatus,
    getTaxListOptions,
    getSubcategories,
    getFoods,
    getBranches,
    getTaxBranches,
    getTaxFoods,
} from "../../../controllers/admin/pos/tax";

const router = Router();

router.post("/", validate(createTaxSchema), catchAsync(createTax));
router.get("/", catchAsync(getAllTaxes));
router.post("/list-taxes", catchAsync(getAllTaxes));
router.get("/options", catchAsync(getTaxListOptions));
router.get("/select-data", catchAsync(getTaxListOptions));
router.get("/list", catchAsync(getTaxListOptions));
router.get("/branches", catchAsync(getBranches));
router.post("/branches", catchAsync(getBranches));
router.get("/:id/branches", catchAsync(getTaxBranches));
router.post("/:id/branches", catchAsync(getTaxBranches));
router.get("/subcategories", catchAsync(getSubcategories));
router.post("/subcategories", catchAsync(getSubcategories));
router.get("/subcategories/:subcategoryId/foods", catchAsync(getFoods));
router.post("/subcategories/:subcategoryId/foods", catchAsync(getFoods));
router.get("/foods", catchAsync(getFoods));
router.post("/foods", catchAsync(getFoods));
router.get("/foods/subcategory/:subcategoryId", catchAsync(getFoods));
router.post("/foods/subcategory/:subcategoryId", catchAsync(getFoods));
router.get("/:id/foods", catchAsync(getTaxFoods));
router.post("/:id/foods", catchAsync(getTaxFoods));
router.get("/:id", catchAsync(getTaxById));
router.put("/:id", validate(updateTaxSchema), catchAsync(updateTax));
router.patch("/:id/toggle-status", catchAsync(toggleTaxStatus));
router.delete("/:id", catchAsync(deleteTax));

export default router;
