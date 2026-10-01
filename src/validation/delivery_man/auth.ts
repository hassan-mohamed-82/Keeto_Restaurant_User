import { z } from "zod";

export const deliveryManLoginSchema = z.object({
    identifier: z
        .string({ required_error: "Identifier (phone or email) is required" })
        .min(1, "Identifier cannot be empty"),
    password: z
        .string({ required_error: "Password is required" })
        .min(1, "Password cannot be empty"),
    fcmToken: z.string().optional().nullable(),
});

export const deliveryManLogoutSchema = z.object({
    fcmToken: z.string().optional().nullable(),
});

export type DeliveryManLoginInput = z.infer<typeof deliveryManLoginSchema>;
export type DeliveryManLogoutInput = z.infer<typeof deliveryManLogoutSchema>;
