"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticated_1 = require("../../middlewares/authenticated");
const authorizedCashier_1 = require("../../middlewares/authorizedCashier");
const auth_1 = __importDefault(require("./auth"));
const router = (0, express_1.Router)();
router.use("/auth", auth_1.default);
// ضفنا الـ Underscore هنا 👇
router.use(authenticated_1.authenticated, (0, authorizedCashier_1.authorizedCashier)());
router.use("/auth", auth_1.default);
exports.default = router;
