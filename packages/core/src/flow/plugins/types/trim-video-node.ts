import { z } from "zod";

/**
 * Zod schema for validating video trim parameters.
 * Defines the structure and validation rules for extracting video segments.
 */
export const trimVideoParamsSchema = z
  .object({
    /** Start time in seconds */
    startTime: z.number().nonnegative(),
    /** End time in seconds (optional, if omitted goes to end) */
    endTime: z.number().positive().optional(),
    /** Duration in seconds (alternative to endTime) */
    duration: z.number().positive().optional(),
  })
  .refine(
    (data) => !data.endTime || !data.duration,
    "Cannot specify both endTime and duration",
  )
  .refine(
    (data) => !data.endTime || data.endTime > data.startTime,
    "endTime must be greater than startTime",
  );

/**
 * Parameters for the video trim node.
 * Controls the time range for extracting video segments.
 */
export type TrimVideoParams = z.infer<typeof trimVideoParamsSchema>;
