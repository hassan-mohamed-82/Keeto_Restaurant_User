import { Request, Response } from "express";
import { db } from "../../models/connection";
import { discounts, discountRestaurants, food } from "../../models/schema";
import { eq, and, or, inArray } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";
import { saveBase64Image } from "../../utils/handleImages";

// ==========================================
// 1. Create Discount Groups
// ==========================================
export const createDiscount = async (req: Request, res: Response) => {
    const authenticatedRestaurantId = req.user?.restaurantId || req.user?.id;
    const restaurantId = req.body.restaurantId || authenticatedRestaurantId;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const {
        name, nameAr, nameFr,
        foodGroups, startDate, endDate, isActive,
        minOrderAmount, usageLimit, logo
    } = req.body;

    if (!name) throw new BadRequest("Discount name is required");
    if (!Array.isArray(foodGroups) || foodGroups.length === 0) {
        throw new BadRequest("foodGroups must contain at least one group");
    }

    const assignedFoodIds = new Set<string>();
    const groups = foodGroups.map((group: any) => {
        if (!group || !group.discountType) {
            throw new BadRequest("Each food group requires discountType");
        }

        const value = Number(group.discountValue);
        if (!Number.isFinite(value) || value < 0) {
            throw new BadRequest("Each food group requires a valid discountValue");
        }

        const discountType = group.discountType === "fixed" ? "fixed_amount" : group.discountType;
        if (!["percentage", "fixed_amount"].includes(discountType)) {
            throw new BadRequest("discountType must be percentage or fixed_amount");
        }

        if (!Array.isArray(group.foodIds) || group.foodIds.length === 0) {
            throw new BadRequest("Each food group must contain foodIds");
        }

        const foodIds: string[] = [...new Set(group.foodIds.filter(
            (foodId: unknown): foodId is string => typeof foodId === "string" && foodId.length > 0
        ))] as string[];
        if (foodIds.length !== group.foodIds.length) {
            throw new BadRequest("foodIds must contain unique non-empty strings");
        }

        for (const foodId of foodIds) {
            if (assignedFoodIds.has(foodId)) {
                throw new BadRequest(`Food ${foodId} cannot belong to more than one discount group`);
            }
            assignedFoodIds.add(foodId);
        }

        return {
            discountType,
            discountValue: value,
            maxDiscount: group.maxDiscount,
            foodIds,
        };
    });

    const shouldBeActive = isActive !== undefined ? isActive : true;
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    if ((start && Number.isNaN(start.getTime())) || (end && Number.isNaN(end.getTime()))) {
        throw new BadRequest("Invalid discount dates");
    }
    if (start && end && start > end) throw new BadRequest("startDate must be before endDate");

    const existingFoods = await db.select({ id: food.id })
        .from(food)
        .where(and(eq(food.restaurantid, restaurantId), inArray(food.id, [...assignedFoodIds])));
    if (existingFoods.length !== assignedFoodIds.size) {
        throw new BadRequest("One or more foodIds do not belong to this restaurant");
    }

    const discountIds = await db.transaction(async (tx) => {
        if (shouldBeActive) {
            const existing = await tx.select({ id: discounts.id })
                .from(discounts)
                .innerJoin(discountRestaurants, eq(discounts.id, discountRestaurants.discountId))
                .where(and(eq(discountRestaurants.restaurantId, restaurantId), eq(discounts.isActive, true)));
            if (existing.length > 0) {
                await tx.update(discounts).set({ isActive: false, updatedAt: new Date() })
                    .where(inArray(discounts.id, existing.map(item => item.id)));
            }
        }

        const ids: string[] = [];
        for (const group of groups) {
            let campaignLogo = logo || null;
            if (campaignLogo?.startsWith("data:image")) {
                campaignLogo = await saveBase64Image(campaignLogo, req, "discounts");
            }

            const discountId = uuidv4();
            await tx.insert(discounts).values({
                id: discountId,
                name,
                nameAr: nameAr || null,
                nameFr: nameFr || null,
                discountType: group.discountType as "percentage" | "fixed_amount",
                discountValue: String(group.discountValue),
                maxDiscount: group.maxDiscount === undefined || group.maxDiscount === null ? null : String(Number(group.maxDiscount)),
                minOrderAmount: minOrderAmount ? String(minOrderAmount) : "0.00",
                usageLimit: usageLimit || null,
                startDate: start,
                endDate: end,
                isActive: shouldBeActive,
                isGlobal: false,
                logo: campaignLogo,
            });
            await tx.insert(discountRestaurants).values({ id: uuidv4(), discountId, restaurantId });

            if (group.foodIds.length > 0) {
                await tx.update(food).set({ discountId }).where(and(
                    eq(food.restaurantid, restaurantId),
                    inArray(food.id, group.foodIds),
                ));
            }
            ids.push(discountId);
        }
        return ids;
    });

    return SuccessResponse(res, {
        message: "Discount groups created successfully",
        data: { restaurantId, discountIds },
    }, 201);
};

// ==========================================
// 2. Get All Discounts (This restaurant's discounts + Global discounts)
// ==========================================
export const getAllDiscounts = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const rawData = await db
        .selectDistinct({ discounts: discounts })
        .from(discounts)
        .leftJoin(discountRestaurants, eq(discounts.id, discountRestaurants.discountId))
        .where(
            or(
                eq(discounts.isGlobal, true), 
                eq(discountRestaurants.restaurantId, restaurantId) 
            )
        );

    const allDiscounts = rawData.map(row => row.discounts);

    const enrichedDiscounts = await Promise.all(allDiscounts.map(async (discount) => {
        const foodsData = await db.select({
                id: food.id,
                name: food.name,
                nameAr: food.nameAr,
                nameFr: food.nameFr
            })
            .from(food)
            .where(eq(food.discountId, discount.id));
            
        return {
            ...discount,
            foodIds: foodsData.map(f => f.id),
            foods: foodsData
        };
    }));

    return SuccessResponse(res, { message: "Get all discounts success", data: enrichedDiscounts });
};

// ==========================================
// 3. Get Discount by ID
// ==========================================
export const getDiscountById = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const [rawData] = await db
        .selectDistinct({ discounts: discounts })
        .from(discounts)
        .leftJoin(discountRestaurants, eq(discounts.id, discountRestaurants.discountId))
        .where(
            and(
                eq(discounts.id, id),
                or(
                    eq(discounts.isGlobal, true),
                    eq(discountRestaurants.restaurantId, restaurantId)
                )
            )
        )
        .limit(1);

    if (!rawData) throw new NotFound("Discount not found");

    const foodsData = await db.select({
            id: food.id,
            name: food.name,
            nameAr: food.nameAr,
            nameFr: food.nameFr
        })
            .from(food)
            .where(eq(food.discountId, rawData.discounts.id));

    const result = {
        ...rawData.discounts,
        foodIds: foodsData.map(f => f.id),
        foods: foodsData
    };

    return SuccessResponse(res, { message: "Get discount success", data: result });
};

// ==========================================
// 4. Update Discount 
// ==========================================
export const updateDiscount = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const [existing] = await db
        .select()
        .from(discounts)
        .innerJoin(discountRestaurants, eq(discounts.id, discountRestaurants.discountId))
        .where(
            and(
                eq(discounts.id, id),
                eq(discountRestaurants.restaurantId, restaurantId),
                eq(discounts.isGlobal, false) 
            )
        )
        .limit(1);

    if (!existing) throw new NotFound("Discount not found or cannot be modified");

    const {
        name, nameAr, nameFr,
        discountType, discountValue,
        maxDiscount, minOrderAmount,
        usageLimit, startDate, endDate, isActive, foodIds, logo
    } = req.body;

    let FinalLogo = logo;
    if (logo && logo.startsWith("data:image")) {
        FinalLogo = await saveBase64Image(logo, req, "discounts");
    }

    // 💡 أيضاً في التحديث: إذا قام بتحويل الحالة إلى active، نطفئ باقي الخصومات
    if (isActive === true && !existing.discounts.isActive) {
        const myDiscounts = await db
            .select({ id: discounts.id })
            .from(discounts)
            .innerJoin(discountRestaurants, eq(discounts.id, discountRestaurants.discountId))
            .where(eq(discountRestaurants.restaurantId, restaurantId));

        const myDiscountIds = myDiscounts.map(d => d.id);

        if (myDiscountIds.length > 0) {
            await db
                .update(discounts)
                .set({ isActive: false, updatedAt: new Date() })
                .where(and(inArray(discounts.id, myDiscountIds), eq(discounts.isActive, true)));
        }
    }

    const updateData: any = { updatedAt: new Date() };

    if (name !== undefined) updateData.name = name;
    if (nameAr !== undefined) updateData.nameAr = nameAr;
    if (nameFr !== undefined) updateData.nameFr = nameFr;
    if (discountType !== undefined) updateData.discountType = discountType;
    if (discountValue !== undefined) updateData.discountValue = discountValue.toString();
    if (maxDiscount !== undefined) updateData.maxDiscount = maxDiscount ? maxDiscount.toString() : null;
    if (minOrderAmount !== undefined) updateData.minOrderAmount = minOrderAmount.toString();
    if (usageLimit !== undefined) updateData.usageLimit = usageLimit;
    if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (logo !== undefined) updateData.logo = FinalLogo;

    await db.update(discounts).set(updateData).where(eq(discounts.id, id));

    if (foodIds !== undefined) {
        await db.update(food).set({ discountId: null }).where(eq(food.discountId, id));
        if (Array.isArray(foodIds) && foodIds.length > 0) {
            await db.update(food).set({ discountId: id }).where(and(
                eq(food.restaurantid, restaurantId),
                inArray(food.id, foodIds),
            ));
        }
    }

    return SuccessResponse(res, { message: "Discount updated successfully" });
};

// ==========================================
// 5. Delete Discount
// ==========================================
export const deleteDiscount = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const [existing] = await db
        .select()
        .from(discounts)
        .innerJoin(discountRestaurants, eq(discounts.id, discountRestaurants.discountId))
        .where(
            and(
                eq(discounts.id, id),
                eq(discountRestaurants.restaurantId, restaurantId),
                eq(discounts.isGlobal, false) 
            )
        )
        .limit(1);

    if (!existing) throw new NotFound("Discount not found or cannot be deleted");

    await db.delete(discounts).where(eq(discounts.id, id));

    return SuccessResponse(res, { message: "Discount deleted successfully" });
};

// ==========================================
// 6. Toggle Discount Status (With Switch Logic)
// ==========================================
export const toggleDiscountStatus = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    // 1. جلب الخصم الحالي للتأكد من ملكيته للمطعم
    const [rawData] = await db
        .select()
        .from(discounts)
        .innerJoin(discountRestaurants, eq(discounts.id, discountRestaurants.discountId))
        .where(
            and(
                eq(discounts.id, id),
                eq(discountRestaurants.restaurantId, restaurantId),
                eq(discounts.isGlobal, false) 
            )
        )
        .limit(1);

    if (!rawData) throw new NotFound("Discount not found or cannot be modified");
    const existingDiscount = rawData.discounts;
    
    // 💡 التحويل الصريح لـ Boolean (لأن MySQL أحياناً بترجع 1 أو 0)
    const currentStatus = existingDiscount.isActive === true || existingDiscount.isActive === 1 as any;
    const nextStatus = !currentStatus;

    // 2. استخدام Transaction لضمان تنفيذ العمليتين معاً بدون تداخل
    await db.transaction(async (tx) => {
        
        // 💡 إذا كان صاحب المطعم يفتح الـ Switch (يحول الحالة لـ true)
        if (nextStatus === true) {
            // أ) جلب الخصومات التابعة للمطعم (النشطة فقط)
            const activeDiscounts = await tx
                .select({ id: discounts.id })
                .from(discounts)
                .innerJoin(discountRestaurants, eq(discounts.id, discountRestaurants.discountId))
                .where(
                    and(
                        eq(discountRestaurants.restaurantId, restaurantId),
                        eq(discounts.isActive, true)
                    )
                );

            // ب) استخراج الـ IDs (مع استبعاد الخصم الحالي عشان منقفلوش ونرجع نفتحه في نفس اللحظة)
            const activeIdsToDeactivate = activeDiscounts
                .map(d => d.id)
                .filter(dId => dId !== id);

            // ج) إيقاف أي خصم نشط آخر
            if (activeIdsToDeactivate.length > 0) {
                await tx
                    .update(discounts)
                    .set({ isActive: false })
                    .where(inArray(discounts.id, activeIdsToDeactivate));
            }
        }

        // د) تحديث الخصم الحالي للحالة الجديدة
        await tx
            .update(discounts)
            .set({ isActive: nextStatus })
            .where(eq(discounts.id, id));
    });

    return SuccessResponse(res, {
        message: `Discount ${nextStatus ? "activated" : "deactivated"} successfully.`,
        data: { isActive: nextStatus }
    });
};

