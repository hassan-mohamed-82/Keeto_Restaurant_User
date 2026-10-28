import { z } from "zod";

export const resolveDomainQuerySchema = z.object({
  host: z
    .string()
    .min(1)
    .transform((v) => v.trim().toLowerCase().replace(/:\d+$/, "")), // strip port
});
