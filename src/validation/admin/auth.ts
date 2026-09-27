import { z } from "zod";

export const loginSchema = z.object({
    email: z
        .string({ required_error: "Email is required" })
        .email("Invalid email format"),
    password: z
        .string({ required_error: "Password is required" })
        .min(1, "Password cannot be empty"),
    fcmToken: z.string().optional().nullable(),
});

export type LoginInput = z.infer<typeof loginSchema>;
