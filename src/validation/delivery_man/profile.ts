import { z } from "zod";

export const deliveryManUpdateProfileSchema = z.object({
    name: z.string().min(1, "Name cannot be empty").optional(),
    phone: z.string().min(5, "Phone number must be at least 5 digits").optional(),
    email: z.string().email("Invalid email format").optional().nullable(),
    image: z.string().url("Invalid image URL").optional().nullable(),
    currentPassword: z.string().optional(),
    newPassword: z.string().min(6, "New password must be at least 6 characters").optional(),
}).refine((data) => {
    if (data.newPassword && !data.currentPassword) {
        return false;
    }
    return true;
}, {
    message: "Current password is required to set a new password",
    path: ["currentPassword"],
});

export type DeliveryManUpdateProfileInput = z.infer<typeof deliveryManUpdateProfileSchema>;
