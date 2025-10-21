import { z } from "zod";

/**
 * Zod schema for validating image optimization parameters.
 * Defines the structure and validation rules for image optimization requests.
 */
export const optimizeParamsSchema = z.object({
  /** Image quality as a percentage (0-100) */
  quality: z.number().min(0).max(100),
  /** Output image format */
  format: z.enum(["jpeg", "webp", "png", "avif"] as const),
});

/**
 * Parameters for the image optimization node.
 * Controls quality and format settings for image optimization.
 */
export type OptimizeParams = z.infer<typeof optimizeParamsSchema>;
