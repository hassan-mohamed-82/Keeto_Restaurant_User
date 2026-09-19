"use strict";
// import { Request, Response, NextFunction } from "express";
// import { db } from "../models/connection";
// import { restrauntadmin } from "../models/schema";
// import { role_restaurant } from "../models/schema/admin/role_restaurant";
// import { eq } from "drizzle-orm";
// import { UnauthorizedError } from "../Errors";
// import { ForbiddenError } from "../Errors/forbiddenError";
// import { ModuleName, ActionName, Permission } from "../types/custom";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkUserPermission = exports.hasAllPermissions = exports.hasAnyPermission = exports.hasPermission = void 0;
const connection_1 = require("../models/connection");
const schema_1 = require("../models/schema");
const role_restaurant_1 = require("../models/schema/admin/role_restaurant");
const drizzle_orm_1 = require("drizzle-orm");
const Errors_1 = require("../Errors");
const forbiddenError_1 = require("../Errors/forbiddenError");
// ==========================================
// Helpers
// ==========================================
const parsePermissions = (permissions) => {
    if (!permissions)
        return [];
    try {
        if (Array.isArray(permissions))
            return permissions;
        if (typeof permissions === "string") {
            let parsed = JSON.parse(permissions);
            // لو متخزنة كنص مزدوج التشفير
            if (typeof parsed === "string")
                parsed = JSON.parse(parsed);
            return Array.isArray(parsed) ? parsed : [];
        }
        return [];
    }
    catch {
        return [];
    }
};
// أسماء الـ modules البديلة (order / orders)
const MODULE_ALIASES = {
    orders: ["orders", "order"],
    order: ["orders", "order"],
};
// الأسماء اللي بيحفظها الفرونت (View/Add/Edit/...) مقابل الأسماء اللي في الـ routes
const ACTION_ALIASES = {
    read: ["read", "view"],
    create: ["create", "add"],
    update: ["update", "edit"],
    status: ["status"],
    delete: ["delete"],
    filter: ["filter"],
};
const actionName = (a) => ((typeof a === "string" ? a : a?.action) || "").toLowerCase();
const matchesPermission = (allPermissions, module, action) => {
    const moduleNames = MODULE_ALIASES[module] ?? [module];
    const wanted = ACTION_ALIASES[action.toLowerCase()] ?? [action.toLowerCase()];
    return allPermissions.some(permission => {
        if (!moduleNames.includes(permission.module))
            return false;
        return (permission.actions || []).some(a => wanted.includes(actionName(a)));
    });
};
// جلب صلاحيات الـ role + الصلاحيات المخصصة
const loadPermissions = async (admin) => {
    let all = [];
    if (admin.roleId) {
        const [role] = await connection_1.db
            .select()
            .from(role_restaurant_1.role_restaurant)
            .where((0, drizzle_orm_1.eq)(role_restaurant_1.role_restaurant.id, admin.roleId))
            .limit(1);
        if (role?.permissions)
            all = [...all, ...parsePermissions(role.permissions)];
    }
    if (admin.permissions)
        all = [...all, ...parsePermissions(admin.permissions)];
    return all;
};
// أنواع المستخدمين اللي بتتفحص صلاحياتها من الـ role
const isRoleBasedType = (type) => type === "subadmin" || type === "staff" || type === "cashier";
const getRequestedBranchId = (req) => req.body?.branchId || req.params?.branchId || req.query?.branchId;
/**
 * المنطق المشترك للـ 3 middlewares:
 * - owner: كل شيء
 * - branch_manager: كل شيء في فرعه فقط (لو checkBranch)
 * - subadmin/staff/cashier: حسب الـ role + الصلاحيات المخصصة
 */
const authorize = async (req, checkBranch, check, errorMessage) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Not authenticated");
    const { id: userId, type: userType, branchId: userBranchId } = req.user;
    // 1. Owner
    if (userType === "owner")
        return;
    // 2. Branch Manager
    if (userType === "branch_manager") {
        if (checkBranch) {
            const requestedBranchId = getRequestedBranchId(req);
            if (!userBranchId) {
                throw new forbiddenError_1.ForbiddenError("Branch manager must be assigned to a branch");
            }
            if (requestedBranchId && requestedBranchId !== userBranchId) {
                throw new forbiddenError_1.ForbiddenError("You can only access resources in your branch");
            }
        }
        return;
    }
    // 3. Subadmin / Staff / Cashier
    if (isRoleBasedType(userType)) {
        const [admin] = await connection_1.db
            .select()
            .from(schema_1.restrauntadmin)
            .where((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.id, userId))
            .limit(1);
        if (!admin)
            throw new Errors_1.UnauthorizedError("Admin not found");
        if (checkBranch && admin.branchId) {
            const requestedBranchId = getRequestedBranchId(req);
            if (requestedBranchId && requestedBranchId !== admin.branchId) {
                throw new forbiddenError_1.ForbiddenError("You can only access resources in your branch");
            }
        }
        const allPermissions = await loadPermissions(admin);
        if (!check(allPermissions))
            throw new forbiddenError_1.ForbiddenError(errorMessage);
        return;
    }
    // 4. نوع غير معروف
    throw new forbiddenError_1.ForbiddenError("Invalid user type");
};
// ==========================================
// hasPermission
// ==========================================
const hasPermission = (module, action, checkBranch = false) => {
    return async (req, res, next) => {
        try {
            await authorize(req, checkBranch, perms => matchesPermission(perms, module, action), `You don't have permission to ${action} ${module}`);
            next();
        }
        catch (error) {
            next(error);
        }
    };
};
exports.hasPermission = hasPermission;
// ==========================================
// hasAnyPermission (OR)
// ==========================================
const hasAnyPermission = (permissions, checkBranch = false) => {
    return async (req, res, next) => {
        try {
            await authorize(req, checkBranch, perms => permissions.some(p => matchesPermission(perms, p.module, p.action)), "You don't have the required permissions");
            next();
        }
        catch (error) {
            next(error);
        }
    };
};
exports.hasAnyPermission = hasAnyPermission;
// ==========================================
// hasAllPermissions (AND)
// ==========================================
const hasAllPermissions = (permissions, checkBranch = false) => {
    return async (req, res, next) => {
        try {
            await authorize(req, checkBranch, perms => permissions.every(p => matchesPermission(perms, p.module, p.action)), "You don't have all the required permissions");
            next();
        }
        catch (error) {
            next(error);
        }
    };
};
exports.hasAllPermissions = hasAllPermissions;
// ==========================================
// checkUserPermission (للاستخدام داخل الـ Controllers، بترجع boolean)
// ==========================================
const checkUserPermission = async (userId, module, action) => {
    const [admin] = await connection_1.db
        .select()
        .from(schema_1.restrauntadmin)
        .where((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.id, userId))
        .limit(1);
    if (!admin)
        return false;
    if (admin.type === "owner")
        return true;
    if (admin.type === "branch_manager")
        return true;
    const allPermissions = await loadPermissions(admin);
    return matchesPermission(allPermissions, module, action);
};
exports.checkUserPermission = checkUserPermission;
