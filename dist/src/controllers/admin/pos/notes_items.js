"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toggleNoteItemStatus = exports.deleteNoteItem = exports.updateNoteItem = exports.getNoteItemById = exports.getAllNoteItems = exports.createNoteItem = void 0;
const connection_1 = require("../../../models/connection");
const schema_1 = require("../../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../../utils/response");
const Errors_1 = require("../../../Errors");
const uuid_1 = require("uuid");
// ==========================================
// 1. Create Note Item
// ==========================================
const createNoteItem = async (req, res) => {
    const groupId = req.body.group_note_id ||
        req.body.note_group_id ||
        req.body.groupNoteId ||
        req.body.groupId;
    const { name, nameAr, nameFr, status } = req.body;
    if (!groupId) {
        throw new Errors_1.BadRequest("group_note_id is required");
    }
    if (!name || typeof name !== "string" || !name.trim()) {
        throw new Errors_1.BadRequest("Item name is required");
    }
    // Verify parent group exists
    const [group] = await connection_1.db
        .select()
        .from(schema_1.noteGroups)
        .where((0, drizzle_orm_1.eq)(schema_1.noteGroups.id, groupId))
        .limit(1);
    if (!group) {
        throw new Errors_1.NotFound("Parent note group not found");
    }
    const id = (0, uuid_1.v4)();
    const finalStatus = status || "active";
    await connection_1.db.insert(schema_1.noteItems).values({
        id,
        group_note_id: groupId,
        name: name.trim(),
        nameAr: nameAr ? nameAr.trim() : null,
        nameFr: nameFr ? nameFr.trim() : null,
        status: finalStatus,
    });
    const [createdItem] = await connection_1.db
        .select()
        .from(schema_1.noteItems)
        .where((0, drizzle_orm_1.eq)(schema_1.noteItems.id, id))
        .limit(1);
    return (0, response_1.SuccessResponse)(res, {
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
    }, 201);
};
exports.createNoteItem = createNoteItem;
// ==========================================
// 2. Get All Note Items (with filter by noteGroup, search & pagination)
// ==========================================
const getAllNoteItems = async (req, res) => {
    const page = Math.max(1, parseInt((req.query.page || req.body?.page || "1"), 10));
    const limit = Math.max(1, Math.min(100, parseInt((req.query.limit || req.body?.limit || "20"), 10)));
    const offset = (page - 1) * limit;
    // Filter by noteGroup from query, params or body
    const groupId = (req.query.group_note_id ||
        req.query.note_group_id ||
        req.query.groupId ||
        req.params.group_id ||
        req.body?.group_note_id ||
        req.body?.note_group_id);
    const search = (req.query.search || req.body?.search || "");
    const status = (req.query.status || req.body?.status);
    const conditions = [];
    if (groupId && groupId.trim()) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.noteItems.group_note_id, groupId.trim()));
    }
    if (search.trim()) {
        const searchPattern = `%${search.trim()}%`;
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(schema_1.noteItems.name, searchPattern), (0, drizzle_orm_1.like)(schema_1.noteItems.nameAr, searchPattern), (0, drizzle_orm_1.like)(schema_1.noteItems.nameFr, searchPattern)));
    }
    if (status && status !== "all" && (status === "active" || status === "inactive")) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.noteItems.status, status));
    }
    const whereClause = conditions.length > 0 ? drizzle_orm_1.sql.join(conditions, (0, drizzle_orm_1.sql) ` AND `) : undefined;
    // Count total
    const [totalCount] = await connection_1.db
        .select({ value: (0, drizzle_orm_1.count)() })
        .from(schema_1.noteItems)
        .where(whereClause);
    const total = Number(totalCount?.value || 0);
    // Fetch items
    const itemsList = await connection_1.db
        .select()
        .from(schema_1.noteItems)
        .where(whereClause)
        .orderBy((0, drizzle_orm_1.desc)(schema_1.noteItems.createdAt))
        .limit(limit)
        .offset(offset);
    // Enrich with group info
    let enrichedItems = itemsList.map((item) => ({ ...item, group: null }));
    if (itemsList.length > 0) {
        const groupIds = Array.from(new Set(itemsList.map((i) => i.group_note_id)));
        const groups = await connection_1.db
            .select({
            id: schema_1.noteGroups.id,
            name: schema_1.noteGroups.name,
            nameAr: schema_1.noteGroups.nameAr,
            nameFr: schema_1.noteGroups.nameFr,
            status: schema_1.noteGroups.status,
        })
            .from(schema_1.noteGroups)
            .where((0, drizzle_orm_1.inArray)(schema_1.noteGroups.id, groupIds));
        const groupMap = new Map();
        for (const g of groups) {
            groupMap.set(g.id, g);
        }
        enrichedItems = itemsList.map((item) => ({
            ...item,
            group: groupMap.get(item.group_note_id) || null,
        }));
    }
    return (0, response_1.SuccessResponse)(res, {
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
exports.getAllNoteItems = getAllNoteItems;
// ==========================================
// 3. Get Note Item By ID
// ==========================================
const getNoteItemById = async (req, res) => {
    const { id } = req.params;
    const [item] = await connection_1.db
        .select()
        .from(schema_1.noteItems)
        .where((0, drizzle_orm_1.eq)(schema_1.noteItems.id, id))
        .limit(1);
    if (!item) {
        throw new Errors_1.NotFound("Note item not found");
    }
    const [group] = await connection_1.db
        .select({
        id: schema_1.noteGroups.id,
        name: schema_1.noteGroups.name,
        nameAr: schema_1.noteGroups.nameAr,
        nameFr: schema_1.noteGroups.nameFr,
        status: schema_1.noteGroups.status,
    })
        .from(schema_1.noteGroups)
        .where((0, drizzle_orm_1.eq)(schema_1.noteGroups.id, item.group_note_id))
        .limit(1);
    return (0, response_1.SuccessResponse)(res, {
        message: "Note item fetched successfully",
        data: {
            ...item,
            group: group || null,
        },
    });
};
exports.getNoteItemById = getNoteItemById;
// ==========================================
// 4. Update Note Item
// ==========================================
const updateNoteItem = async (req, res) => {
    const { id } = req.params;
    const { name, nameAr, nameFr, status } = req.body;
    const newGroupId = req.body.group_note_id ||
        req.body.note_group_id ||
        req.body.groupNoteId ||
        req.body.groupId;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.noteItems)
        .where((0, drizzle_orm_1.eq)(schema_1.noteItems.id, id))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Note item not found");
    }
    const updateFields = {};
    if (name !== undefined)
        updateFields.name = name.trim();
    if (nameAr !== undefined)
        updateFields.nameAr = nameAr ? nameAr.trim() : null;
    if (nameFr !== undefined)
        updateFields.nameFr = nameFr ? nameFr.trim() : null;
    if (status !== undefined)
        updateFields.status = status;
    if (newGroupId && newGroupId !== existing.group_note_id) {
        const [targetGroup] = await connection_1.db
            .select()
            .from(schema_1.noteGroups)
            .where((0, drizzle_orm_1.eq)(schema_1.noteGroups.id, newGroupId))
            .limit(1);
        if (!targetGroup) {
            throw new Errors_1.NotFound("Target note group not found");
        }
        updateFields.group_note_id = newGroupId;
    }
    if (Object.keys(updateFields).length > 0) {
        await connection_1.db.update(schema_1.noteItems).set(updateFields).where((0, drizzle_orm_1.eq)(schema_1.noteItems.id, id));
    }
    const [updatedItem] = await connection_1.db
        .select()
        .from(schema_1.noteItems)
        .where((0, drizzle_orm_1.eq)(schema_1.noteItems.id, id))
        .limit(1);
    const [group] = await connection_1.db
        .select({
        id: schema_1.noteGroups.id,
        name: schema_1.noteGroups.name,
        nameAr: schema_1.noteGroups.nameAr,
        nameFr: schema_1.noteGroups.nameFr,
        status: schema_1.noteGroups.status,
    })
        .from(schema_1.noteGroups)
        .where((0, drizzle_orm_1.eq)(schema_1.noteGroups.id, updatedItem.group_note_id))
        .limit(1);
    return (0, response_1.SuccessResponse)(res, {
        message: "Note item updated successfully",
        data: {
            ...updatedItem,
            group: group || null,
        },
    });
};
exports.updateNoteItem = updateNoteItem;
// ==========================================
// 5. Delete Note Item
// ==========================================
const deleteNoteItem = async (req, res) => {
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.noteItems)
        .where((0, drizzle_orm_1.eq)(schema_1.noteItems.id, id))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Note item not found");
    }
    await connection_1.db.delete(schema_1.noteItems).where((0, drizzle_orm_1.eq)(schema_1.noteItems.id, id));
    return (0, response_1.SuccessResponse)(res, {
        message: "Note item deleted successfully",
    });
};
exports.deleteNoteItem = deleteNoteItem;
// ==========================================
// 6. Toggle Note Item Status
// ==========================================
const toggleNoteItemStatus = async (req, res) => {
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.noteItems)
        .where((0, drizzle_orm_1.eq)(schema_1.noteItems.id, id))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Note item not found");
    }
    const newStatus = existing.status === "active" ? "inactive" : "active";
    await connection_1.db
        .update(schema_1.noteItems)
        .set({ status: newStatus })
        .where((0, drizzle_orm_1.eq)(schema_1.noteItems.id, id));
    return (0, response_1.SuccessResponse)(res, {
        message: `Note item status changed to ${newStatus}`,
        data: {
            id,
            status: newStatus,
        },
    });
};
exports.toggleNoteItemStatus = toggleNoteItemStatus;
