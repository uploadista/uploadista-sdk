import { z } from "zod";

/**
 * Zod schema for validating video transcode parameters.
 * Defines the structure and validation rules for video format and codec conversion.
 */
export const transcodeVideoParamsSchema = z.object({
  /** Output container format */
  format: z.enum(["mp4", "webm", "mov", "avi"]),
  /** Video codec (optional, defaults to format's default) */
  codec: z.enum(["h264", "h265", "vp9", "av1"]).optional(),
  /** Video bitrate (e.g., "1000k", "2M") */
  videoBitrate: z.string().optional(),
  /** Audio bitrate (e.g., "128k", "192k") */
  audioBitrate: z.string().optional(),
  /** Audio codec (optional, defaults to format's default) */
  audioCodec: z.enum(["aac", "mp3", "opus", "vorbis"]).optional(),
});

/**
 * Parameters for the video transcode node.
 * Controls output format, codecs, and quality settings for video transcoding.
 */
export type TranscodeVideoParams = z.infer<typeof transcodeVideoParamsSchema>;
