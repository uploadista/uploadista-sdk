import { z } from "zod";

export const optimizeParamsSchema = z.object({
  quality: z.number().min(0).max(100),
  format: z.enum(["jpeg", "webp", "png", "avif"] as const),
});

export type OptimizeParams = z.infer<typeof optimizeParamsSchema>;
