"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const appError_1 = require("../Errors/appError");
const http_status_codes_1 = require("http-status-codes");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const errorHandler = (err, req, res, next) => {
    let statusCode = http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR;
    let message = err.message || "Internal Server Error";
    let details = err.message;
    if (err instanceof appError_1.AppError) {
        statusCode = err.statusCode;
        message = err.message;
        details = err.details;
    }
    else if (err.name === "ZodError") {
        statusCode = 400;
        message = "Validation failed";
        details = err.errors.map((error) => ({
            field: error.path.join("."),
            message: error.message,
        }));
    }
    else if (err instanceof SyntaxError && ("body" in err || err.type === "entity.parse.failed")) {
        statusCode = http_status_codes_1.StatusCodes.BAD_REQUEST;
        message = "Invalid JSON payload in request body. Please verify JSON format (check for trailing commas, unescaped characters, or missing quotes).";
        details = err.message;
    }
    else if (err instanceof jsonwebtoken_1.default.JsonWebTokenError) {
        statusCode = 401;
        message = "Invalid token";
    }
    else if (err instanceof jsonwebtoken_1.default.TokenExpiredError) {
        statusCode = 401;
        message = "Token expired";
    }
    else if (err.type === "entity.too.large") {
        statusCode = 413;
        message = "The uploaded image is too large. Please upload a smaller image.";
        details = "Max request size exceeded. Limit is 10MB.";
    }
    // Handle MySQL / Drizzle database errors
    const dbError = err.cause || err;
    const sqlMessage = dbError?.sqlMessage || err?.sqlMessage;
    const sqlCode = dbError?.code || err?.code;
    if (sqlCode || sqlMessage) {
        if (sqlCode === "ER_DUP_ENTRY") {
            statusCode = http_status_codes_1.StatusCodes.CONFLICT;
            message = "A record with this information already exists in your restaurant.";
            details = sqlMessage || err.message;
        }
        else if (sqlCode === "ER_NO_REFERENCED_ROW_2" || sqlCode === "ER_ROW_IS_REFERENCED_2") {
            statusCode = http_status_codes_1.StatusCodes.BAD_REQUEST;
            message = "Database foreign key constraint failed: Referenced record does not exist or has active links.";
            details = sqlMessage || err.message;
        }
        else if (sqlCode === "ER_NO_DEFAULT_FOR_FIELD" || sqlCode === "ER_BAD_FIELD_ERROR") {
            statusCode = http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR;
            message = "Database schema mismatch: Column does not exist or missing required default value in MySQL table.";
            details = sqlMessage || err.message;
        }
        else if (sqlMessage) {
            details = sqlMessage;
        }
    }
    const response = {
        success: false,
        error: {
            code: statusCode,
            message: message,
            details: details,
        },
    };
    if (statusCode >= 500) {
        console.error(`[${new Date().toISOString()}] ${err.stack || err}`);
        if (err.cause) {
            console.error("Database Cause:", err.cause);
        }
        console.log(response);
    }
    res.status(statusCode).json(response);
};
exports.errorHandler = errorHandler;
