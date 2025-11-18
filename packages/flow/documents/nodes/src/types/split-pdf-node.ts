import { z } from "zod";

export const splitPdfParamsSchema = z.object({
  mode: z.enum(["range", "individual"]),
  startPage: z.number().positive().optional(),
  endPage: z.number().positive().optional(),
});

export type SplitPdfParams = z.infer<typeof splitPdfParamsSchema>;
