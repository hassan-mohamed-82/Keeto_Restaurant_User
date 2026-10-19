import { Request, Response, NextFunction } from "express";
import { db } from "../models/connection";
import { restrauntadmin } from "../models/schema";
import { role_restaurant } from "../models/schema/admin/role_restaurant";
import { eq } from "drizzle-orm";
import { UnauthorizedError } from "../Errors";
import { ForbiddenError } from "../Errors/forbiddenError";
import { ModuleName, ActionName, Permission } from "../types/custom";

// ==========================================
// Helpers
// ==========================================
const parsePermissions = (permissions: any): Permission[] => {
    if (!permissions) return [];
    try {
        if (Array.isArray(permissions)) return permissions;
        if (typeof permissions === "string") {
            let parsed = JSON.parse(permissions);
            // لو متخزنة كنص مزدوج التشفير
            if (typeof parsed === "string") parsed = JSON.parse(parsed);
            return Array.isArray(parsed) ? parsed : [];
        }
        return [];
    } catch {
        return [];
    }
};

// أسماء الـ modules البديلة (order / orders)
const MODULE_ALIASES: Record<string, string[]> = {
    orders: ["orders", "order"],
    order: ["orders", "order"],
};

// الأسماء اللي بيحفظها الفرونت (View/Add/Edit/...) مقابل الأسماء اللي في الـ routes
const ACTION_ALIASES: Record<string, string[]> = {
    read: ["read", "view"],
    create: ["create", "add"],
    update: ["update", "edit"],
    status: ["status"],
    delete: ["delete"],
    filter: ["filter"],
};

const actionName = (a: any): string =>
    ((typeof a === "string" ? a : a?.action) || "").toLowerCase();

const matchesPermission = (
    allPermissions: Permission[],
    module: ModuleName,
    action: ActionName
): boolean => {
    const moduleNames = MODULE_ALIASES[module] ?? [module];
    const wanted = ACTION_ALIASES[action.toLowerCase()] ?? [action.toLowerCase()];

    return allPermissions.some(permission => {
        if (!moduleNames.includes(permission.module)) return false;
        return (permission.actions || []).some(a => wanted.includes(actionName(a)));
    });
};

// جلب صلاحيات الـ role + الصلاحيات المخصصة
const loadPermissions = async (admin: any): Promise<Permission[]> => {
    let all: Permission[] = [];

    if (admin.roleId) {
        const [role] = await db
            .select()
            .from(role_restaurant)
            .where(eq(role_restaurant.id, admin.roleId))
            .limit(1);

        if (role?.permissions) all = [...all, ...parsePermissions(role.permissions)];
    }

    if (admin.permissions) all = [...all, ...parsePermissions(admin.permissions)];

    return all;
};

// أنواع المستخدمين اللي بتتفحص صلاحياتها من الـ role
const isRoleBasedType = (type?: string) =>
    type === "subadmin" || type === "staff" || type === "cashier";

const getRequestedBranchId = (req: Request): string | undefined =>
    req.body?.branchId || req.params?.branchId || (req.query?.branchId as string | undefined);

/**
 * المنطق المشترك للـ 3 middlewares:
 * - owner: كل شيء
 * - branch_manager: كل شيء في فرعه فقط (لو checkBranch)
 * - subadmin/staff/cashier: حسب الـ role + الصلاحيات المخصصة
 */
const authorize = async (
    req: Request,
    checkBranch: boolean,
    check: (perms: Permission[]) => boolean,
    errorMessage: string
): Promise<void> => {
    if (!req.user) throw new UnauthorizedError("Not authenticated");

    const { id: userId, type: userType, branchId: userBranchId } = req.user;

    // 1. Owner
    if (userType === "owner") return;

    // 2. Branch Manager
    if (userType === "branch_manager") {
        if (checkBranch) {
            const requestedBranchId = getRequestedBranchId(req);

            if (!userBranchId) {
                throw new ForbiddenError("Branch manager must be assigned to a branch");
            }
            if (requestedBranchId && requestedBranchId !== userBranchId) {
                throw new ForbiddenError("You can only access resources in your branch");
            }
        }
        return;
    }

    // 3. Subadmin / Staff / Cashier
    if (isRoleBasedType(userType)) {
        const [admin] = await db
            .select()
            .from(restrauntadmin)
            .where(eq(restrauntadmin.id, userId))
            .limit(1);

        if (!admin) throw new UnauthorizedError("Admin not found");

        if (checkBranch && admin.branchId) {
            const requestedBranchId = getRequestedBranchId(req);
            if (requestedBranchId && requestedBranchId !== admin.branchId) {
                throw new ForbiddenError("You can only access resources in your branch");
            }
        }

        const allPermissions = await loadPermissions(admin);

        if (!check(allPermissions)) throw new ForbiddenError(errorMessage);
        return;
    }

    // 4. نوع غير معروف
    throw new ForbiddenError("Invalid user type");
};

// ==========================================
// hasPermission
// ==========================================
export const hasPermission = (
    module: ModuleName,
    action: ActionName,
    checkBranch: boolean = false
) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            await authorize(
                req,
                checkBranch,
                perms => matchesPermission(perms, module, action),
                `You don't have permission to ${action} ${module}`
            );
            next();
        } catch (error) {
            next(error);
        }
    };
};

// ==========================================
// hasAnyPermission (OR)
// ==========================================
export const hasAnyPermission = (
    permissions: Array<{ module: ModuleName; action: ActionName }>,
    checkBranch: boolean = false
) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            await authorize(
                req,
                checkBranch,
                perms => permissions.some(p => matchesPermission(perms, p.module, p.action)),
                "You don't have the required permissions"
            );
            next();
        } catch (error) {
            next(error);
        }
    };
};

// ==========================================
// hasAllPermissions (AND)
// ==========================================
export const hasAllPermissions = (
    permissions: Array<{ module: ModuleName; action: ActionName }>,
    checkBranch: boolean = false
) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            await authorize(
                req,
                checkBranch,
                perms => permissions.every(p => matchesPermission(perms, p.module, p.action)),
                "You don't have all the required permissions"
            );
            next();
        } catch (error) {
            next(error);
        }
    };
};

// ==========================================
// checkUserPermission (للاستخدام داخل الـ Controllers، بترجع boolean)
// ==========================================
export const checkUserPermission = async (
    userId: string,
    module: ModuleName,
    action: ActionName
): Promise<boolean> => {
    const [admin] = await db
        .select()
        .from(restrauntadmin)
        .where(eq(restrauntadmin.id, userId))
        .limit(1);

    if (!admin) return false;

    if (admin.type === "owner") return true;
    if (admin.type === "branch_manager") return true;

    const allPermissions = await loadPermissions(admin);
    return matchesPermission(allPermissions, module, action);
};