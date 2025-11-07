import { z } from "zod";

/**
 * Zod schema for video metadata extracted by the describe operation.
 * Defines the structure and validation rules for video metadata.
 */
export const describeVideoMetadataSchema = z.object({
  /** Video duration in seconds */
  duration: z.number().nonnegative(),
  /** Video width in pixels */
  width: z.number().positive(),
  /** Video height in pixels */
  height: z.number().positive(),
  /** Video codec name */
  codec: z.string(),
  /** Container format name */
  format: z.string(),
  /** Video bitrate in bits per second */
  bitrate: z.number().nonnegative(),
  /** Frame rate (fps) */
  frameRate: z.number().positive(),
  /** Aspect ratio as string (e.g., "16:9") */
  aspectRatio: z.string(),
  /** Whether video has an audio track */
  hasAudio: z.boolean(),
  /** Audio codec name (if hasAudio is true) */
  audioCodec: z.string().optional(),
  /** Audio bitrate in bits per second (if hasAudio is true) */
  audioBitrate: z.number().nonnegative().optional(),
  /** File size in bytes */
  size: z.number().nonnegative(),
});

/**
 * Video metadata extracted by the describe operation.
 * Contains comprehensive information about video properties, codecs, and audio.
 */
export type DescribeVideoMetadata = z.infer<typeof describeVideoMetadataSchema>;
