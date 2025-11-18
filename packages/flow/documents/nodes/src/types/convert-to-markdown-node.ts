import { z } from "zod";

export const convertToMarkdownParamsSchema = z.object({
  credentialId: z.string().optional(),
  resolution: z
    .enum(["tiny", "small", "base", "gundam", "large"])
    .optional(),
});

export type ConvertToMarkdownParams = z.infer<
  typeof convertToMarkdownParamsSchema
>;
