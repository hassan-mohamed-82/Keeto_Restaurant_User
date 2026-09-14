"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toggleNoteItemStatus = exports.deleteNoteItem = exports.updateNoteItem = exports.getNoteItemById = exports.getAllNoteItems = exports.createNoteItem = void 0;
exports.formatSingleNoteItem = formatSingleNoteItem;
const connection_1 = require("../../../models/connection");
const schema_1 = require("../../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../../utils/response");
const Errors_1 = require("../../../Errors");
const uuid_1 = require("uuid");
const localization_helper_1 = require("../../../helpers/localization.helper");
function formatSingleNoteItem(item, lang = "en") {
    if (!item)
        return null;
    return {
        ...item,
        name: (0, localization_helper_1.getLocalizedName)(item, lang),
        nameAr: item.nameAr ?? null,
        nameFr: item.nameFr ?? null,
        group: item.group
            ? {
                id: item.group.id,
                name: (0, localization_helper_1.getLocalizedName)(item.group, lang),
                nameAr: item.group.nameAr ?? null,
                nameFr: item.group.nameFr ?? null,
                status: item.group.status,
            }
            : null,
    };
}
// ==========================================
// 1. Create Note Item
// ==========================================
const createNoteItem = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
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
    // Verify parent group exists and belongs to this restaurant
    const [group] = await connection_1.db
        .select()
        .from(schema_1.noteGroups)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.noteGroups.id, groupId), (0, drizzle_orm_1.eq)(schema_1.noteGroups.restaurantId, restaurantId)))
        .limit(1);
    if (!group) {
        throw new Errors_1.NotFound("Parent note group not found or unauthorized");
    }
    const id = (0, uuid_1.v4)();
    const finalStatus = status || "active";
    await connection_1.db.insert(schema_1.noteItems).values({
        id,
        restaurantId,
        group_note_id: groupId,
        name: name.trim(),
        nameAr: nameAr ? nameAr.trim() : null,
        nameFr: nameFr ? nameFr.trim() : null,
        status: finalStatus,
    });
    const [createdItem] = await connection_1.db
        .select()
        .from(schema_1.noteItems)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.noteItems.id, id), (0, drizzle_orm_1.eq)(schema_1.noteItems.restaurantId, restaurantId)))
        .limit(1);
    const lang = (0, localization_helper_1.extractLang)(req);
    return (0, response_1.SuccessResponse)(res, {
        message: "Note item created successfully",
        data: formatSingleNoteItem({
            ...createdItem,
            group,
        }, lang),
    }, 201);
};
exports.createNoteItem = createNoteItem;
// ==========================================
// 2. Get All Note Items (scoped to restaurantId, filter by noteGroup, search & pagination)
// ==========================================
const getAllNoteItems = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
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
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.noteItems.restaurantId, restaurantId)];
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
    const whereClause = (0, drizzle_orm_1.and)(...conditions);
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
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.noteGroups.id, groupIds), (0, drizzle_orm_1.eq)(schema_1.noteGroups.restaurantId, restaurantId)));
        const groupMap = new Map();
        for (const g of groups) {
            groupMap.set(g.id, g);
        }
        enrichedItems = itemsList.map((item) => ({
            ...item,
            group: groupMap.get(item.group_note_id) || null,
        }));
    }
    const lang = (0, localization_helper_1.extractLang)(req);
    const formattedItems = enrichedItems.map((item) => formatSingleNoteItem(item, lang));
    return (0, response_1.SuccessResponse)(res, {
        message: "Note items fetched successfully",
        data: formattedItems,
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
// 3. Get Note Item By ID (scoped to restaurantId)
// ==========================================
const getNoteItemById = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [item] = await connection_1.db
        .select()
        .from(schema_1.noteItems)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.noteItems.id, id), (0, drizzle_orm_1.eq)(schema_1.noteItems.restaurantId, restaurantId)))
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
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.noteGroups.id, item.group_note_id), (0, drizzle_orm_1.eq)(schema_1.noteGroups.restaurantId, restaurantId)))
        .limit(1);
    const lang = (0, localization_helper_1.extractLang)(req);
    return (0, response_1.SuccessResponse)(res, {
        message: "Note item fetched successfully",
        data: formatSingleNoteItem({
            ...item,
            group: group || null,
        }, lang),
    });
};
exports.getNoteItemById = getNoteItemById;
// ==========================================
// 4. Update Note Item (scoped to restaurantId)
// ==========================================
const updateNoteItem = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const { name, nameAr, nameFr, status } = req.body;
    const newGroupId = req.body.group_note_id ||
        req.body.note_group_id ||
        req.body.groupNoteId ||
        req.body.groupId;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.noteItems)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.noteItems.id, id), (0, drizzle_orm_1.eq)(schema_1.noteItems.restaurantId, restaurantId)))
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
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.noteGroups.id, newGroupId), (0, drizzle_orm_1.eq)(schema_1.noteGroups.restaurantId, restaurantId)))
            .limit(1);
        if (!targetGroup) {
            throw new Errors_1.NotFound("Target note group not found or unauthorized");
        }
        updateFields.group_note_id = newGroupId;
    }
    if (Object.keys(updateFields).length > 0) {
        await connection_1.db
            .update(schema_1.noteItems)
            .set(updateFields)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.noteItems.id, id), (0, drizzle_orm_1.eq)(schema_1.noteItems.restaurantId, restaurantId)));
    }
    const [updatedItem] = await connection_1.db
        .select()
        .from(schema_1.noteItems)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.noteItems.id, id), (0, drizzle_orm_1.eq)(schema_1.noteItems.restaurantId, restaurantId)))
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
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.noteGroups.id, updatedItem.group_note_id), (0, drizzle_orm_1.eq)(schema_1.noteGroups.restaurantId, restaurantId)))
        .limit(1);
    const lang = (0, localization_helper_1.extractLang)(req);
    return (0, response_1.SuccessResponse)(res, {
        message: "Note item updated successfully",
        data: formatSingleNoteItem({
            ...updatedItem,
            group: group || null,
        }, lang),
    });
};
exports.updateNoteItem = updateNoteItem;
// ==========================================
// 5. Delete Note Item (scoped to restaurantId)
// ==========================================
const deleteNoteItem = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.noteItems)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.noteItems.id, id), (0, drizzle_orm_1.eq)(schema_1.noteItems.restaurantId, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Note item not found");
    }
    await connection_1.db
        .delete(schema_1.noteItems)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.noteItems.id, id), (0, drizzle_orm_1.eq)(schema_1.noteItems.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: "Note item deleted successfully",
    });
};
exports.deleteNoteItem = deleteNoteItem;
// ==========================================
// 6. Toggle Note Item Status (scoped to restaurantId)
// ==========================================
const toggleNoteItemStatus = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.noteItems)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.noteItems.id, id), (0, drizzle_orm_1.eq)(schema_1.noteItems.restaurantId, restaurantId)))
        .limit(1);
    if (!existing) {
        throw new Errors_1.NotFound("Note item not found");
    }
    const newStatus = existing.status === "active" ? "inactive" : "active";
    await connection_1.db
        .update(schema_1.noteItems)
        .set({ status: newStatus })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.noteItems.id, id), (0, drizzle_orm_1.eq)(schema_1.noteItems.restaurantId, restaurantId)));
    return (0, response_1.SuccessResponse)(res, {
        message: `Note item status changed to ${newStatus}`,
        data: {
            id,
            status: newStatus,
        },
    });
};
exports.toggleNoteItemStatus = toggleNoteItemStatus;
