import { Request, Response, NextFunction } from "express";
import { db } from "../models/connection";
import { restrauntadmin, rolesadmin } from "../models/schema";
import { eq } from "drizzle-orm";
import { UnauthorizedError } from "../Errors";
import { ForbiddenError } from "../Errors/forbiddenError";
import { ModuleName, ActionName, Permission } from "../types/custom";

/**
 * Middleware للتحقق من الصلاحيات (Permissions)
 * 
 * القواعد:
 * 1. Owner: له صلاحية الوصول لكل شيء في المطعم
 * 2. Branch Manager: له صلاحية الوصول لكل شيء في فرعه فقط
 * 3. Subadmin/Staff: يتم التحقق من الـ roleId والـ permissions
 * 
 * @param module - اسم الـ module (مثل: "foods", "orders", "users")
 * @param action - نوع العملية (مثل: "create", "read", "update", "delete")
 * @param checkBranch - هل نتحقق من الفرع؟ (default: false)
 */
export const hasPermission = (
    module: ModuleName,
    action: ActionName,
    checkBranch: boolean = false
) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!req.user) {
                throw new UnauthorizedError("Not authenticated");
            }

            const userId = req.user.id;
            const userType = req.user.type;
            const userBranchId = req.user.branchId;

            // ==========================================
            // 1. Owner: له صلاحية الوصول لكل شيء
            // ==========================================
            if (userType === "owner") {
                return next();
            }

            // ==========================================
            // 2. Branch Manager: له صلاحية الوصول لكل شيء في فرعه
            // ==========================================
            if (userType === "branch_manager") {
                // لو محتاجين نتحقق من الفرع
                if (checkBranch) {
                    const requestedBranchId = req.body.branchId || req.params.branchId || req.query.branchId;
                    
                    if (!userBranchId) {
                        throw new ForbiddenError("Branch manager must be assigned to a branch");
                    }

                    if (requestedBranchId && requestedBranchId !== userBranchId) {
                        throw new ForbiddenError("You can only access resources in your branch");
                    }
                }
                
                return next();
            }

            // ==========================================
            // 3. Subadmin/Staff: نتحقق من الـ roleId والـ permissions
            // ==========================================
            if (userType === "subadmin" || userType === "staff") {
                // جلب بيانات الـ admin
                const [admin] = await db
                    .select()
                    .from(restrauntadmin)
                    .where(eq(restrauntadmin.id, userId))
                    .limit(1);

                if (!admin) {
                    throw new UnauthorizedError("Admin not found");
                }

                // التحقق من الفرع (لو مطلوب)
                if (checkBranch && admin.branchId) {
                    const requestedBranchId = req.body.branchId || req.params.branchId || req.query.branchId;
                    
                    if (requestedBranchId && requestedBranchId !== admin.branchId) {
                        throw new ForbiddenError("You can only access resources in your branch");
                    }
                }

                // جمع كل الصلاحيات (من الـ role + الصلاحيات المخصصة)
                let allPermissions: Permission[] = [];

                // أ. الصلاحيات من الـ Role
                if (admin.roleId) {
                    const [role] = await db
                        .select()
                        .from(rolesadmin)
                        .where(eq(rolesadmin.id, admin.roleId))
                        .limit(1);

                    if (role && role.permissions) {
                        allPermissions = [...allPermissions, ...(role.permissions as Permission[])];
                    }
                }

                // ب. الصلاحيات المخصصة (Custom Permissions)
                if (admin.permissions && Array.isArray(admin.permissions)) {
                    allPermissions = [...allPermissions, ...(admin.permissions as Permission[])];
                }

                // التحقق من وجود الصلاحية المطلوبة
                const hasRequiredPermission = allPermissions.some(permission => {
                    if (permission.module !== module) return false;
                    
                    return permission.actions.some(a => a.action === action);
                });

                if (!hasRequiredPermission) {
                    throw new ForbiddenError(
                        `You don't have permission to ${action} ${module}`
                    );
                }

                return next();
            }

            // ==========================================
            // 4. نوع مستخدم غير معروف
            // ==========================================
            throw new ForbiddenError("Invalid user type");

        } catch (error) {
            next(error);
        }
    };
};

/**
 * Middleware للتحقق من صلاحيات متعددة (OR logic)
 * يسمح بالوصول إذا كان المستخدم لديه أي من الصلاحيات المطلوبة
 * 
 * @param permissions - مصفوفة من الصلاحيات المطلوبة
 * @param checkBranch - هل نتحقق من الفرع؟
 */
export const hasAnyPermission = (
    permissions: Array<{ module: ModuleName; action: ActionName }>,
    checkBranch: boolean = false
) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!req.user) {
                throw new UnauthorizedError("Not authenticated");
            }

            const userId = req.user.id;
            const userType = req.user.type;
            const userBranchId = req.user.branchId;

            // Owner: له صلاحية الوصول لكل شيء
            if (userType === "owner") {
                return next();
            }

            // Branch Manager: له صلاحية الوصول لكل شيء في فرعه
            if (userType === "branch_manager") {
                if (checkBranch) {
                    const requestedBranchId = req.body.branchId || req.params.branchId || req.query.branchId;
                    
                    if (!userBranchId) {
                        throw new ForbiddenError("Branch manager must be assigned to a branch");
                    }

                    if (requestedBranchId && requestedBranchId !== userBranchId) {
                        throw new ForbiddenError("You can only access resources in your branch");
                    }
                }
                
                return next();
            }

            // Subadmin/Staff: نتحقق من الصلاحيات
            if (userType === "subadmin" || userType === "staff") {
                const [admin] = await db
                    .select()
                    .from(restrauntadmin)
                    .where(eq(restrauntadmin.id, userId))
                    .limit(1);

                if (!admin) {
                    throw new UnauthorizedError("Admin not found");
                }

                // التحقق من الفرع
                if (checkBranch && admin.branchId) {
                    const requestedBranchId = req.body.branchId || req.params.branchId || req.query.branchId;
                    
                    if (requestedBranchId && requestedBranchId !== admin.branchId) {
                        throw new ForbiddenError("You can only access resources in your branch");
                    }
                }

                // جمع كل الصلاحيات
                let allPermissions: Permission[] = [];

                if (admin.roleId) {
                    const [role] = await db
                        .select()
                        .from(rolesadmin)
                        .where(eq(rolesadmin.id, admin.roleId))
                        .limit(1);

                    if (role && role.permissions) {
                        allPermissions = [...allPermissions, ...(role.permissions as Permission[])];
                    }
                }

                if (admin.permissions && Array.isArray(admin.permissions)) {
                    allPermissions = [...allPermissions, ...(admin.permissions as Permission[])];
                }

                // التحقق من وجود أي من الصلاحيات المطلوبة
                const hasAnyRequiredPermission = permissions.some(({ module, action }) => {
                    return allPermissions.some(permission => {
                        if (permission.module !== module) return false;
                        return permission.actions.some(a => a.action === action);
                    });
                });

                if (!hasAnyRequiredPermission) {
                    throw new ForbiddenError("You don't have the required permissions");
                }

                return next();
            }

            throw new ForbiddenError("Invalid user type");

        } catch (error) {
            next(error);
        }
    };
};

/**
 * Middleware للتحقق من صلاحيات متعددة (AND logic)
 * يسمح بالوصول فقط إذا كان المستخدم لديه كل الصلاحيات المطلوبة
 * 
 * @param permissions - مصفوفة من الصلاحيات المطلوبة
 * @param checkBranch - هل نتحقق من الفرع؟
 */
export const hasAllPermissions = (
    permissions: Array<{ module: ModuleName; action: ActionName }>,
    checkBranch: boolean = false
) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!req.user) {
                throw new UnauthorizedError("Not authenticated");
            }

            const userId = req.user.id;
            const userType = req.user.type;
            const userBranchId = req.user.branchId;

            // Owner: له صلاحية الوصول لكل شيء
            if (userType === "owner") {
                return next();
            }

            // Branch Manager: له صلاحية الوصول لكل شيء في فرعه
            if (userType === "branch_manager") {
                if (checkBranch) {
                    const requestedBranchId = req.body.branchId || req.params.branchId || req.query.branchId;
                    
                    if (!userBranchId) {
                        throw new ForbiddenError("Branch manager must be assigned to a branch");
                    }

                    if (requestedBranchId && requestedBranchId !== userBranchId) {
                        throw new ForbiddenError("You can only access resources in your branch");
                    }
                }
                
                return next();
            }

            // Subadmin/Staff: نتحقق من الصلاحيات
            if (userType === "subadmin" || userType === "staff") {
                const [admin] = await db
                    .select()
                    .from(restrauntadmin)
                    .where(eq(restrauntadmin.id, userId))
                    .limit(1);

                if (!admin) {
                    throw new UnauthorizedError("Admin not found");
                }

                // التحقق من الفرع
                if (checkBranch && admin.branchId) {
                    const requestedBranchId = req.body.branchId || req.params.branchId || req.query.branchId;
                    
                    if (requestedBranchId && requestedBranchId !== admin.branchId) {
                        throw new ForbiddenError("You can only access resources in your branch");
                    }
                }

                // جمع كل الصلاحيات
                let allPermissions: Permission[] = [];

                if (admin.roleId) {
                    const [role] = await db
                        .select()
                        .from(rolesadmin)
                        .where(eq(rolesadmin.id, admin.roleId))
                        .limit(1);

                    if (role && role.permissions) {
                        allPermissions = [...allPermissions, ...(role.permissions as Permission[])];
                    }
                }

                if (admin.permissions && Array.isArray(admin.permissions)) {
                    allPermissions = [...allPermissions, ...(admin.permissions as Permission[])];
                }

                // التحقق من وجود كل الصلاحيات المطلوبة
                const hasAllRequiredPermissions = permissions.every(({ module, action }) => {
                    return allPermissions.some(permission => {
                        if (permission.module !== module) return false;
                        return permission.actions.some(a => a.action === action);
                    });
                });

                if (!hasAllRequiredPermissions) {
                    throw new ForbiddenError("You don't have all the required permissions");
                }

                return next();
            }

            throw new ForbiddenError("Invalid user type");

        } catch (error) {
            next(error);
        }
    };
};

/**
 * Helper function للتحقق من الصلاحيات في الـ Controllers
 * (للاستخدام خارج الـ middleware)
 */
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

    // Owner: له كل الصلاحيات
    if (admin.type === "owner") return true;

    // Branch Manager: له كل الصلاحيات في فرعه
    if (admin.type === "branch_manager") return true;

    // جمع الصلاحيات
    let allPermissions: Permission[] = [];

    if (admin.roleId) {
        const [role] = await db
            .select()
            .from(rolesadmin)
            .where(eq(rolesadmin.id, admin.roleId))
            .limit(1);

        if (role && role.permissions) {
            allPermissions = [...allPermissions, ...(role.permissions as Permission[])];
        }
    }

    if (admin.permissions && Array.isArray(admin.permissions)) {
        allPermissions = [...allPermissions, ...(admin.permissions as Permission[])];
    }

    // التحقق من الصلاحية
    return allPermissions.some(permission => {
        if (permission.module !== module) return false;
        return permission.actions.some(a => a.action === action);
    });
};
