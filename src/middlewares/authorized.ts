// src/middlewares/authorizeRoles.ts

import { Request, Response, NextFunction, RequestHandler } from "express";
import { UnauthorizedError } from "../Errors";

// 🔄 1. إضافة الأدوار الجديدة "owner" و "staff" هنا لتتعرف عليها الـ TypeScript
type Role = "subadmin" | "branch_manager" | "owner" | "staff";

export const authorizeRoles = (...roles: Role[]): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new UnauthorizedError("Not authenticated");
    }

    // 🔄 2. تأمين الفحص: نقرأ الرتبة سواء كانت مخزنة في الـ Token باسم type أو role
    const userRole = (req.user.type || req.user.role) as Role;

    if (!roles.includes(userRole)) {
      throw new UnauthorizedError("You don't have permission to access this resource");
    }

    next();
  };
};