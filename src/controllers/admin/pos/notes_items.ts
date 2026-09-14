import { Request, Response } from "express";
import { db } from "../../../models/connection";
import { noteGroups, noteItems } from "../../../models/schema";
import { eq, desc, or, like, count, sql, inArray } from "drizzle-orm";
import { SuccessResponse } from "../../../utils/response";
import { BadRequest, NotFound } from "../../../Errors";
import { v4 as uuidv4 } from "uuid";

// ==========================================
// 1. Create Note Item
// ==========================================
export const createNoteItem = async (req: Request, res: Response) => {
    const groupId =
        req.body.group_note_id ||
        req.body.note_group_id ||
        req.body.groupNoteId ||
        req.body.groupId;
    const { name, nameAr, nameFr, status } = req.body;

    if (!groupId) {
        throw new BadRequest("group_note_id is required");
    }

    if (!name || typeof name !== "string" || !name.trim()) {
        throw new BadRequest("Item name is required");
    }

    // Verify parent group exists
    const [group] = await db
        .select()
        .from(noteGroups)
        .where(eq(noteGroups.id, groupId))
        .limit(1);

    if (!group) {
        throw new NotFound("Parent note group not found");
    }

    const id = uuidv4();
    const finalStatus = status || "active";

    await db.insert(noteItems).values({
        id,
        group_note_id: groupId,
        name: name.trim(),
        nameAr: nameAr ? nameAr.trim() : null,
        nameFr: nameFr ? nameFr.trim() : null,
        status: finalStatus,
    });

    const [createdItem] = await db
        .select()
        .from(noteItems)
        .where(eq(noteItems.id, id))
        .limit(1);

    return SuccessResponse(
        res,
        {
            message: "Note item created successfully",
            data: {
                ...createdItem,
                group: {
                    id: group.id,
                    name: group.name,
                    nameAr: group.nameAr,
                    nameFr: group.nameFr,
                },
            },
        },
        201
    );
};

// ==========================================
// 2. Get All Note Items (with filter by noteGroup, search & pagination)
// ==========================================
export const getAllNoteItems = async (req: Request, res: Response) => {
    const page = Math.max(1, parseInt((req.query.page || req.body?.page || "1") as string, 10));
    const limit = Math.max(1, Math.min(100, parseInt((req.query.limit || req.body?.limit || "20") as string, 10)));
    const offset = (page - 1) * limit;

    // Filter by noteGroup from query, params or body
    const groupId = (req.query.group_note_id ||
        req.query.note_group_id ||
        req.query.groupId ||
        req.params.group_id ||
        req.body?.group_note_id ||
        req.body?.note_group_id) as string | undefined;

    const search = (req.query.search || req.body?.search || "") as string;
    const status = (req.query.status || req.body?.status) as string;

    const conditions = [];

    if (groupId && groupId.trim()) {
        conditions.push(eq(noteItems.group_note_id, groupId.trim()));
    }

    if (search.trim()) {
        const searchPattern = `%${search.trim()}%`;
        conditions.push(
            or(
                like(noteItems.name, searchPattern),
                like(noteItems.nameAr, searchPattern),
                like(noteItems.nameFr, searchPattern)
            )
        );
    }

    if (status && status !== "all" && (status === "active" || status === "inactive")) {
        conditions.push(eq(noteItems.status, status));
    }

    const whereClause = conditions.length > 0 ? sql.join(conditions, sql` AND `) : undefined;

    // Count total
    const [totalCount] = await db
        .select({ value: count() })
        .from(noteItems)
        .where(whereClause);

    const total = Number(totalCount?.value || 0);

    // Fetch items
    const itemsList = await db
        .select()
        .from(noteItems)
        .where(whereClause)
        .orderBy(desc(noteItems.createdAt))
        .limit(limit)
        .offset(offset);

    // Enrich with group info
    let enrichedItems = itemsList.map((item) => ({ ...item, group: null as any }));
    if (itemsList.length > 0) {
        const groupIds = Array.from(new Set(itemsList.map((i) => i.group_note_id)));
        const groups = await db
            .select({
                id: noteGroups.id,
                name: noteGroups.name,
                nameAr: noteGroups.nameAr,
                nameFr: noteGroups.nameFr,
                status: noteGroups.status,
            })
            .from(noteGroups)
            .where(inArray(noteGroups.id, groupIds));

        const groupMap = new Map<string, any>();
        for (const g of groups) {
            groupMap.set(g.id, g);
        }

        enrichedItems = itemsList.map((item) => ({
            ...item,
            group: groupMap.get(item.group_note_id) || null,
        }));
    }

    return SuccessResponse(res, {
        message: "Note items fetched successfully",
        data: enrichedItems,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit) || 1,
        },
    });
};

// ==========================================
// 3. Get Note Item By ID
// ==========================================
export const getNoteItemById = async (req: Request, res: Response) => {
    const { id } = req.params;

    const [item] = await db
        .select()
        .from(noteItems)
        .where(eq(noteItems.id, id))
        .limit(1);

    if (!item) {
        throw new NotFound("Note item not found");
    }

    const [group] = await db
        .select({
            id: noteGroups.id,
            name: noteGroups.name,
            nameAr: noteGroups.nameAr,
            nameFr: noteGroups.nameFr,
            status: noteGroups.status,
        })
        .from(noteGroups)
        .where(eq(noteGroups.id, item.group_note_id))
        .limit(1);

    return SuccessResponse(res, {
        message: "Note item fetched successfully",
        data: {
            ...item,
            group: group || null,
        },
    });
};

// ==========================================
// 4. Update Note Item
// ==========================================
export const updateNoteItem = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, nameAr, nameFr, status } = req.body;
    const newGroupId =
        req.body.group_note_id ||
        req.body.note_group_id ||
        req.body.groupNoteId ||
        req.body.groupId;

    const [existing] = await db
        .select()
        .from(noteItems)
        .where(eq(noteItems.id, id))
        .limit(1);

    if (!existing) {
        throw new NotFound("Note item not found");
    }

    const updateFields: any = {};
    if (name !== undefined) updateFields.name = name.trim();
    if (nameAr !== undefined) updateFields.nameAr = nameAr ? nameAr.trim() : null;
    if (nameFr !== undefined) updateFields.nameFr = nameFr ? nameFr.trim() : null;
    if (status !== undefined) updateFields.status = status;

    if (newGroupId && newGroupId !== existing.group_note_id) {
        const [targetGroup] = await db
            .select()
            .from(noteGroups)
            .where(eq(noteGroups.id, newGroupId))
            .limit(1);

        if (!targetGroup) {
            throw new NotFound("Target note group not found");
        }
        updateFields.group_note_id = newGroupId;
    }

    if (Object.keys(updateFields).length > 0) {
        await db.update(noteItems).set(updateFields).where(eq(noteItems.id, id));
    }

    const [updatedItem] = await db
        .select()
        .from(noteItems)
        .where(eq(noteItems.id, id))
        .limit(1);

    const [group] = await db
        .select({
            id: noteGroups.id,
            name: noteGroups.name,
            nameAr: noteGroups.nameAr,
            nameFr: noteGroups.nameFr,
            status: noteGroups.status,
        })
        .from(noteGroups)
        .where(eq(noteGroups.id, updatedItem.group_note_id))
        .limit(1);

    return SuccessResponse(res, {
        message: "Note item updated successfully",
        data: {
            ...updatedItem,
            group: group || null,
        },
    });
};

// ==========================================
// 5. Delete Note Item
// ==========================================
export const deleteNoteItem = async (req: Request, res: Response) => {
    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(noteItems)
        .where(eq(noteItems.id, id))
        .limit(1);

    if (!existing) {
        throw new NotFound("Note item not found");
    }

    await db.delete(noteItems).where(eq(noteItems.id, id));

    return SuccessResponse(res, {
        message: "Note item deleted successfully",
    });
};

// ==========================================
// 6. Toggle Note Item Status
// ==========================================
export const toggleNoteItemStatus = async (req: Request, res: Response) => {
    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(noteItems)
        .where(eq(noteItems.id, id))
        .limit(1);

    if (!existing) {
        throw new NotFound("Note item not found");
    }

    const newStatus = existing.status === "active" ? "inactive" : "active";

    await db
        .update(noteItems)
        .set({ status: newStatus })
        .where(eq(noteItems.id, id));

    return SuccessResponse(res, {
        message: `Note item status changed to ${newStatus}`,
        data: {
            id,
            status: newStatus,
        },
    });
};
