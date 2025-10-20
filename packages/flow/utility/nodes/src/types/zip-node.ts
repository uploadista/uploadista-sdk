import { z } from "zod";

export const zipParamsSchema = z.object({
  zipName: z.string().default("archive.zip"),
  includeMetadata: z.boolean().default(false),
  inputCount: z.number().min(2).max(10).default(2),
});

export type ZipParams = z.infer<typeof zipParamsSchema>;
