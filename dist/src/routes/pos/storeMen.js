"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../../utils/catchAsync");
const validation_1 = require("../../../middlewares/validation");
const storeMen_1 = require("../../../validation/admin/storeMen");
const storeMan_1 = require("../../../controllers/admin/pos/storeMan");
const router = (0, express_1.Router)();
router.post("/", (0, validation_1.validate)(storeMen_1.createStoreManSchema), (0, catchAsync_1.catchAsync)(storeMan_1.createStoreMan));
router.get("/", (0, validation_1.validate)(storeMen_1.storeManQuerySchema, "query"), (0, catchAsync_1.catchAsync)(storeMan_1.getAllStoreMen));
router.post("/list", (0, validation_1.validate)(storeMen_1.storeManQuerySchema, "body"), (0, catchAsync_1.catchAsync)(storeMan_1.getAllStoreMen));
// Stores selection endpoint for StoreMan assignment
router.get("/stores", (0, catchAsync_1.catchAsync)(storeMan_1.getStoresForStoreMan));
router.post("/stores", (0, catchAsync_1.catchAsync)(storeMan_1.getStoresForStoreMan));
router.get("/:id", (0, catchAsync_1.catchAsync)(storeMan_1.getStoreManById));
router.put("/:id", (0, validation_1.validate)(storeMen_1.updateStoreManSchema), (0, catchAsync_1.catchAsync)(storeMan_1.updateStoreMan));
router.patch("/:id/toggle-status", (0, catchAsync_1.catchAsync)(storeMan_1.toggleStoreManStatus));
router.delete("/:id", (0, catchAsync_1.catchAsync)(storeMan_1.deleteStoreMan));
exports.default = router;
