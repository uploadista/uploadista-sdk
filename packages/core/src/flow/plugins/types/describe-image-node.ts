import { z } from "zod";

export const describeImageParamsSchema = z.object({
  serviceType: z.enum(["replicate"]).optional(),
});

export type DescribeImageParams = z.infer<typeof describeImageParamsSchema>;
