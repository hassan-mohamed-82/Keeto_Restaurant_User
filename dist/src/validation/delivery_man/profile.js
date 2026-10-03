"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deliveryManUpdateProfileSchema = void 0;
const zod_1 = require("zod");
exports.deliveryManUpdateProfileSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, "Name cannot be empty").optional(),
    phone: zod_1.z.string().min(5, "Phone number must be at least 5 digits").optional(),
    email: zod_1.z.string().email("Invalid email format").optional().nullable(),
    image: zod_1.z.string().url("Invalid image URL").optional().nullable(),
    currentPassword: zod_1.z.string().optional(),
    newPassword: zod_1.z.string().min(6, "New password must be at least 6 characters").optional(),
}).refine((data) => {
    if (data.newPassword && !data.currentPassword) {
        return false;
    }
    return true;
}, {
    message: "Current password is required to set a new password",
    path: ["currentPassword"],
});
