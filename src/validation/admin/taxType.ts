import { z } from "zod";

export const TAX_TYPE_ENUM = ["include", "exclude"] as const;
export type TaxTypeEnum = (typeof TAX_TYPE_ENUM)[number];

const normalizeTaxTypeInput = (obj: any) => {
    if (obj && typeof obj === "object") {
        if (obj.restrauntid === undefined && obj.restaurantId !== undefined) {
            obj.restrauntid = obj.restaurantId;
        } else if (obj.restaurantId === undefined && obj.restrauntid !== undefined) {
            obj.restaurantId = obj.restrauntid;
        }
    }
    return obj;
};

export const upsertTaxTypeSchema = z.preprocess(
    normalizeTaxTypeInput,
    z.object({
        restrauntid: z.string().min(1, "Restaurant ID must not be empty").optional(),
        restaurantId: z.string().min(1, "Restaurant ID must not be empty").optional(),
        type: z.enum(TAX_TYPE_ENUM, {
            required_error: "Type is required and must be either 'include' or 'exclude'",
            invalid_type_error: "Type must be either 'include' or 'exclude'",
        }),
    })
);

export const getTaxTypeParamsSchema = z.preprocess(
    normalizeTaxTypeInput,
    z.object({
        restrauntid: z.string().min(1, "Restaurant ID is required").optional(),
        restaurantId: z.string().min(1, "Restaurant ID is required").optional(),
    })
);

export type UpsertTaxTypeInput = z.infer<typeof upsertTaxTypeSchema>;
