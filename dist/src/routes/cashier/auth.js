"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../../controllers/cashier/auth");
const router = (0, express_1.Router)();
router.post("/login", auth_1.login_cashier);
exports.default = router;
