import { Request, Response } from "express";
import { db } from "../../models/connection";

import { branches, restaurants, restrauntadmin, rolesadmin, restaurantSchedules } from "../../models/schema";
import { eq, inArray, and } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { UnauthorizedError } from "../../Errors";
import {calculateCalculatedPrice} from "../../helpers/pricing.helper";

export async function login_cashier(req: Request, res: Response) {
    const { email, password , fcmToken } = req.body;
    if (!email || !password) {
        throw new BadRequest("Email and password are required");
    }

}