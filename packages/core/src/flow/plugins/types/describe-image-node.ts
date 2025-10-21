import { z } from "zod";

/**
 * Zod schema for validating describe image node parameters.
 * Defines the structure and validation rules for image description requests.
 */
export const describeImageParamsSchema = z.object({
  /** Optional service type to use for image description (currently supports "replicate") */
  serviceType: z.enum(["replicate"]).optional(),
});

/**
 * Parameters for the describe image node.
 * Controls which AI service to use for generating image descriptions.
 */
export type DescribeImageParams = z.infer<typeof describeImageParamsSchema>;
