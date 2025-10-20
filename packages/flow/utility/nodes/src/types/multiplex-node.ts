import { z } from "zod";

export const multiplexParamsSchema = z.object({
  outputCount: z.number().min(1).max(10),
  strategy: z.enum(["copy", "split"]).default("copy"),
});

export type MultiplexParams = z.infer<typeof multiplexParamsSchema>;
