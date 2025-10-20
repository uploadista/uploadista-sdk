import { z } from "zod";

export const mergeParamsSchema = z.object({
  strategy: z.enum(["concat", "batch"]).default("batch"),
  separator: z.string().default("\n").optional(),
  inputCount: z.number().min(2).max(10).default(2),
});

export type MergeParams = z.infer<typeof mergeParamsSchema>;
