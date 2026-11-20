import { z } from "zod";

export const updateBranchVisaStatusSchema = z.object({
    visa_status: z.boolean({
        required_error: "visa_status is required",
        invalid_type_error: "visa_status must be a boolean",
    }),
});

export const updateAllBranchesVisaStatusSchema = z.object({
    visa_status: z.boolean({
        required_error: "visa_status is required",
        invalid_type_error: "visa_status must be a boolean",
    }),
});
