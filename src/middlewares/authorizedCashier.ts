// src/middlewares/authorizedCashier.ts

import { Request, Response, NextFunction, RequestHandler } from "express";
import { UnauthorizedError } from "../Errors";

type Role ="cashier";

export const authorizedCashier = (): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new UnauthorizedError("Not authenticated");
    }

    const userRole = (req.user.type || req.user.role) as Role;

    if (userRole !== "cashier") {
      throw new UnauthorizedError("You don't have permission to access this resource");
    }

    next();
  };
};