import { z } from "zod";

/**
 * Zod schema for validating image resize parameters.
 * Defines the structure and validation rules for image resizing requests.
 * Requires at least one dimension (width or height) to be specified.
 */
export const resizeParamsSchema = z
  .object({
    /** Target width in pixels (optional) */
    width: z.number().positive().optional(),
    /** Target height in pixels (optional) */
    height: z.number().positive().optional(),
    /** How the image should fit within the specified dimensions */
    fit: z.enum(["contain", "cover", "fill"]),
  })
  .refine(
    (data) => data.width || data.height,
    "Either width or height must be specified for resize",
  );

/**
 * Parameters for the image resize node.
 * Controls the target dimensions and fitting behavior for image resizing.
 */
export type ResizeParams = z.infer<typeof resizeParamsSchema>;
