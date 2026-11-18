"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadExcelFile = exports.excelUpload = exports.EXCEL_FIELD_NAME = exports.EXCEL_MAX_FILE_SIZE = exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const BadRequest_1 = require("../Errors/BadRequest");
// Configure multer storage
const storage = multer_1.default.memoryStorage();
// File filter for images
const fileFilter = (req, file, cb) => {
    // Accept images only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
        return cb(new BadRequest_1.BadRequest('Only image files are allowed!'));
    }
    cb(null, true);
};
exports.upload = (0, multer_1.default)({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
});
// ==========================================
// Excel (.xlsx) upload for the bulk menu import
// ==========================================
exports.EXCEL_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
exports.EXCEL_FIELD_NAME = 'file';
const excelFileFilter = (req, file, cb) => {
    if (!/\.xlsx$/i.test(file.originalname)) {
        return cb(new BadRequest_1.BadRequest('Only .xlsx files are allowed'));
    }
    cb(null, true);
};
exports.excelUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    fileFilter: excelFileFilter,
    limits: {
        fileSize: exports.EXCEL_MAX_FILE_SIZE,
        files: 1,
    },
});
/** Accepts one .xlsx file in the "file" field and turns multer errors into 400 responses. */
const uploadExcelFile = (req, res, next) => {
    exports.excelUpload.single(exports.EXCEL_FIELD_NAME)(req, res, (err) => {
        if (err instanceof multer_1.default.MulterError) {
            const message = err.code === 'LIMIT_FILE_SIZE'
                ? 'File too large. The maximum size is 5 MB'
                : err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT'
                    ? `Upload exactly one .xlsx file in the "${exports.EXCEL_FIELD_NAME}" field`
                    : err.message;
            return next(new BadRequest_1.BadRequest(message));
        }
        next(err);
    });
};
exports.uploadExcelFile = uploadExcelFile;
