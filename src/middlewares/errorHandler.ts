import { Response, Request, NextFunction, ErrorRequestHandler } from "express";
import { AppError } from "../Errors/appError";
import { StatusCodes } from "http-status-codes";
import Jwt from "jsonwebtoken";
import { IErrorResponse } from "../utils/response";

export const errorHandler: ErrorRequestHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let statusCode: number = StatusCodes.INTERNAL_SERVER_ERROR;
  let message: string = err.message || "Internal Server Error";
  let details: any | undefined = err.message;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err.name === "ZodError") {
    statusCode = 400;
    message = "Validation failed";
    details = err.errors.map((error: any) => ({
      field: error.path.join("."),
      message: error.message,
    }));
  } else if (err instanceof SyntaxError && ("body" in err || (err as any).type === "entity.parse.failed")) {
    statusCode = StatusCodes.BAD_REQUEST;
    message = "Invalid JSON payload in request body. Please verify JSON format (check for trailing commas, unescaped characters, or missing quotes).";
    details = err.message;
  } else if (err instanceof Jwt.JsonWebTokenError) {
    statusCode = 401;
    message = "Invalid token";
  } else if (err instanceof Jwt.TokenExpiredError) {
    statusCode = 401;
    message = "Token expired";
  } else if (err.type === "entity.too.large") {
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
      statusCode = StatusCodes.CONFLICT;
      message = "A record with this information already exists in your restaurant.";
      details = sqlMessage || err.message;
    } else if (sqlCode === "ER_NO_REFERENCED_ROW_2" || sqlCode === "ER_ROW_IS_REFERENCED_2") {
      statusCode = StatusCodes.BAD_REQUEST;
      message = "Database foreign key constraint failed: Referenced record does not exist or has active links.";
      details = sqlMessage || err.message;
    } else if (sqlCode === "ER_NO_DEFAULT_FOR_FIELD" || sqlCode === "ER_BAD_FIELD_ERROR") {
      statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
      message = "Database schema mismatch: Column does not exist or missing required default value in MySQL table.";
      details = sqlMessage || err.message;
    } else if (sqlMessage) {
      details = sqlMessage;
    }
  }

  const response: IErrorResponse = {
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
