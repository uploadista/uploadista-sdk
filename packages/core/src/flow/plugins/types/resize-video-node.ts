import { z } from "zod";

/**
 * Zod schema for validating video resize parameters.
 * Defines the structure and validation rules for video resolution changes.
 * Requires at least one dimension (width or height) to be specified.
 */
export const resizeVideoParamsSchema = z
  .object({
    /** Target width in pixels */
    width: z.number().positive().optional(),
    /** Target height in pixels */
    height: z.number().positive().optional(),
    /** Aspect ratio handling mode */
    aspectRatio: z.enum(["keep", "ignore"]).optional(),
    /** Scaling algorithm quality */
    scaling: z.enum(["bicubic", "bilinear", "lanczos"]).optional(),
  })
  .refine(
    (data) => data.width || data.height,
    "Either width or height must be specified for video resize",
  );

/**
 * Parameters for the video resize node.
 * Controls the target dimensions and aspect ratio handling for video resizing.
 */
export type ResizeVideoParams = z.infer<typeof resizeVideoParamsSchema>;
