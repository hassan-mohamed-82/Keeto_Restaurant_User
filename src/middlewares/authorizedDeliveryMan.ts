// src/middlewares/authorizedDeliveryMan.ts

import { Request, Response, NextFunction, RequestHandler } from "express";
import { UnauthorizedError } from "../Errors";

export const authorizedDeliveryMan = (): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new UnauthorizedError("Not authenticated");
    }

    const userRole = req.user.type || req.user.role;

    if (userRole !== "delivery_man") {
      throw new UnauthorizedError("You don't have permission to access this resource");
    }

    next();
  };
};
