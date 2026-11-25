import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { validate } from "../../middlewares/validation";
import { createTaxSchema, updateTaxSchema } from "../../validation/admin/tax";
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
} from "../../controllers/admin/tax";

const router = Router();

// One route per controller (filters go in the query string)
router.get("/options", catchAsync(getTaxListOptions));
router.get("/branches", catchAsync(getBranches));           // ?taxId=
router.get("/subcategories", catchAsync(getSubcategories));
router.get("/foods", catchAsync(getFoods));                 // ?taxId=&subcategoryId=

router.post("/", validate(createTaxSchema), catchAsync(createTax));
router.get("/", catchAsync(getAllTaxes));                   // ?status=&source=&taxType=&modules=&moduleType=&search=&page=&limit=&all=
router.get("/:id", catchAsync(getTaxById));
router.put("/:id", validate(updateTaxSchema), catchAsync(updateTax));
router.patch("/:id/toggle-status", catchAsync(toggleTaxStatus));
router.delete("/:id", catchAsync(deleteTax));

export default router;
