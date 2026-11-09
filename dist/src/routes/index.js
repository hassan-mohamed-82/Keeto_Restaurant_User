"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const index_1 = __importDefault(require("./admin/index"));
const index_2 = __importDefault(require("./pos/index"));
const index_3 = __importDefault(require("./delivery_man/index"));
const resolveDomain_1 = __importDefault(require("./resolveDomain"));
const route = (0, express_1.Router)();
// Public: no auth required — resolves custom domain → restaurant slug
route.use('/resolve-domain', resolveDomain_1.default);
route.use('/restaurant', index_1.default);
route.use('/pos', index_2.default);
route.use('/delivery_man', index_3.default);
exports.default = route;
