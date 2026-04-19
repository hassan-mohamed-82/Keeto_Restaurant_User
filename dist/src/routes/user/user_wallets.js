"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const userWallets_1 = require("../../controllers/user/userWallets");
const router = (0, express_1.Router)();
router.post("/add-fund", (0, catchAsync_1.catchAsync)(userWallets_1.addFundToWallet));
router.get("/history", (0, catchAsync_1.catchAsync)(userWallets_1.getWalletHistory));
exports.default = router;
