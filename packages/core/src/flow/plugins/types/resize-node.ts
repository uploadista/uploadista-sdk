import { z } from "zod";

export const resizeParamsSchema = z
  .object({
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    fit: z.enum(["contain", "cover", "fill"]),
  })
  .refine(
    (data) => data.width || data.height,
    "Either width or height must be specified for resize",
  );

export type ResizeParams = z.infer<typeof resizeParamsSchema>;
