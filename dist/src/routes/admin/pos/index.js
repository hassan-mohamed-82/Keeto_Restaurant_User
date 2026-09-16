"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticated_1 = require("../../../middlewares/authenticated");
const authorized_1 = require("../../../middlewares/authorized");
const invalidateCache_1 = require("../../../middlewares/invalidateCache");
const auth_1 = __importDefault(require("../../cashier/auth"));
const shifts_1 = __importDefault(require("./shifts"));
const serviceFees_1 = __importDefault(require("./serviceFees"));
const tax_1 = __importDefault(require("./tax"));
const bundles_1 = __importDefault(require("./bundles"));
const taxType_1 = __importDefault(require("./taxType"));
const notes_1 = __importDefault(require("./notes"));
const notesItems_1 = __importDefault(require("./notesItems"));
const offers_1 = __importDefault(require("./offers"));
const suppliers_1 = __importDefault(require("./suppliers"));
const stores_1 = __importDefault(require("./stores"));
const storeMen_1 = __importDefault(require("./storeMen"));
const captainOrders_1 = __importDefault(require("./captainOrders"));
const cashierMen_1 = __importDefault(require("./cashierMen"));
const halls_1 = __importDefault(require("./halls"));
const hallTables_1 = __importDefault(require("./hallTables"));
const router = (0, express_1.Router)();
router.use("/auth", auth_1.default);
// ضفنا الـ Underscore هنا 👇
router.use(authenticated_1.authenticated, (0, authorized_1.authorizeRoles)("owner", "subadmin", "branch_manager", "staff"));
// أضفنا ميدل وير لمسح الكاش تلقائياً عند أي تعديل من الأدمن
router.use(invalidateCache_1.invalidateCache);
// POS Routes
router.use("/shifts", shifts_1.default);
router.use("/service-fees", serviceFees_1.default);
router.use("/service-fees", serviceFees_1.default);
router.use("/taxes", tax_1.default);
router.use("/taxes", tax_1.default);
router.use("/tax", tax_1.default);
router.use("/tax", tax_1.default);
router.use("/bundles", bundles_1.default);
router.use("/bundles", bundles_1.default);
router.use("/tax-type", taxType_1.default);
router.use("/tax-type", taxType_1.default);
router.use("/tax-types", taxType_1.default);
router.use("/tax-types", taxType_1.default);
router.use("/notes", notes_1.default);
router.use("/notes", notes_1.default);
router.use("/notes-items", notesItems_1.default);
router.use("/notes-items", notesItems_1.default);
router.use("/note-items", notesItems_1.default);
router.use("/note-items", notesItems_1.default);
router.use("/offers", offers_1.default);
// Suppliers Routes
router.use("/suppliers", suppliers_1.default);
router.use("/suppliers", suppliers_1.default);
// Stores Routes
router.use("/stores", stores_1.default);
router.use("/stores", stores_1.default);
// Store Men Routes
router.use("/store-men", storeMen_1.default);
router.use("/store-men", storeMen_1.default);
// Captain Orders Routes
router.use("/captain-orders", captainOrders_1.default);
router.use("/captain-orders", captainOrders_1.default);
// Cashier Men Routes
router.use("/cashier-men", cashierMen_1.default);
router.use("/cashier-men", cashierMen_1.default);
// Halls Routes
router.use("/halls", halls_1.default);
router.use("/halls", halls_1.default);
// Hall Tables Routes
router.use("/hall-tables", hallTables_1.default);
router.use("/hall-tables", hallTables_1.default);
exports.default = router;
