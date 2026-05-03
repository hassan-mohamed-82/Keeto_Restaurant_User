"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPaymentMethod = exports.getPaymentMethods = exports.deletePaymentMethod = exports.updatePaymentMethod = exports.createPaymentMethod = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const Errors_1 = require("../../Errors");
const handleImages_1 = require("../../utils/handleImages");
const createPaymentMethod = async (req, res) => {
    const { name, image, description, type, isActive, nameAr, nameFr, descriptionAr, descriptionFr } = req.body;
    if (!name || !description || !type) {
        throw new Errors_1.BadRequest("Missing required fields");
    }
    let savedImage = image;
    if (image && image.startsWith("data:image")) {
        savedImage = await (0, handleImages_1.saveBase64Image)(image, req, "payment_methods");
    }
    const [paymentMethod] = await connection_1.db.insert(schema_1.paymentMethods).values({
        name,
        nameAr,
        nameFr,
        image: savedImage,
        description,
        descriptionAr,
        descriptionFr,
        type,
        isActive: isActive || true,
    });
    return (0, response_1.SuccessResponse)(res, { data: paymentMethod });
};
exports.createPaymentMethod = createPaymentMethod;
const updatePaymentMethod = async (req, res) => {
    const { id, name, image, description, type, isActive, nameAr, nameFr, descriptionAr, descriptionFr } = req.body;
    const updateData = {};
    const existing = await connection_1.db.select().from(schema_1.paymentMethods).where((0, drizzle_orm_1.eq)(schema_1.paymentMethods.id, id)).limit(1);
    if (name !== undefined)
        updateData.name = name;
    if (nameAr !== undefined)
        updateData.nameAr = nameAr;
    if (nameFr !== undefined)
        updateData.nameFr = nameFr;
    if (image && image.startsWith("data:image")) {
        updateData.image = await (0, handleImages_1.handleImageUpdate)(req, existing[0]?.image, image, "payment_methods");
    }
    else if (image !== undefined) {
        updateData.image = image;
    }
    if (description !== undefined)
        updateData.description = description;
    if (descriptionAr !== undefined)
        updateData.descriptionAr = descriptionAr;
    if (descriptionFr !== undefined)
        updateData.descriptionFr = descriptionFr;
    if (type !== undefined)
        updateData.type = type;
    if (isActive !== undefined)
        updateData.isActive = isActive;
    const [paymentMethod] = await connection_1.db.update(schema_1.paymentMethods).set(updateData).where((0, drizzle_orm_1.eq)(schema_1.paymentMethods.id, id));
    return (0, response_1.SuccessResponse)(res, { data: paymentMethod });
};
exports.updatePaymentMethod = updatePaymentMethod;
const deletePaymentMethod = async (req, res) => {
    const { id } = req.body;
    const [paymentMethod] = await connection_1.db.delete(schema_1.paymentMethods).where((0, drizzle_orm_1.eq)(schema_1.paymentMethods.id, id));
    return (0, response_1.SuccessResponse)(res, { data: paymentMethod });
};
exports.deletePaymentMethod = deletePaymentMethod;
const getPaymentMethods = async (req, res) => {
    const paymentMethod = await connection_1.db.select().from(schema_1.paymentMethods);
    return (0, response_1.SuccessResponse)(res, { data: paymentMethod });
};
exports.getPaymentMethods = getPaymentMethods;
const getPaymentMethod = async (req, res) => {
    const { id } = req.params;
    const [paymentMethod] = await connection_1.db.select().from(schema_1.paymentMethods).where((0, drizzle_orm_1.eq)(schema_1.paymentMethods.id, id));
    return (0, response_1.SuccessResponse)(res, { data: paymentMethod });
};
exports.getPaymentMethod = getPaymentMethod;
