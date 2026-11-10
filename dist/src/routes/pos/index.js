"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticated_1 = require("../../middlewares/authenticated");
const authorized_1 = require("../../middlewares/authorized");
const invalidateCache_1 = require("../../middlewares/invalidateCache");
const auth_1 = __importDefault(require("./auth"));
const shifts_1 = __importDefault(require("./shifts"));
const bundles_1 = __importDefault(require("../admin/bundles"));
const notes_1 = __importDefault(require("./notes"));
const notesItems_1 = __importDefault(require("./notesItems"));
const offers_1 = __importDefault(require("./offers"));
const router = (0, express_1.Router)();
router.use("/auth", auth_1.default);
router.use(authenticated_1.authenticated, (0, authorized_1.authorizeRoles)("owner", "subadmin", "branch_manager", "staff"));
// أضفنا ميدل وير لمسح الكاش تلقائياً عند أي تعديل من الأدمن
router.use(invalidateCache_1.invalidateCache);
// POS Routes
router.use("/shifts", shifts_1.default);
router.use("/bundles", bundles_1.default);
router.use("/notes", notes_1.default);
router.use("/notes-items", notesItems_1.default);
router.use("/offers", offers_1.default);
exports.default = router;
