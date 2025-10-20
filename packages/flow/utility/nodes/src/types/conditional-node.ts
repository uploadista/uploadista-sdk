import { z } from "zod";

export const conditionalParamsSchema = z.object({
  field: z.enum(["mimeType", "size", "width", "height", "extension"]),
  operator: z.enum([
    "equals",
    "notEquals",
    "greaterThan",
    "lessThan",
    "contains",
    "startsWith",
  ]),
  value: z.union([z.string(), z.number()]),
});

export type ConditionalParams = z.infer<typeof conditionalParamsSchema>;
