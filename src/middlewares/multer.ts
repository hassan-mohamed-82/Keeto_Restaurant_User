
import multer from 'multer';
import { Request, RequestHandler } from 'express';
import { BadRequest } from '../Errors/BadRequest';

// Configure multer storage
const storage = multer.memoryStorage();

// File filter for images
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    // Accept images only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
        return cb(new BadRequest('Only image files are allowed!'));
    }
    cb(null, true);
};

export const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
});

// ==========================================
// Excel (.xlsx) upload for the bulk menu import
// ==========================================
export const EXCEL_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const EXCEL_FIELD_NAME = 'file';

const excelFileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (!/\.xlsx$/i.test(file.originalname)) {
        return cb(new BadRequest('Only .xlsx files are allowed'));
    }
    cb(null, true);
};

export const excelUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter: excelFileFilter,
    limits: {
        fileSize: EXCEL_MAX_FILE_SIZE,
        files: 1,
    },
});

/** Accepts one .xlsx file in the "file" field and turns multer errors into 400 responses. */
export const uploadExcelFile: RequestHandler = (req, res, next) => {
    excelUpload.single(EXCEL_FIELD_NAME)(req, res, (err?: unknown) => {
        if (err instanceof multer.MulterError) {
            const message =
                err.code === 'LIMIT_FILE_SIZE'
                    ? 'File too large. The maximum size is 5 MB'
                    : err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT'
                        ? `Upload exactly one .xlsx file in the "${EXCEL_FIELD_NAME}" field`
                        : err.message;
            return next(new BadRequest(message));
        }
        next(err);
    });
};
