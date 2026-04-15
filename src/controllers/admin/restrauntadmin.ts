// controllers/admin.controller.ts

import { Request, Response } from "express";
import { db } from "../../models/connection";
import { restrauntadmin, rolesadmin } from "../../models/schema";
import { eq } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { NotFound } from "../../Errors/NotFound";
import { BadRequest } from "../../Errors/BadRequest";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";

export const createAdmin = async (req: Request, res: Response) => {
    const { name, email, phoneNumber, password, roleId } = req.body;

    const existingAdmin = await db
        .select()
        .from(restrauntadmin)
        .where(eq(restrauntadmin.email, email));

    if (existingAdmin.length > 0) {
        throw new BadRequest("email is already exists");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const id = uuidv4();

    await db.insert(restrauntadmin).values({
        id,
        name,
        email,
        phoneNumber,
        password: hashedPassword,
        roleId,
    });

    return SuccessResponse(res, { message: "create admin success", data: { id } });
};

export const getAllrestrauntadmin = async (req: Request, res: Response) => {
    const allrestrauntadmin = await db
        .select({
            id: restrauntadmin.id,
            name: restrauntadmin.name,
            email: restrauntadmin.email,
            phoneNumber: restrauntadmin.phoneNumber,
            status: restrauntadmin.status,
            createdAt: restrauntadmin.createdAt,
            updatedAt: restrauntadmin.updatedAt,
            // بيانات الـ Role
            role: {
                id: rolesadmin.id,
                name: rolesadmin.name,
                permissions: rolesadmin.permissions,
                status: rolesadmin.status,
            },
        })
        .from(restrauntadmin)
        .leftJoin(rolesadmin, eq(restrauntadmin.roleId, rolesadmin.id));

    return SuccessResponse(res, { 
        message: "get all restrauntadmin success", 
        data: allrestrauntadmin 
    });
};


export const getAdminById = async (req: Request, res: Response) => {
    const { id } = req.params;

    const admin = await db
        .select({
            id: restrauntadmin.id,
            name: restrauntadmin.name,
            email: restrauntadmin.email,
            phoneNumber: restrauntadmin.phoneNumber,
            status: restrauntadmin.status,
            createdAt: restrauntadmin.createdAt,
            updatedAt: restrauntadmin.updatedAt,
            // بيانات الـ Role
            role: {
                id: rolesadmin.id,
                name: rolesadmin.name,
                permissions: rolesadmin.permissions,
                status: rolesadmin.status,
            },
        })
        .from(restrauntadmin)
        .leftJoin(rolesadmin, eq(restrauntadmin.roleId, rolesadmin.id))
        .where(eq(restrauntadmin.id, id));

    if (admin.length === 0) {
        throw new NotFound("admin not found");
    }

    return SuccessResponse(res, { 
        message: "get admin by id success", 
        data: admin[0] 
    });
};


export const updateAdmin = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, email, phoneNumber, roleId } = req.body;

    const existingAdmin = await db
        .select()
        .from(restrauntadmin)
        .where(eq(restrauntadmin.id, id));

    if (existingAdmin.length === 0) {
        throw new NotFound("admin not found");
    }

    const updateData: any = {
        updatedAt: new Date()
    };

    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (phoneNumber) updateData.phoneNumber = phoneNumber;
    if (roleId) updateData.roleId = roleId;

    if (Object.keys(updateData).length === 1) {
        throw new BadRequest("no data to update");
    }

    await db
        .update(restrauntadmin)
        .set(updateData)
        .where(eq(restrauntadmin.id, id));

    return SuccessResponse(res, { message: "update admin success" });
};

export const deleteAdmin = async (req: Request, res: Response) => {
    const { id } = req.params;

    const admin = await db
        .select()
        .from(restrauntadmin)
        .where(eq(restrauntadmin.id, id));

    if (admin.length === 0) {
        throw new NotFound("admin not found");
    }

    await db.delete(restrauntadmin).where(eq(restrauntadmin.id, id));

    return SuccessResponse(res, { message: "delete admin success" });
};


export const togglerestrauntadmintatus = async (req: Request, res: Response) => {
    const { id } = req.params;

    const admin = await db
        .select()
        .from(restrauntadmin)
        .where(eq(restrauntadmin.id, id));

    if (admin.length === 0) {
        throw new NotFound("admin not found");
    }

    const newStatus = admin[0].status === "active" ? "inactive" : "active";

    await db
        .update(restrauntadmin)
        .set({
            status: newStatus,
            updatedAt: new Date()
        })
        .where(eq(restrauntadmin.id, id));

    return SuccessResponse(res, { message: `toggle admin status success` });
};


export const select=async(req:Request,res:Response)=>{
 
    const allroles= await db.select().from(rolesadmin);
    
    return SuccessResponse(res,{message:"get all roles success",data:allroles});
}