import { z } from "zod";

/**
 * Zod schema for validating video frame extraction parameters.
 * Defines the structure and validation rules for extracting a single frame from video.
 */
export const extractFrameVideoParamsSchema = z.object({
  /** Timestamp in seconds where to extract the frame */
  timestamp: z.number().nonnegative(),
  /** Output image format */
  format: z.enum(["png", "jpeg"]).optional(),
  /** JPEG quality 1-100 (only for jpeg format) */
  quality: z.number().min(1).max(100).optional(),
});

/**
 * Parameters for the video frame extraction node.
 * Controls the timestamp and output format for extracting a single frame from video.
 */
export type ExtractFrameVideoParams = z.infer<
  typeof extractFrameVideoParamsSchema
>;
