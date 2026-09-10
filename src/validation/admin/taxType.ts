import { z } from "zod";

export const TAX_TYPE_ENUM = ["include", "exclude"] as const;
export type TaxTypeEnum = (typeof TAX_TYPE_ENUM)[number];

export const upsertTaxTypeSchema = z.object({
    type: z.enum(TAX_TYPE_ENUM, {
        required_error: "Type is required and must be either 'include' or 'exclude'",
        invalid_type_error: "Type must be either 'include' or 'exclude'",
    }),
    // Optional - if provided, controller strictly ensures it matches req.user.restaurantId
    restrauntid: z.string().optional(),
    restaurantId: z.string().optional(),
});

export type UpsertTaxTypeInput = z.infer<typeof upsertTaxTypeSchema>;
