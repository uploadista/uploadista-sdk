import { Context, type Effect, type Layer } from "effect";
import type { UploadistaError } from "../../errors";
import type { DescribeVideoMetadata } from "./types/describe-video-node";
import type { ExtractFrameVideoParams } from "./types/extract-frame-video-node";
import type { ResizeVideoParams } from "./types/resize-video-node";
import type { TranscodeVideoParams } from "./types/transcode-video-node";
import type { TrimVideoParams } from "./types/trim-video-node";

/**
 * Shape definition for the Video Plugin interface.
 * Defines the contract that all video processing implementations must follow.
 */
export type VideoPluginShape = {
  /**
   * Transcodes a video to a different format/codec.
   *
   * @param input - The input video as a Uint8Array
   * @param options - Transcode parameters including format, codec, and bitrates
   * @returns An Effect that resolves to the transcoded video as a Uint8Array
   * @throws {UploadistaError} When video transcoding fails
   */
  transcode: (
    input: Uint8Array,
    options: TranscodeVideoParams,
  ) => Effect.Effect<Uint8Array, UploadistaError>;

  /**
   * Resizes a video to specified dimensions.
   *
   * @param input - The input video as a Uint8Array
   * @param options - Resize parameters including width, height, and aspect ratio handling
   * @returns An Effect that resolves to the resized video as a Uint8Array
   * @throws {UploadistaError} When video resizing fails
   */
  resize: (
    input: Uint8Array,
    options: ResizeVideoParams,
  ) => Effect.Effect<Uint8Array, UploadistaError>;

  /**
   * Trims a video to extract a segment by time range.
   *
   * @param input - The input video as a Uint8Array
   * @param options - Trim parameters including start time and end time/duration
   * @returns An Effect that resolves to the trimmed video as a Uint8Array
   * @throws {UploadistaError} When video trimming fails
   */
  trim: (
    input: Uint8Array,
    options: TrimVideoParams,
  ) => Effect.Effect<Uint8Array, UploadistaError>;

  /**
   * Extracts a single frame from the video at a specific timestamp.
   *
   * @param input - The input video as a Uint8Array
   * @param options - Frame extraction parameters including timestamp and format
   * @returns An Effect that resolves to the extracted frame as a Uint8Array (image)
   * @throws {UploadistaError} When frame extraction fails
   */
  extractFrame: (
    input: Uint8Array,
    options: ExtractFrameVideoParams,
  ) => Effect.Effect<Uint8Array, UploadistaError>;

  /**
   * Extracts metadata from a video file.
   *
   * @param input - The input video as a Uint8Array
   * @returns An Effect that resolves to VideoMetadata with comprehensive video information
   * @throws {UploadistaError} When metadata extraction fails
   */
  describe: (
    input: Uint8Array,
  ) => Effect.Effect<DescribeVideoMetadata, UploadistaError>;
};

/**
 * Context tag for the Video Plugin.
 *
 * This tag provides a type-safe way to access video processing functionality
 * throughout the application using Effect's dependency injection system.
 *
 * @example
 * ```typescript
 * import { VideoPlugin } from "@uploadista/core/flow/plugins";
 *
 * // In your flow node
 * const program = Effect.gen(function* () {
 *   const videoPlugin = yield* VideoPlugin;
 *   const transcoded = yield* videoPlugin.transcode(videoData, { format: "webm", codec: "vp9" });
 *   const resized = yield* videoPlugin.resize(transcoded, { width: 1280, height: 720, aspectRatio: "keep" });
 *   return resized;
 * });
 * ```
 */
export class VideoPlugin extends Context.Tag("VideoPlugin")<
  VideoPlugin,
  VideoPluginShape
>() {}

export type VideoPluginLayer = Layer.Layer<VideoPlugin, never, never>;
