"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../../utils/catchAsync");
const validation_1 = require("../../../middlewares/validation");
const stores_1 = require("../../validation/admin/stores");
const store_1 = require("../../controllers/admin/pos/store");
const router = (0, express_1.Router)();
router.post("/", (0, validation_1.validate)(stores_1.createStoreSchema), (0, catchAsync_1.catchAsync)(store_1.createStore));
router.get("/", (0, validation_1.validate)(stores_1.storeQuerySchema, "query"), (0, catchAsync_1.catchAsync)(store_1.getAllStores));
router.post("/list", (0, validation_1.validate)(stores_1.storeQuerySchema, "body"), (0, catchAsync_1.catchAsync)(store_1.getAllStores));
// Dropdown selection endpoint
router.get("/selection", (0, catchAsync_1.catchAsync)(store_1.getBranchForSelection));
router.post("/selection", (0, catchAsync_1.catchAsync)(store_1.getBranchForSelection));
router.get("/:id", (0, catchAsync_1.catchAsync)(store_1.getStoreById));
router.put("/:id", (0, validation_1.validate)(stores_1.updateStoreSchema), (0, catchAsync_1.catchAsync)(store_1.updateStore));
router.patch("/:id/toggle-status", (0, catchAsync_1.catchAsync)(store_1.toggleStoreStatus));
router.delete("/:id", (0, catchAsync_1.catchAsync)(store_1.deleteStore));
exports.default = router;
