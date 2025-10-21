import { z } from "zod";

/**
 * Zod schema for validating remove background node parameters.
 * Defines the structure and validation rules for background removal requests.
 */
export const removeBackgroundParamsSchema = z.object({
  /** Optional service type to use for background removal (currently supports "replicate") */
  serviceType: z.enum(["replicate"]).optional(),
});

/**
 * Parameters for the remove background node.
 * Controls which AI service to use for background removal processing.
 */
export type RemoveBackgroundParams = z.infer<
  typeof removeBackgroundParamsSchema
>;
