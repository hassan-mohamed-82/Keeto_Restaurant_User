"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkUserPermission = exports.hasAllPermissions = exports.hasAnyPermission = exports.hasPermission = void 0;
const connection_1 = require("../models/connection");
const schema_1 = require("../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const Errors_1 = require("../Errors");
const forbiddenError_1 = require("../Errors/forbiddenError");
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
const hasPermission = (module, action, checkBranch = false) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                throw new Errors_1.UnauthorizedError("Not authenticated");
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
                        throw new forbiddenError_1.ForbiddenError("Branch manager must be assigned to a branch");
                    }
                    if (requestedBranchId && requestedBranchId !== userBranchId) {
                        throw new forbiddenError_1.ForbiddenError("You can only access resources in your branch");
                    }
                }
                return next();
            }
            // ==========================================
            // 3. Subadmin/Staff: نتحقق من الـ roleId والـ permissions
            // ==========================================
            if (userType === "subadmin" || userType === "staff") {
                // جلب بيانات الـ admin
                const [admin] = await connection_1.db
                    .select()
                    .from(schema_1.restrauntadmin)
                    .where((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.id, userId))
                    .limit(1);
                if (!admin) {
                    throw new Errors_1.UnauthorizedError("Admin not found");
                }
                // التحقق من الفرع (لو مطلوب)
                if (checkBranch && admin.branchId) {
                    const requestedBranchId = req.body.branchId || req.params.branchId || req.query.branchId;
                    if (requestedBranchId && requestedBranchId !== admin.branchId) {
                        throw new forbiddenError_1.ForbiddenError("You can only access resources in your branch");
                    }
                }
                // جمع كل الصلاحيات (من الـ role + الصلاحيات المخصصة)
                let allPermissions = [];
                // أ. الصلاحيات من الـ Role
                if (admin.roleId) {
                    const [role] = await connection_1.db
                        .select()
                        .from(schema_1.rolesadmin)
                        .where((0, drizzle_orm_1.eq)(schema_1.rolesadmin.id, admin.roleId))
                        .limit(1);
                    if (role && role.permissions) {
                        allPermissions = [...allPermissions, ...role.permissions];
                    }
                }
                // ب. الصلاحيات المخصصة (Custom Permissions)
                if (admin.permissions && Array.isArray(admin.permissions)) {
                    allPermissions = [...allPermissions, ...admin.permissions];
                }
                // التحقق من وجود الصلاحية المطلوبة
                const hasRequiredPermission = allPermissions.some(permission => {
                    if (permission.module !== module)
                        return false;
                    return permission.actions.some(a => a.action === action);
                });
                if (!hasRequiredPermission) {
                    throw new forbiddenError_1.ForbiddenError(`You don't have permission to ${action} ${module}`);
                }
                return next();
            }
            // ==========================================
            // 4. نوع مستخدم غير معروف
            // ==========================================
            throw new forbiddenError_1.ForbiddenError("Invalid user type");
        }
        catch (error) {
            next(error);
        }
    };
};
exports.hasPermission = hasPermission;
/**
 * Middleware للتحقق من صلاحيات متعددة (OR logic)
 * يسمح بالوصول إذا كان المستخدم لديه أي من الصلاحيات المطلوبة
 *
 * @param permissions - مصفوفة من الصلاحيات المطلوبة
 * @param checkBranch - هل نتحقق من الفرع؟
 */
const hasAnyPermission = (permissions, checkBranch = false) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                throw new Errors_1.UnauthorizedError("Not authenticated");
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
                        throw new forbiddenError_1.ForbiddenError("Branch manager must be assigned to a branch");
                    }
                    if (requestedBranchId && requestedBranchId !== userBranchId) {
                        throw new forbiddenError_1.ForbiddenError("You can only access resources in your branch");
                    }
                }
                return next();
            }
            // Subadmin/Staff: نتحقق من الصلاحيات
            if (userType === "subadmin" || userType === "staff") {
                const [admin] = await connection_1.db
                    .select()
                    .from(schema_1.restrauntadmin)
                    .where((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.id, userId))
                    .limit(1);
                if (!admin) {
                    throw new Errors_1.UnauthorizedError("Admin not found");
                }
                // التحقق من الفرع
                if (checkBranch && admin.branchId) {
                    const requestedBranchId = req.body.branchId || req.params.branchId || req.query.branchId;
                    if (requestedBranchId && requestedBranchId !== admin.branchId) {
                        throw new forbiddenError_1.ForbiddenError("You can only access resources in your branch");
                    }
                }
                // جمع كل الصلاحيات
                let allPermissions = [];
                if (admin.roleId) {
                    const [role] = await connection_1.db
                        .select()
                        .from(schema_1.rolesadmin)
                        .where((0, drizzle_orm_1.eq)(schema_1.rolesadmin.id, admin.roleId))
                        .limit(1);
                    if (role && role.permissions) {
                        allPermissions = [...allPermissions, ...role.permissions];
                    }
                }
                if (admin.permissions && Array.isArray(admin.permissions)) {
                    allPermissions = [...allPermissions, ...admin.permissions];
                }
                // التحقق من وجود أي من الصلاحيات المطلوبة
                const hasAnyRequiredPermission = permissions.some(({ module, action }) => {
                    return allPermissions.some(permission => {
                        if (permission.module !== module)
                            return false;
                        return permission.actions.some(a => a.action === action);
                    });
                });
                if (!hasAnyRequiredPermission) {
                    throw new forbiddenError_1.ForbiddenError("You don't have the required permissions");
                }
                return next();
            }
            throw new forbiddenError_1.ForbiddenError("Invalid user type");
        }
        catch (error) {
            next(error);
        }
    };
};
exports.hasAnyPermission = hasAnyPermission;
/**
 * Middleware للتحقق من صلاحيات متعددة (AND logic)
 * يسمح بالوصول فقط إذا كان المستخدم لديه كل الصلاحيات المطلوبة
 *
 * @param permissions - مصفوفة من الصلاحيات المطلوبة
 * @param checkBranch - هل نتحقق من الفرع؟
 */
const hasAllPermissions = (permissions, checkBranch = false) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                throw new Errors_1.UnauthorizedError("Not authenticated");
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
                        throw new forbiddenError_1.ForbiddenError("Branch manager must be assigned to a branch");
                    }
                    if (requestedBranchId && requestedBranchId !== userBranchId) {
                        throw new forbiddenError_1.ForbiddenError("You can only access resources in your branch");
                    }
                }
                return next();
            }
            // Subadmin/Staff: نتحقق من الصلاحيات
            if (userType === "subadmin" || userType === "staff") {
                const [admin] = await connection_1.db
                    .select()
                    .from(schema_1.restrauntadmin)
                    .where((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.id, userId))
                    .limit(1);
                if (!admin) {
                    throw new Errors_1.UnauthorizedError("Admin not found");
                }
                // التحقق من الفرع
                if (checkBranch && admin.branchId) {
                    const requestedBranchId = req.body.branchId || req.params.branchId || req.query.branchId;
                    if (requestedBranchId && requestedBranchId !== admin.branchId) {
                        throw new forbiddenError_1.ForbiddenError("You can only access resources in your branch");
                    }
                }
                // جمع كل الصلاحيات
                let allPermissions = [];
                if (admin.roleId) {
                    const [role] = await connection_1.db
                        .select()
                        .from(schema_1.rolesadmin)
                        .where((0, drizzle_orm_1.eq)(schema_1.rolesadmin.id, admin.roleId))
                        .limit(1);
                    if (role && role.permissions) {
                        allPermissions = [...allPermissions, ...role.permissions];
                    }
                }
                if (admin.permissions && Array.isArray(admin.permissions)) {
                    allPermissions = [...allPermissions, ...admin.permissions];
                }
                // التحقق من وجود كل الصلاحيات المطلوبة
                const hasAllRequiredPermissions = permissions.every(({ module, action }) => {
                    return allPermissions.some(permission => {
                        if (permission.module !== module)
                            return false;
                        return permission.actions.some(a => a.action === action);
                    });
                });
                if (!hasAllRequiredPermissions) {
                    throw new forbiddenError_1.ForbiddenError("You don't have all the required permissions");
                }
                return next();
            }
            throw new forbiddenError_1.ForbiddenError("Invalid user type");
        }
        catch (error) {
            next(error);
        }
    };
};
exports.hasAllPermissions = hasAllPermissions;
/**
 * Helper function للتحقق من الصلاحيات في الـ Controllers
 * (للاستخدام خارج الـ middleware)
 */
const checkUserPermission = async (userId, module, action) => {
    const [admin] = await connection_1.db
        .select()
        .from(schema_1.restrauntadmin)
        .where((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.id, userId))
        .limit(1);
    if (!admin)
        return false;
    // Owner: له كل الصلاحيات
    if (admin.type === "owner")
        return true;
    // Branch Manager: له كل الصلاحيات في فرعه
    if (admin.type === "branch_manager")
        return true;
    // جمع الصلاحيات
    let allPermissions = [];
    if (admin.roleId) {
        const [role] = await connection_1.db
            .select()
            .from(schema_1.rolesadmin)
            .where((0, drizzle_orm_1.eq)(schema_1.rolesadmin.id, admin.roleId))
            .limit(1);
        if (role && role.permissions) {
            allPermissions = [...allPermissions, ...role.permissions];
        }
    }
    if (admin.permissions && Array.isArray(admin.permissions)) {
        allPermissions = [...allPermissions, ...admin.permissions];
    }
    // التحقق من الصلاحية
    return allPermissions.some(permission => {
        if (permission.module !== module)
            return false;
        return permission.actions.some(a => a.action === action);
    });
};
exports.checkUserPermission = checkUserPermission;
