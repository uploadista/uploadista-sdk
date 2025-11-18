import { z } from "zod";

export const ocrParamsSchema = z.object({
  taskType: z.enum([
    "convertToMarkdown",
    "freeOcr",
    "parseFigure",
    "locateObject",
  ]),
  resolution: z
    .enum(["tiny", "small", "base", "gundam", "large"])
    .optional(),
  credentialId: z.string().optional(),
  referenceText: z.string().optional(),
});

export type OcrParams = z.infer<typeof ocrParamsSchema>;
