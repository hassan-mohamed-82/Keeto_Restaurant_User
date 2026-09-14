"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignNoteGroupToFood = exports.toggleNoteGroupStatus = exports.deleteNoteGroup = exports.updateNoteGroup = exports.getNoteGroupById = exports.getAllNoteGroups = exports.createNoteGroup = void 0;
exports.formatNoteItem = formatNoteItem;
exports.formatNoteGroup = formatNoteGroup;
const connection_1 = require("../../../models/connection");
const schema_1 = require("../../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../../utils/response");
const Errors_1 = require("../../../Errors");
const uuid_1 = require("uuid");
const localization_helper_1 = require("../../../helpers/localization.helper");
function formatNoteItem(item, lang = "en") {
    if (!item)
        return null;
    return {
        ...item,
        name: (0, localization_helper_1.getLocalizedName)(item, lang),
        nameAr: item.nameAr ?? null,
        nameFr: item.nameFr ?? null,
    };
}
function formatNoteGroup(group, lang = "en") {
    if (!group)
        return null;
    return {
        ...group,
        name: (0, localization_helper_1.getLocalizedName)(group, lang),
        nameAr: group.nameAr ?? null,
        nameFr: group.nameFr ?? null,
        items: Array.isArray(group.items) ? group.items.map((it) => formatNoteItem(it, lang)) : [],
    };
}
// ==========================================
// 1. Create Note Group (with optional noteItems)
// ==========================================
const createNoteGroup = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { name, nameAr, nameFr, status, noteItems: incomingItems } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
        throw new Errors_1.BadRequest("Note group name is required");
    }
    const groupId = (0, uuid_1.v4)();
    const finalStatus = status || "active";
    const createdData = await connection_1.db.transaction(async (tx) => {
        // 1. Insert note group with restaurantId
        await tx.insert(schema_1.noteGroups).values({
            id: groupId,
            restaurantId,
            name: name.trim(),
            nameAr: nameAr ? nameAr.trim() : null,
            nameFr: nameFr ? nameFr.trim() : null,
            status: finalStatus,
        });
        // 2. Insert items if provided with restaurantId
        const insertedItems = [];
        if (Array.isArray(incomingItems) && incomingItems.length > 0) {
            for (const item of incomingItems) {
                if (!item.name || typeof item.name !== "string" || !item.name.trim())
                    continue;
                const itemId = (0, uuid_1.v4)();
                const itemRecord = {
                    id: itemId,
                    restaurantId,
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
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.noteGroups.id, groupId), (0, drizzle_orm_1.eq)(schema_1.noteGroups.restaurantId, restaurantId)))
            .limit(1);
        return {
            ...group,
            items: insertedItems,
        };
    });
    const lang = (0, localization_helper_1.extractLang)(req);
    return (0, response_1.SuccessResponse)(res, {
        message: "Note group created successfully",
        data: formatNoteGroup(createdData, lang),
    }, 201);
};
exports.createNoteGroup = createNoteGroup;
// ==========================================
// 2. Get All Note Groups (scoped to restaurantId)
// ==========================================
const getAllNoteGroups = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const page = Math.max(1, parseInt((req.query.page || req.body?.page || "1"), 10));
    const limit = Math.max(1, Math.min(100, parseInt((req.query.limit || req.body?.limit || "20"), 10)));
    const offset = (page - 1) * limit;
    const search = (req.query.search || req.body?.search || "");
    const status = (req.query.status || req.body?.status);
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.noteGroups.restaurantId, restaurantId)];
    if (search.trim()) {
        const searchPattern = `%${search.trim()}%`;
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(schema_1.noteGroups.name, searchPattern), (0, drizzle_orm_1.like)(schema_1.noteGroups.nameAr, searchPattern), (0, drizzle_orm_1.like)(schema_1.noteGroups.nameFr, searchPattern)));
    }
    if (status && status !== "all" && (status === "active" || status === "inactive")) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.noteGroups.status, status));
    }
    const whereClause = (0, drizzle_orm_1.and)(...conditions);
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
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.noteItems.group_note_id, groupIds), (0, drizzle_orm_1.eq)(schema_1.noteItems.restaurantId, restaurantId)))
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
    const lang = (0, localization_helper_1.extractLang)(req);
    const formattedGroups = enrichedGroups.map((g) => formatNoteGroup(g, lang));
    return (0, response_1.SuccessResponse)(res, {
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
exports.getAllNoteGroups = getAllNoteGroups;
// ==========================================
// 3. Get Note Group By ID
// ==========================================
const getNoteGroupById = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [group] = await connection_1.db
        .select()
        .from(schema_1.noteGroups)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.noteGroups.id, id), (0, drizzle_orm_1.eq)(schema_1.noteGroups.restaurantId, restaurantId)))
        .limit(1);
    if (!group) {
        throw new Errors_1.NotFound("Note group not found");
    }
    const items = await connection_1.db
        .select()
        .from(schema_1.noteItems)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.noteItems.group_note_id, id), (0, drizzle_orm_1.eq)(schema_1.noteItems.restaurantId, restaurantId)))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.noteItems.createdAt));
    const [foodsCountRes] = await connection_1.db
        .select({ value: (0, drizzle_orm_1.count)() })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.group_note_id, id), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)));
    const lang = (0, localization_helper_1.extractLang)(req);
    const formattedGroup = formatNoteGroup({ ...group, items }, lang);
    return (0, response_1.SuccessResponse)(res, {
        message: "Note group fetched successfully",
        data: {
            ...formattedGroup,
            linkedFoodsCount: Number(foodsCountRes?.value || 0),
        },
    });
};
exports.getNoteGroupById = getNoteGroupById;
// ==========================================
// 4. Update Note Group (scoped to restaurantId)
// ==========================================
const updateNoteGroup = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const { name, nameAr, nameFr, status, noteItems: incomingItems } = req.body;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.noteGroups)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.noteGroups.id, id), (0, drizzle_orm_1.eq)(schema_1.noteGroups.restaurantId, restaurantId)))
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
            await tx
                .update(schema_1.noteGroups)
                .set(updateFields)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.noteGroups.id, id), (0, drizzle_orm_1.eq)(schema_1.noteGroups.restaurantId, restaurantId)));
        }
        // Manage noteItems if provided
        if (Array.isArray(incomingItems)) {
            const existingItems = await tx
                .select()
                .from(schema_1.noteItems)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.noteItems.group_note_id, id), (0, drizzle_orm_1.eq)(schema_1.noteItems.restaurantId, restaurantId)));
            const existingItemIds = new Set(existingItems.map((i) => i.id));
            const incomingItemIds = new Set();
            for (const item of incomingItems) {
                if (!item.name || typeof item.name !== "string" || !item.name.trim())
                    continue;
                if (item.id && existingItemIds.has(item.id)) {
                    // Update existing item belonging to this restaurant
                    incomingItemIds.add(item.id);
                    await tx
                        .update(schema_1.noteItems)
                        .set({
                        name: item.name.trim(),
                        nameAr: item.nameAr !== undefined ? (item.nameAr ? item.nameAr.trim() : null) : undefined,
                        nameFr: item.nameFr !== undefined ? (item.nameFr ? item.nameFr.trim() : null) : undefined,
                        status: item.status || "active",
                    })
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.noteItems.id, item.id), (0, drizzle_orm_1.eq)(schema_1.noteItems.restaurantId, restaurantId)));
                }
                else {
                    // Insert new item with restaurantId
                    const newItemId = (0, uuid_1.v4)();
                    incomingItemIds.add(newItemId);
                    await tx.insert(schema_1.noteItems).values({
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
                    .delete(schema_1.noteItems)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.noteItems.id, toDeleteIds), (0, drizzle_orm_1.eq)(schema_1.noteItems.restaurantId, restaurantId)));
            }
        }
        const [updatedGroup] = await tx
            .select()
            .from(schema_1.noteGroups)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.noteGroups.id, id), (0, drizzle_orm_1.eq)(schema_1.noteGroups.restaurantId, restaurantId)))
            .limit(1);
        const currentItems = await tx
            .select()
            .from(schema_1.noteItems)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.noteItems.group_note_id, id), (0, drizzle_orm_1.eq)(schema_1.noteItems.restaurantId, restaurantId)))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.noteItems.createdAt));
        return {
            ...updatedGroup,
            items: currentItems,
        };
    });
    const lang = (0, localization_helper_1.extractLang)(req);
    return (0, response_1.SuccessResponse)(res, {
        message: "Note group updated successfully",
        data: formatNoteGroup(updatedData, lang),
    });
};
exports.updateNoteGroup = updateNoteGroup;
// ==========================================
// 5. Delete Note Group (scoped to restaurantId)
// ==========================================
const deleteNoteGroup = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [group] = await connection_1.db
        .select()
        .from(schema_1.noteGroups)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.noteGroups.id, id), (0, drizzle_orm_1.eq)(schema_1.noteGroups.restaurantId, restaurantId)))
        .limit(1);
    if (!group) {
        throw new Errors_1.NotFound("Note group not found");
    }
    await connection_1.db.transaction(async (tx) => {
        // Set null on foods referencing this group belonging to this restaurant
        await tx
            .update(schema_1.food)
            .set({ group_note_id: null })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.group_note_id, id), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)));
        // Delete items belonging to this restaurant
        await tx
            .delete(schema_1.noteItems)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.noteItems.group_note_id, id), (0, drizzle_orm_1.eq)(schema_1.noteItems.restaurantId, restaurantId)));
        // Delete group
        await tx
            .delete(schema_1.noteGroups)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.noteGroups.id, id), (0, drizzle_orm_1.eq)(schema_1.noteGroups.restaurantId, restaurantId)));
    });
    return (0, response_1.SuccessResponse)(res, {
        message: "Note group deleted successfully",
    });
};
exports.deleteNoteGroup = deleteNoteGroup;
// ==========================================
// 6. Toggle Note Group Status (scoped to restaurantId)
// ==========================================
const toggleNoteGroupStatus = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [group] = await connection_1.db
        .select()
        .from(schema_1.noteGroups)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.noteGroups.id, id), (0, drizzle_orm_1.eq)(schema_1.noteGroups.restaurantId, restaurantId)))
        .limit(1);
    if (!group) {
        throw new Errors_1.NotFound("Note group not found");
    }
    const newStatus = group.status === "active" ? "inactive" : "active";
    await connection_1.db
        .update(schema_1.noteGroups)
        .set({ status: newStatus })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.noteGroups.id, id), (0, drizzle_orm_1.eq)(schema_1.noteGroups.restaurantId, restaurantId)));
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
// 7. Assign Note Group to Food (scoped to restaurantId)
// ==========================================
const assignNoteGroupToFood = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const foodId = req.body.food_id || req.body.foodId;
    const noteGroupId = req.body.note_group_id ?? req.body.noteGroupId ?? req.body.group_note_id ?? null;
    if (!foodId || typeof foodId !== "string") {
        throw new Errors_1.BadRequest("food_id is required");
    }
    // 1. Verify food exists and belongs to this restaurant
    const [targetFood] = await connection_1.db
        .select()
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, foodId), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)))
        .limit(1);
    if (!targetFood) {
        throw new Errors_1.NotFound("Food item not found or unauthorized");
    }
    // 2. If noteGroupId is provided and not null, verify noteGroup exists and belongs to this restaurant
    let noteGroupData = null;
    if (noteGroupId) {
        const [targetGroup] = await connection_1.db
            .select()
            .from(schema_1.noteGroups)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.noteGroups.id, noteGroupId), (0, drizzle_orm_1.eq)(schema_1.noteGroups.restaurantId, restaurantId)))
            .limit(1);
        if (!targetGroup) {
            throw new Errors_1.NotFound("Note group not found or unauthorized");
        }
        noteGroupData = targetGroup;
    }
    // 3. Update group_note_id in food
    await connection_1.db
        .update(schema_1.food)
        .set({ group_note_id: noteGroupId })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, foodId), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)));
    const [updatedFood] = await connection_1.db
        .select({
        id: schema_1.food.id,
        name: schema_1.food.name,
        nameAr: schema_1.food.nameAr,
        nameFr: schema_1.food.nameFr,
        group_note_id: schema_1.food.group_note_id,
    })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, foodId), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId)))
        .limit(1);
    const lang = (0, localization_helper_1.extractLang)(req);
    return (0, response_1.SuccessResponse)(res, {
        message: noteGroupId
            ? "Note group assigned to food successfully"
            : "Note group unassigned from food successfully",
        data: {
            ...updatedFood,
            name: (0, localization_helper_1.getLocalizedName)(updatedFood, lang),
            noteGroup: noteGroupData ? formatNoteGroup(noteGroupData, lang) : null,
        },
    });
};
exports.assignNoteGroupToFood = assignNoteGroupToFood;
