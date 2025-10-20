import { z } from "zod";

export const removeBackgroundParamsSchema = z.object({
  serviceType: z.enum(["replicate"]).optional(),
});

export type RemoveBackgroundParams = z.infer<
  typeof removeBackgroundParamsSchema
>;
