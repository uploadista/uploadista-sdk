import { z } from "zod";

export const mergePdfParamsSchema = z.object({
  inputCount: z.number().positive().optional(),
});

export type MergePdfParams = z.infer<typeof mergePdfParamsSchema>;
