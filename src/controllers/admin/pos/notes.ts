import { Request, Response } from "express";
import { db } from "../../../models/connection";
import { noteGroups, noteItems, food } from "../../../models/schema";
import { eq, and, desc, inArray, or, like, count, sql } from "drizzle-orm";
import { SuccessResponse } from "../../../utils/response";
import { BadRequest, NotFound } from "../../../Errors";
import { v4 as uuidv4 } from "uuid";
import { extractLang, getLocalizedName, Language } from "../../../helpers/localization.helper";

export function formatNoteItem(item: any, lang: Language = "en") {
    if (!item) return null;
    return {
        ...item,
        name: getLocalizedName(item, lang),
        nameAr: item.nameAr ?? null,
        nameFr: item.nameFr ?? null,
    };
}

export function formatNoteGroup(group: any, lang: Language = "en") {
    if (!group) return null;
    return {
        ...group,
        name: getLocalizedName(group, lang),
        nameAr: group.nameAr ?? null,
        nameFr: group.nameFr ?? null,
        items: Array.isArray(group.items) ? group.items.map((it: any) => formatNoteItem(it, lang)) : [],
    };
}

export function formatListNoteGroup(group: any, lang: Language = "en") {
    if (!group) return null;
    return {
        ...group,
        name: getLocalizedName(group, lang), 
    };
}

// ==========================================
// 1. Create Note Group (with optional noteItems)
// ==========================================
export const createNoteGroup = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { name, nameAr, nameFr, status, noteItems: incomingItems } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
        throw new BadRequest("Note group name is required");
    }

    const groupId = uuidv4();
    const finalStatus = status || "active";

    const createdData = await db.transaction(async (tx) => {
        // 1. Insert note group with restaurantId
        await tx.insert(noteGroups).values({
            id: groupId,
            restaurantId,
            name: name.trim(),
            nameAr: nameAr ? nameAr.trim() : null,
            nameFr: nameFr ? nameFr.trim() : null,
            status: finalStatus,
        });

        // 2. Insert items if provided with restaurantId
        const insertedItems: any[] = [];
        if (Array.isArray(incomingItems) && incomingItems.length > 0) {
            for (const item of incomingItems) {
                if (!item.name || typeof item.name !== "string" || !item.name.trim()) continue;
                const itemId = uuidv4();
                const itemRecord = {
                    id: itemId,
                    restaurantId,
                    group_note_id: groupId,
                    name: item.name.trim(),
                    nameAr: item.nameAr ? item.nameAr.trim() : null,
                    nameFr: item.nameFr ? item.nameFr.trim() : null,
                    status: item.status || "active",
                };
                await tx.insert(noteItems).values(itemRecord);
                insertedItems.push(itemRecord);
            }
        }

        const [group] = await tx
            .select()
            .from(noteGroups)
            .where(and(eq(noteGroups.id, groupId), eq(noteGroups.restaurantId, restaurantId)))
            .limit(1);

        return {
            ...group,
            items: insertedItems,
        };
    });

    const lang = extractLang(req);
    return SuccessResponse(
        res,
        {
            message: "Note group created successfully",
            data: formatNoteGroup(createdData, lang),
        },
        201
    );
};

// ==========================================
// 2. Get All Note Groups (scoped to restaurantId)
// ==========================================
export const getAllNoteGroups = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const page = Math.max(1, parseInt((req.query.page || req.body?.page || "1") as string, 10));
    const limit = Math.max(1, Math.min(100, parseInt((req.query.limit || req.body?.limit || "20") as string, 10)));
    const offset = (page - 1) * limit;

    const search = (req.query.search || req.body?.search || "") as string;
    const status = (req.query.status || req.body?.status) as string;

    const conditions = [eq(noteGroups.restaurantId, restaurantId)];

    if (search.trim()) {
        const searchPattern = `%${search.trim()}%`;
        conditions.push(
            or(
                like(noteGroups.name, searchPattern),
                like(noteGroups.nameAr, searchPattern),
                like(noteGroups.nameFr, searchPattern)
            ) as any
        );
    }

    if (status && status !== "all" && (status === "active" || status === "inactive")) {
        conditions.push(eq(noteGroups.status, status));
    }

    const whereClause = and(...conditions);

    // Count total
    const [totalCount] = await db
        .select({ value: count() })
        .from(noteGroups)
        .where(whereClause);

    const total = Number(totalCount?.value || 0);

    // Fetch groups
    const groupsList = await db
        .select()
        .from(noteGroups)
        .where(whereClause)
        .orderBy(desc(noteGroups.createdAt))
        .limit(limit)
        .offset(offset);

    // Enrich groups with their items
    let enrichedGroups = groupsList.map((g) => ({ ...g, items: [] as any[] }));
    

    const lang = extractLang(req);
    const formattedGroups = enrichedGroups.map((g) => {
        const name = formatListNoteGroup(g, lang);
        return {
            "id": g.id,
            "name": name.name,
            "status": g.status,
        };
    });

    return SuccessResponse(res, {
        message: "Note groups fetched successfully",
        data: formattedGroups,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit) || 1,
        },
    });
};

// ==========================================
// 3. Get Note Group By ID
// ==========================================
export const getNoteGroupById = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [group] = await db
        .select()
        .from(noteGroups)
        .where(and(eq(noteGroups.id, id), eq(noteGroups.restaurantId, restaurantId)))
        .limit(1);

    if (!group) {
        throw new NotFound("Note group not found");
    }

    const items = await db
        .select()
        .from(noteItems)
        .where(
            and(
                eq(noteItems.group_note_id, id),
                eq(noteItems.restaurantId, restaurantId)
            )
        )
        .orderBy(desc(noteItems.createdAt));

    const [foodsCountRes] = await db
        .select({ value: count() })
        .from(food)
        .where(
            and(
                eq(food.group_note_id, id),
                eq(food.restaurantid, restaurantId)
            )
        );

    const lang = extractLang(req);
    const formattedGroup = formatNoteGroup({ ...group, items }, lang);

    return SuccessResponse(res, {
        message: "Note group fetched successfully",
        data: {
            ...formattedGroup,
            linkedFoodsCount: Number(foodsCountRes?.value || 0),
        },
    });
};

// ==========================================
// 4. Update Note Group (scoped to restaurantId)
// ==========================================
export const updateNoteGroup = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;
    const { name, nameAr, nameFr, status, noteItems: incomingItems } = req.body;

    const [existing] = await db
        .select()
        .from(noteGroups)
        .where(and(eq(noteGroups.id, id), eq(noteGroups.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) {
        throw new NotFound("Note group not found");
    }

    const updatedData = await db.transaction(async (tx) => {
        const updateFields: any = {};
        if (name !== undefined) updateFields.name = name.trim();
        if (nameAr !== undefined) updateFields.nameAr = nameAr ? nameAr.trim() : null;
        if (nameFr !== undefined) updateFields.nameFr = nameFr ? nameFr.trim() : null;
        if (status !== undefined) updateFields.status = status;

        if (Object.keys(updateFields).length > 0) {
            await tx
                .update(noteGroups)
                .set(updateFields)
                .where(and(eq(noteGroups.id, id), eq(noteGroups.restaurantId, restaurantId)));
        }

        // Manage noteItems if provided
        if (Array.isArray(incomingItems)) {
            const existingItems = await tx
                .select()
                .from(noteItems)
                .where(
                    and(
                        eq(noteItems.group_note_id, id),
                        eq(noteItems.restaurantId, restaurantId)
                    )
                );

            const existingItemIds = new Set(existingItems.map((i) => i.id));
            const incomingItemIds = new Set<string>();

            for (const item of incomingItems) {
                if (!item.name || typeof item.name !== "string" || !item.name.trim()) continue;

                if (item.id && existingItemIds.has(item.id)) {
                    // Update existing item belonging to this restaurant
                    incomingItemIds.add(item.id);
                    await tx
                        .update(noteItems)
                        .set({
                            name: item.name.trim(),
                            nameAr: item.nameAr !== undefined ? (item.nameAr ? item.nameAr.trim() : null) : undefined,
                            nameFr: item.nameFr !== undefined ? (item.nameFr ? item.nameFr.trim() : null) : undefined,
                            status: item.status || "active",
                        })
                        .where(
                            and(
                                eq(noteItems.id, item.id),
                                eq(noteItems.restaurantId, restaurantId)
                            )
                        );
                } else {
                    // Insert new item with restaurantId
                    const newItemId = uuidv4();
                    incomingItemIds.add(newItemId);
                    await tx.insert(noteItems).values({
                        id: newItemId,
                        restaurantId,
                        group_note_id: id,
                        name: item.name.trim(),
                        nameAr: item.nameAr ? item.nameAr.trim() : null,
                        nameFr: item.nameFr ? item.nameFr.trim() : null,
                        status: item.status || "active",
                    });
                }
            }

            // Remove existing items that were omitted from incoming array
            const toDeleteIds = existingItems
                .filter((item) => !incomingItemIds.has(item.id))
                .map((item) => item.id);

            if (toDeleteIds.length > 0) {
                await tx
                    .delete(noteItems)
                    .where(
                        and(
                            inArray(noteItems.id, toDeleteIds),
                            eq(noteItems.restaurantId, restaurantId)
                        )
                    );
            }
        }

        const [updatedGroup] = await tx
            .select()
            .from(noteGroups)
            .where(and(eq(noteGroups.id, id), eq(noteGroups.restaurantId, restaurantId)))
            .limit(1);

        const currentItems = await tx
            .select()
            .from(noteItems)
            .where(
                and(
                    eq(noteItems.group_note_id, id),
                    eq(noteItems.restaurantId, restaurantId)
                )
            )
            .orderBy(desc(noteItems.createdAt));

        return {
            ...updatedGroup,
            items: currentItems,
        };
    });

    const lang = extractLang(req);
    return SuccessResponse(res, {
        message: "Note group updated successfully",
        data: formatNoteGroup(updatedData, lang),
    });
};

// ==========================================
// 5. Delete Note Group (scoped to restaurantId)
// ==========================================
export const deleteNoteGroup = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [group] = await db
        .select()
        .from(noteGroups)
        .where(and(eq(noteGroups.id, id), eq(noteGroups.restaurantId, restaurantId)))
        .limit(1);

    if (!group) {
        throw new NotFound("Note group not found");
    }

    await db.transaction(async (tx) => {
        // Set null on foods referencing this group belonging to this restaurant
        await tx
            .update(food)
            .set({ group_note_id: null })
            .where(and(eq(food.group_note_id, id), eq(food.restaurantid, restaurantId)));
        // Delete items belonging to this restaurant
        await tx
            .delete(noteItems)
            .where(and(eq(noteItems.group_note_id, id), eq(noteItems.restaurantId, restaurantId)));
        // Delete group
        await tx
            .delete(noteGroups)
            .where(and(eq(noteGroups.id, id), eq(noteGroups.restaurantId, restaurantId)));
    });

    return SuccessResponse(res, {
        message: "Note group deleted successfully",
    });
};

// ==========================================
// 6. Toggle Note Group Status (scoped to restaurantId)
// ==========================================
export const toggleNoteGroupStatus = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const { id } = req.params;

    const [group] = await db
        .select()
        .from(noteGroups)
        .where(and(eq(noteGroups.id, id), eq(noteGroups.restaurantId, restaurantId)))
        .limit(1);

    if (!group) {
        throw new NotFound("Note group not found");
    }

    const newStatus = group.status === "active" ? "inactive" : "active";

    await db
        .update(noteGroups)
        .set({ status: newStatus })
        .where(and(eq(noteGroups.id, id), eq(noteGroups.restaurantId, restaurantId)));

    return SuccessResponse(res, {
        message: `Note group status changed to ${newStatus}`,
        data: {
            id,
            status: newStatus,
        },
    });
};

// ==========================================
// 7. Assign Note Group to Food (scoped to restaurantId)
// ==========================================
export const assignNoteGroupToFood = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const foodId = req.body.food_id || req.body.foodId;
    const noteGroupId = req.body.note_group_id ?? req.body.noteGroupId ?? req.body.group_note_id ?? null;

    if (!foodId || typeof foodId !== "string") {
        throw new BadRequest("food_id is required");
    }

    // 1. Verify food exists and belongs to this restaurant
    const [targetFood] = await db
        .select()
        .from(food)
        .where(and(eq(food.id, foodId), eq(food.restaurantid, restaurantId)))
        .limit(1);

    if (!targetFood) {
        throw new NotFound("Food item not found or unauthorized");
    }

    // 2. If noteGroupId is provided and not null, verify noteGroup exists and belongs to this restaurant
    let noteGroupData = null;
    if (noteGroupId) {
        const [targetGroup] = await db
            .select()
            .from(noteGroups)
            .where(and(eq(noteGroups.id, noteGroupId), eq(noteGroups.restaurantId, restaurantId)))
            .limit(1);

        if (!targetGroup) {
            throw new NotFound("Note group not found or unauthorized");
        }
        noteGroupData = targetGroup;
    }

    // 3. Update group_note_id in food
    await db
        .update(food)
        .set({ group_note_id: noteGroupId })
        .where(and(eq(food.id, foodId), eq(food.restaurantid, restaurantId)));

    const [updatedFood] = await db
        .select({
            id: food.id,
            name: food.name,
            nameAr: food.nameAr,
            nameFr: food.nameFr,
            group_note_id: food.group_note_id,
        })
        .from(food)
        .where(and(eq(food.id, foodId), eq(food.restaurantid, restaurantId)))
        .limit(1);

    const lang = extractLang(req);
    return SuccessResponse(res, {
        message: noteGroupId
            ? "Note group assigned to food successfully"
            : "Note group unassigned from food successfully",
        data: {
            ...updatedFood,
            name: getLocalizedName(updatedFood, lang),
            noteGroup: noteGroupData ? formatNoteGroup(noteGroupData, lang) : null,
        },
    });
};
