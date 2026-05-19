"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.togglePopupStatus = exports.deletePopup = exports.updatePopup = exports.getPopupById = exports.getAllPopups = exports.createPopup = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const NotFound_1 = require("../../Errors/NotFound");
const uuid_1 = require("uuid");
// ==========================================
// 1. Create Popup
// ==========================================
const createPopup = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const { Title, TitleAr, TitleFr, description, descriptionAr, descriptionFr, image, imageAr, imageFr, type, status, startDate, endDate } = req.body;
    if (!Title)
        throw new BadRequest_1.BadRequest("Popup title is required");
    if (!startDate || !endDate)
        throw new BadRequest_1.BadRequest("Start date and end date are required");
    const id = (0, uuid_1.v4)();
    await connection_1.db.insert(schema_1.popup).values({
        id,
        restaurantId,
        Title,
        TitleAr: TitleAr || null,
        TitleFr: TitleFr || null,
        description: description || null,
        descriptionAr: descriptionAr || null,
        descriptionFr: descriptionFr || null,
        image: image || null,
        imageAr: imageAr || null,
        imageFr: imageFr || null,
        type: type || "mykeeto_app",
        status: status || "active",
        startDate: new Date(startDate),
        endDate: new Date(endDate),
    });
    return (0, response_1.SuccessResponse)(res, { message: "Popup created successfully", data: { id } }, 201);
};
exports.createPopup = createPopup;
// ==========================================
// 2. Get All Popups (for this restaurant)
// ==========================================
const getAllPopups = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const allPopups = await connection_1.db
        .select()
        .from(schema_1.popup)
        .where((0, drizzle_orm_1.eq)(schema_1.popup.restaurantId, restaurantId));
    return (0, response_1.SuccessResponse)(res, { message: "Get all popups success", data: allPopups });
};
exports.getAllPopups = getAllPopups;
// ==========================================
// 3. Get Popup by ID
// ==========================================
const getPopupById = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.popup)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.popup.id, id), (0, drizzle_orm_1.eq)(schema_1.popup.restaurantId, restaurantId)))
        .limit(1);
    if (!existing)
        throw new NotFound_1.NotFound("Popup not found");
    return (0, response_1.SuccessResponse)(res, { message: "Get popup success", data: existing });
};
exports.getPopupById = getPopupById;
// ==========================================
// 4. Update Popup
// ==========================================
const updatePopup = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.popup)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.popup.id, id), (0, drizzle_orm_1.eq)(schema_1.popup.restaurantId, restaurantId)))
        .limit(1);
    if (!existing)
        throw new NotFound_1.NotFound("Popup not found");
    const { Title, TitleAr, TitleFr, description, descriptionAr, descriptionFr, image, imageAr, imageFr, type, status, startDate, endDate } = req.body;
    const updateData = { updatedAt: new Date() };
    if (Title !== undefined)
        updateData.Title = Title;
    if (TitleAr !== undefined)
        updateData.TitleAr = TitleAr;
    if (TitleFr !== undefined)
        updateData.TitleFr = TitleFr;
    if (description !== undefined)
        updateData.description = description;
    if (descriptionAr !== undefined)
        updateData.descriptionAr = descriptionAr;
    if (descriptionFr !== undefined)
        updateData.descriptionFr = descriptionFr;
    if (image !== undefined)
        updateData.image = image;
    if (imageAr !== undefined)
        updateData.imageAr = imageAr;
    if (imageFr !== undefined)
        updateData.imageFr = imageFr;
    if (type !== undefined)
        updateData.type = type;
    if (status !== undefined)
        updateData.status = status;
    if (startDate !== undefined)
        updateData.startDate = new Date(startDate);
    if (endDate !== undefined)
        updateData.endDate = new Date(endDate);
    await connection_1.db.update(schema_1.popup).set(updateData).where((0, drizzle_orm_1.eq)(schema_1.popup.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Popup updated successfully" });
};
exports.updatePopup = updatePopup;
// ==========================================
// 5. Delete Popup
// ==========================================
const deletePopup = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.popup)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.popup.id, id), (0, drizzle_orm_1.eq)(schema_1.popup.restaurantId, restaurantId)))
        .limit(1);
    if (!existing)
        throw new NotFound_1.NotFound("Popup not found");
    await connection_1.db.delete(schema_1.popup).where((0, drizzle_orm_1.eq)(schema_1.popup.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Popup deleted successfully" });
};
exports.deletePopup = deletePopup;
// ==========================================
// 6. Toggle Popup Status
// ==========================================
const togglePopupStatus = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.popup)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.popup.id, id), (0, drizzle_orm_1.eq)(schema_1.popup.restaurantId, restaurantId)))
        .limit(1);
    if (!existing)
        throw new NotFound_1.NotFound("Popup not found");
    const newStatus = existing.status === "active" ? "inactive" : "active";
    await connection_1.db.update(schema_1.popup)
        .set({ status: newStatus, updatedAt: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.popup.id, id));
    return (0, response_1.SuccessResponse)(res, {
        message: `Popup ${newStatus === "active" ? "activated" : "deactivated"} successfully`,
        data: { status: newStatus }
    });
};
exports.togglePopupStatus = togglePopupStatus;
