import { z } from "zod";

export const inputFileSchema = z.object({
  uploadLengthDeferred: z.boolean().optional(),
  storageId: z.string(),
  size: z.number(),
  type: z.string(),
  fileName: z.string().optional(),
  lastModified: z.number().optional(),
  metadata: z.string().optional(),
  checksum: z.string().optional(),
  checksumAlgorithm: z.string().optional(),
  flow: z
    .object({
      flowId: z.string(),
      nodeId: z.string(),
      jobId: z.string(),
    })
    .optional(),
});

export type InputFile = z.infer<typeof inputFileSchema>;
