"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateAllBranchesVisaStatusSchema = exports.updateBranchVisaStatusSchema = void 0;
const zod_1 = require("zod");
exports.updateBranchVisaStatusSchema = zod_1.z.object({
    visa_status: zod_1.z.boolean({
        required_error: "visa_status is required",
        invalid_type_error: "visa_status must be a boolean",
    }),
});
exports.updateAllBranchesVisaStatusSchema = zod_1.z.object({
    visa_status: zod_1.z.boolean({
        required_error: "visa_status is required",
        invalid_type_error: "visa_status must be a boolean",
    }),
});
