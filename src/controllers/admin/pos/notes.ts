import { Request, Response } from "express";
import { db } from "../../../models/connection";
import { noteGroups, noteItems, food } from "../../../models/schema";
import { eq, desc, inArray, or, like, count, sql } from "drizzle-orm";
import { SuccessResponse } from "../../../utils/response";
import { BadRequest, NotFound } from "../../../Errors";
import { v4 as uuidv4 } from "uuid";
import { extractLang } from "../../../helpers/localization.helper";

// ==========================================
// 1. Create Note Group (with optional noteItems)
// ==========================================
export const createNoteGroup = async (req: Request, res: Response) => {
    const { name, nameAr, nameFr, status, noteItems: incomingItems } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
        throw new BadRequest("Note group name is required");
    }

    const groupId = uuidv4();
    const finalStatus = status || "active";

    const createdData = await db.transaction(async (tx) => {
        // 1. Insert note group
        await tx.insert(noteGroups).values({
            id: groupId,
            name: name.trim(),
            nameAr: nameAr ? nameAr.trim() : null,
            nameFr: nameFr ? nameFr.trim() : null,
            status: finalStatus,
        });

        // 2. Insert items if provided
        const insertedItems: any[] = [];
        if (Array.isArray(incomingItems) && incomingItems.length > 0) {
            for (const item of incomingItems) {
                if (!item.name || typeof item.name !== "string" || !item.name.trim()) continue;
                const itemId = uuidv4();
                const itemRecord = {
                    id: itemId,
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
            .where(eq(noteGroups.id, groupId))
            .limit(1);

        return {
            ...group,
            items: insertedItems,
        };
    });

    return SuccessResponse(
        res,
        {
            message: "Note group created successfully",
            data: createdData,
        },
        201
    );
};

// ==========================================
// 2. Get All Note Groups (with search, pagination & items)
// ==========================================
export const getAllNoteGroups = async (req: Request, res: Response) => {
    const page = Math.max(1, parseInt((req.query.page || req.body?.page || "1") as string, 10));
    const limit = Math.max(1, Math.min(100, parseInt((req.query.limit || req.body?.limit || "20") as string, 10)));
    const offset = (page - 1) * limit;

    const search = (req.query.search || req.body?.search || "") as string;
    const status = (req.query.status || req.body?.status) as string;

    const conditions = [];

    if (search.trim()) {
        const searchPattern = `%${search.trim()}%`;
        conditions.push(
            or(
                like(noteGroups.name, searchPattern),
                like(noteGroups.nameAr, searchPattern),
                like(noteGroups.nameFr, searchPattern)
            )
        );
    }

    if (status && status !== "all" && (status === "active" || status === "inactive")) {
        conditions.push(eq(noteGroups.status, status));
    }

    const whereClause = conditions.length > 0 ? sql.join(conditions, sql` AND `) : undefined;

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
    if (groupsList.length > 0) {
        const groupIds = groupsList.map((g) => g.id);
        const allItems = await db
            .select()
            .from(noteItems)
            .where(inArray(noteItems.group_note_id, groupIds))
            .orderBy(desc(noteItems.createdAt));

        const itemsMap = new Map<string, any[]>();
        for (const it of allItems) {
            if (!itemsMap.has(it.group_note_id)) {
                itemsMap.set(it.group_note_id, []);
            }
            itemsMap.get(it.group_note_id)!.push(it);
        }

        enrichedGroups = groupsList.map((g) => ({
            ...g,
            items: itemsMap.get(g.id) || [],
        }));
    }

    return SuccessResponse(res, {
        message: "Note groups fetched successfully",
        data: enrichedGroups,
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
    const { id } = req.params;

    const [group] = await db
        .select()
        .from(noteGroups)
        .where(eq(noteGroups.id, id))
        .limit(1);

    if (!group) {
        throw new NotFound("Note group not found");
    }

    const items = await db
        .select()
        .from(noteItems)
        .where(eq(noteItems.group_note_id, id))
        .orderBy(desc(noteItems.createdAt));

    const [foodsCountRes] = await db
        .select({ value: count() })
        .from(food)
        .where(eq(food.group_note_id, id));

    return SuccessResponse(res, {
        message: "Note group fetched successfully",
        data: {
            ...group,
            items,
            linkedFoodsCount: Number(foodsCountRes?.value || 0),
        },
    });
};

// ==========================================
// 4. Update Note Group (with optional noteItems sync)
// ==========================================
export const updateNoteGroup = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, nameAr, nameFr, status, noteItems: incomingItems } = req.body;

    const [existing] = await db
        .select()
        .from(noteGroups)
        .where(eq(noteGroups.id, id))
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
            await tx.update(noteGroups).set(updateFields).where(eq(noteGroups.id, id));
        }

        // Manage noteItems if provided
        if (Array.isArray(incomingItems)) {
            const existingItems = await tx
                .select()
                .from(noteItems)
                .where(eq(noteItems.group_note_id, id));

            const existingItemIds = new Set(existingItems.map((i) => i.id));
            const incomingItemIds = new Set<string>();

            for (const item of incomingItems) {
                if (!item.name || typeof item.name !== "string" || !item.name.trim()) continue;

                if (item.id && existingItemIds.has(item.id)) {
                    // Update existing item
                    incomingItemIds.add(item.id);
                    await tx
                        .update(noteItems)
                        .set({
                            name: item.name.trim(),
                            nameAr: item.nameAr !== undefined ? (item.nameAr ? item.nameAr.trim() : null) : undefined,
                            nameFr: item.nameFr !== undefined ? (item.nameFr ? item.nameFr.trim() : null) : undefined,
                            status: item.status || "active",
                        })
                        .where(eq(noteItems.id, item.id));
                } else {
                    // Insert new item
                    const newItemId = uuidv4();
                    incomingItemIds.add(newItemId);
                    await tx.insert(noteItems).values({
                        id: newItemId,
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
                await tx.delete(noteItems).where(inArray(noteItems.id, toDeleteIds));
            }
        }

        const [updatedGroup] = await tx
            .select()
            .from(noteGroups)
            .where(eq(noteGroups.id, id))
            .limit(1);

        const currentItems = await tx
            .select()
            .from(noteItems)
            .where(eq(noteItems.group_note_id, id))
            .orderBy(desc(noteItems.createdAt));

        return {
            ...updatedGroup,
            items: currentItems,
        };
    });

    return SuccessResponse(res, {
        message: "Note group updated successfully",
        data: updatedData,
    });
};

// ==========================================
// 5. Delete Note Group
// ==========================================
export const deleteNoteGroup = async (req: Request, res: Response) => {
    const { id } = req.params;

    const [group] = await db
        .select()
        .from(noteGroups)
        .where(eq(noteGroups.id, id))
        .limit(1);

    if (!group) {
        throw new NotFound("Note group not found");
    }

    await db.transaction(async (tx) => {
        // Set null on foods referencing this group
        await tx.update(food).set({ group_note_id: null }).where(eq(food.group_note_id, id));
        // Delete items
        await tx.delete(noteItems).where(eq(noteItems.group_note_id, id));
        // Delete group
        await tx.delete(noteGroups).where(eq(noteGroups.id, id));
    });

    return SuccessResponse(res, {
        message: "Note group deleted successfully",
    });
};

// ==========================================
// 6. Toggle Note Group Status
// ==========================================
export const toggleNoteGroupStatus = async (req: Request, res: Response) => {
    const { id } = req.params;

    const [group] = await db
        .select()
        .from(noteGroups)
        .where(eq(noteGroups.id, id))
        .limit(1);

    if (!group) {
        throw new NotFound("Note group not found");
    }

    const newStatus = group.status === "active" ? "inactive" : "active";

    await db
        .update(noteGroups)
        .set({ status: newStatus })
        .where(eq(noteGroups.id, id));

    return SuccessResponse(res, {
        message: `Note group status changed to ${newStatus}`,
        data: {
            id,
            status: newStatus,
        },
    });
};

// ==========================================
// 7. Assign Note Group to Food
// ==========================================
export const assignNoteGroupToFood = async (req: Request, res: Response) => {
    const foodId = req.body.food_id || req.body.foodId;
    const noteGroupId = req.body.note_group_id ?? req.body.noteGroupId ?? req.body.group_note_id ?? null;

    if (!foodId || typeof foodId !== "string") {
        throw new BadRequest("food_id is required");
    }

    // 1. Verify food exists
    const [targetFood] = await db
        .select()
        .from(food)
        .where(eq(food.id, foodId))
        .limit(1);

    if (!targetFood) {
        throw new NotFound("Food item not found");
    }

    // 2. If noteGroupId is provided and not null, verify noteGroup exists
    let noteGroupData = null;
    if (noteGroupId) {
        const [targetGroup] = await db
            .select()
            .from(noteGroups)
            .where(eq(noteGroups.id, noteGroupId))
            .limit(1);

        if (!targetGroup) {
            throw new NotFound("Note group not found");
        }
        noteGroupData = targetGroup;
    }

    // 3. Update group_note_id in food
    await db
        .update(food)
        .set({ group_note_id: noteGroupId })
        .where(eq(food.id, foodId));

    const [updatedFood] = await db
        .select({
            id: food.id,
            name: food.name,
            nameAr: food.nameAr,
            nameFr: food.nameFr,
            group_note_id: food.group_note_id,
        })
        .from(food)
        .where(eq(food.id, foodId))
        .limit(1);

    return SuccessResponse(res, {
        message: noteGroupId
            ? "Note group assigned to food successfully"
            : "Note group unassigned from food successfully",
        data: {
            ...updatedFood,
            noteGroup: noteGroupData,
        },
    });
};
