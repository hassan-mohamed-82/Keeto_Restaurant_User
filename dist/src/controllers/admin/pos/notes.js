"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignNoteGroupToFood = exports.toggleNoteGroupStatus = exports.deleteNoteGroup = exports.updateNoteGroup = exports.getNoteGroupById = exports.getAllNoteGroups = exports.createNoteGroup = void 0;
const connection_1 = require("../../../models/connection");
const schema_1 = require("../../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../../utils/response");
const Errors_1 = require("../../../Errors");
const uuid_1 = require("uuid");
// ==========================================
// 1. Create Note Group (with optional noteItems)
// ==========================================
const createNoteGroup = async (req, res) => {
    const { name, nameAr, nameFr, status, noteItems: incomingItems } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
        throw new Errors_1.BadRequest("Note group name is required");
    }
    const groupId = (0, uuid_1.v4)();
    const finalStatus = status || "active";
    const createdData = await connection_1.db.transaction(async (tx) => {
        // 1. Insert note group
        await tx.insert(schema_1.noteGroups).values({
            id: groupId,
            name: name.trim(),
            nameAr: nameAr ? nameAr.trim() : null,
            nameFr: nameFr ? nameFr.trim() : null,
            status: finalStatus,
        });
        // 2. Insert items if provided
        const insertedItems = [];
        if (Array.isArray(incomingItems) && incomingItems.length > 0) {
            for (const item of incomingItems) {
                if (!item.name || typeof item.name !== "string" || !item.name.trim())
                    continue;
                const itemId = (0, uuid_1.v4)();
                const itemRecord = {
                    id: itemId,
                    group_note_id: groupId,
                    name: item.name.trim(),
                    nameAr: item.nameAr ? item.nameAr.trim() : null,
                    nameFr: item.nameFr ? item.nameFr.trim() : null,
                    status: item.status || "active",
                };
                await tx.insert(schema_1.noteItems).values(itemRecord);
                insertedItems.push(itemRecord);
            }
        }
        const [group] = await tx
            .select()
            .from(schema_1.noteGroups)
            .where((0, drizzle_orm_1.eq)(schema_1.noteGroups.id, groupId))
            .limit(1);
        return {
            ...group,
            items: insertedItems,
        };
    });
    return (0, response_1.SuccessResponse)(res, {
        message: "Note group created successfully",
        data: createdData,
    }, 201);
};
exports.createNoteGroup = createNoteGroup;
// ==========================================
// 2. Get All Note Groups (with search, pagination & items)
// ==========================================
const getAllNoteGroups = async (req, res) => {
    const page = Math.max(1, parseInt((req.query.page || req.body?.page || "1"), 10));
    const limit = Math.max(1, Math.min(100, parseInt((req.query.limit || req.body?.limit || "20"), 10)));
    const offset = (page - 1) * limit;
    const search = (req.query.search || req.body?.search || "");
    const status = (req.query.status || req.body?.status);
    const conditions = [];
    if (search.trim()) {
        const searchPattern = `%${search.trim()}%`;
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(schema_1.noteGroups.name, searchPattern), (0, drizzle_orm_1.like)(schema_1.noteGroups.nameAr, searchPattern), (0, drizzle_orm_1.like)(schema_1.noteGroups.nameFr, searchPattern)));
    }
    if (status && status !== "all" && (status === "active" || status === "inactive")) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.noteGroups.status, status));
    }
    const whereClause = conditions.length > 0 ? drizzle_orm_1.sql.join(conditions, (0, drizzle_orm_1.sql) ` AND `) : undefined;
    // Count total
    const [totalCount] = await connection_1.db
        .select({ value: (0, drizzle_orm_1.count)() })
        .from(schema_1.noteGroups)
        .where(whereClause);
    const total = Number(totalCount?.value || 0);
    // Fetch groups
    const groupsList = await connection_1.db
        .select()
        .from(schema_1.noteGroups)
        .where(whereClause)
        .orderBy((0, drizzle_orm_1.desc)(schema_1.noteGroups.createdAt))
        .limit(limit)
        .offset(offset);
    // Enrich groups with their items
    let enrichedGroups = groupsList.map((g) => ({ ...g, items: [] }));
    if (groupsList.length > 0) {
        const groupIds = groupsList.map((g) => g.id);
        const allItems = await connection_1.db
            .select()
            .from(schema_1.noteItems)
            .where((0, drizzle_orm_1.inArray)(schema_1.noteItems.group_note_id, groupIds))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.noteItems.createdAt));
        const itemsMap = new Map();
        for (const it of allItems) {
            if (!itemsMap.has(it.group_note_id)) {
                itemsMap.set(it.group_note_id, []);
            }
            itemsMap.get(it.group_note_id).push(it);
        }
        enrichedGroups = groupsList.map((g) => ({
            ...g,
            items: itemsMap.get(g.id) || [],
        }));
    }
    return (0, response_1.SuccessResponse)(res, {
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
exports.getAllNoteGroups = getAllNoteGroups;
// ==========================================
// 3. Get Note Group By ID
// ==========================================
const getNoteGroupById = async (req, res) => {
    const { id } = req.params;
    const [group] = await connection_1.db
        .select()
        .from(schema_1.noteGroups)
        .where((0, drizzle_orm_1.eq)(schema_1.noteGroups.id, id))
        .limit(1);
    if (!group) {
        throw new Errors_1.NotFound("Note group not found");
    }
    const items = await connection_1.db
        .select()
        .from(schema_1.noteItems)
        .where((0, drizzle_orm_1.eq)(schema_1.noteItems.group_note_id, id))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.noteItems.createdAt));
    const [foodsCountRes] = await connection_1.db
        .select({ value: (0, drizzle_orm_1.count)() })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.eq)(schema_1.food.group_note_id, id));
    return (0, response_1.SuccessResponse)(res, {
        message: "Note group fetched successfully",
        data: {
            ...group,
            items,
            linkedFoodsCount: Number(foodsCountRes?.value || 0),
        },
    });
};
exports.getNoteGroupById = getNoteGroupById;
// ==========================================
// 4. Update Note Group (with optional noteItems sync)
// ==========================================
const updateNoteGroup = async (req, res) => {
    const { id } = req.params;
    const { name, nameAr, nameFr, status, noteItems: incomingItems } = req.body;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.noteGroups)
        .where((0, drizzle_orm_1.eq)(schema_1.noteGroups.id, id))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Note group not found");
    }
    const updatedData = await connection_1.db.transaction(async (tx) => {
        const updateFields = {};
        if (name !== undefined)
            updateFields.name = name.trim();
        if (nameAr !== undefined)
            updateFields.nameAr = nameAr ? nameAr.trim() : null;
        if (nameFr !== undefined)
            updateFields.nameFr = nameFr ? nameFr.trim() : null;
        if (status !== undefined)
            updateFields.status = status;
        if (Object.keys(updateFields).length > 0) {
            await tx.update(schema_1.noteGroups).set(updateFields).where((0, drizzle_orm_1.eq)(schema_1.noteGroups.id, id));
        }
        // Manage noteItems if provided
        if (Array.isArray(incomingItems)) {
            const existingItems = await tx
                .select()
                .from(schema_1.noteItems)
                .where((0, drizzle_orm_1.eq)(schema_1.noteItems.group_note_id, id));
            const existingItemIds = new Set(existingItems.map((i) => i.id));
            const incomingItemIds = new Set();
            for (const item of incomingItems) {
                if (!item.name || typeof item.name !== "string" || !item.name.trim())
                    continue;
                if (item.id && existingItemIds.has(item.id)) {
                    // Update existing item
                    incomingItemIds.add(item.id);
                    await tx
                        .update(schema_1.noteItems)
                        .set({
                        name: item.name.trim(),
                        nameAr: item.nameAr !== undefined ? (item.nameAr ? item.nameAr.trim() : null) : undefined,
                        nameFr: item.nameFr !== undefined ? (item.nameFr ? item.nameFr.trim() : null) : undefined,
                        status: item.status || "active",
                    })
                        .where((0, drizzle_orm_1.eq)(schema_1.noteItems.id, item.id));
                }
                else {
                    // Insert new item
                    const newItemId = (0, uuid_1.v4)();
                    incomingItemIds.add(newItemId);
                    await tx.insert(schema_1.noteItems).values({
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
                await tx.delete(schema_1.noteItems).where((0, drizzle_orm_1.inArray)(schema_1.noteItems.id, toDeleteIds));
            }
        }
        const [updatedGroup] = await tx
            .select()
            .from(schema_1.noteGroups)
            .where((0, drizzle_orm_1.eq)(schema_1.noteGroups.id, id))
            .limit(1);
        const currentItems = await tx
            .select()
            .from(schema_1.noteItems)
            .where((0, drizzle_orm_1.eq)(schema_1.noteItems.group_note_id, id))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.noteItems.createdAt));
        return {
            ...updatedGroup,
            items: currentItems,
        };
    });
    return (0, response_1.SuccessResponse)(res, {
        message: "Note group updated successfully",
        data: updatedData,
    });
};
exports.updateNoteGroup = updateNoteGroup;
// ==========================================
// 5. Delete Note Group
// ==========================================
const deleteNoteGroup = async (req, res) => {
    const { id } = req.params;
    const [group] = await connection_1.db
        .select()
        .from(schema_1.noteGroups)
        .where((0, drizzle_orm_1.eq)(schema_1.noteGroups.id, id))
        .limit(1);
    if (!group) {
        throw new Errors_1.NotFound("Note group not found");
    }
    await connection_1.db.transaction(async (tx) => {
        // Set null on foods referencing this group
        await tx.update(schema_1.food).set({ group_note_id: null }).where((0, drizzle_orm_1.eq)(schema_1.food.group_note_id, id));
        // Delete items
        await tx.delete(schema_1.noteItems).where((0, drizzle_orm_1.eq)(schema_1.noteItems.group_note_id, id));
        // Delete group
        await tx.delete(schema_1.noteGroups).where((0, drizzle_orm_1.eq)(schema_1.noteGroups.id, id));
    });
    return (0, response_1.SuccessResponse)(res, {
        message: "Note group deleted successfully",
    });
};
exports.deleteNoteGroup = deleteNoteGroup;
// ==========================================
// 6. Toggle Note Group Status
// ==========================================
const toggleNoteGroupStatus = async (req, res) => {
    const { id } = req.params;
    const [group] = await connection_1.db
        .select()
        .from(schema_1.noteGroups)
        .where((0, drizzle_orm_1.eq)(schema_1.noteGroups.id, id))
        .limit(1);
    if (!group) {
        throw new Errors_1.NotFound("Note group not found");
    }
    const newStatus = group.status === "active" ? "inactive" : "active";
    await connection_1.db
        .update(schema_1.noteGroups)
        .set({ status: newStatus })
        .where((0, drizzle_orm_1.eq)(schema_1.noteGroups.id, id));
    return (0, response_1.SuccessResponse)(res, {
        message: `Note group status changed to ${newStatus}`,
        data: {
            id,
            status: newStatus,
        },
    });
};
exports.toggleNoteGroupStatus = toggleNoteGroupStatus;
// ==========================================
// 7. Assign Note Group to Food
// ==========================================
const assignNoteGroupToFood = async (req, res) => {
    const foodId = req.body.food_id || req.body.foodId;
    const noteGroupId = req.body.note_group_id ?? req.body.noteGroupId ?? req.body.group_note_id ?? null;
    if (!foodId || typeof foodId !== "string") {
        throw new Errors_1.BadRequest("food_id is required");
    }
    // 1. Verify food exists
    const [targetFood] = await connection_1.db
        .select()
        .from(schema_1.food)
        .where((0, drizzle_orm_1.eq)(schema_1.food.id, foodId))
        .limit(1);
    if (!targetFood) {
        throw new Errors_1.NotFound("Food item not found");
    }
    // 2. If noteGroupId is provided and not null, verify noteGroup exists
    let noteGroupData = null;
    if (noteGroupId) {
        const [targetGroup] = await connection_1.db
            .select()
            .from(schema_1.noteGroups)
            .where((0, drizzle_orm_1.eq)(schema_1.noteGroups.id, noteGroupId))
            .limit(1);
        if (!targetGroup) {
            throw new Errors_1.NotFound("Note group not found");
        }
        noteGroupData = targetGroup;
    }
    // 3. Update group_note_id in food
    await connection_1.db
        .update(schema_1.food)
        .set({ group_note_id: noteGroupId })
        .where((0, drizzle_orm_1.eq)(schema_1.food.id, foodId));
    const [updatedFood] = await connection_1.db
        .select({
        id: schema_1.food.id,
        name: schema_1.food.name,
        nameAr: schema_1.food.nameAr,
        nameFr: schema_1.food.nameFr,
        group_note_id: schema_1.food.group_note_id,
    })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.eq)(schema_1.food.id, foodId))
        .limit(1);
    return (0, response_1.SuccessResponse)(res, {
        message: noteGroupId
            ? "Note group assigned to food successfully"
            : "Note group unassigned from food successfully",
        data: {
            ...updatedFood,
            noteGroup: noteGroupData,
        },
    });
};
exports.assignNoteGroupToFood = assignNoteGroupToFood;
