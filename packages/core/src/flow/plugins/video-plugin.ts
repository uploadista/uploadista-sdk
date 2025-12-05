import { Context, type Effect, type Layer, type Stream } from "effect";
import type { UploadistaError } from "../../errors";
import type { DescribeVideoMetadata } from "./types/describe-video-node";
import type { ExtractFrameVideoParams } from "./types/extract-frame-video-node";
import type { ResizeVideoParams } from "./types/resize-video-node";
import type { TranscodeVideoParams } from "./types/transcode-video-node";
import type { TrimVideoParams } from "./types/trim-video-node";

/**
 * Input type for streaming video operations.
 * Accepts either buffered input (Uint8Array) or streaming input (Effect Stream).
 * Streaming input is only supported for specific formats like MPEG-TS.
 */
export type VideoStreamInput =
  | Uint8Array
  | Stream.Stream<Uint8Array, UploadistaError>;

/**
 * Options for streaming video operations.
 */
export type VideoStreamOptions = {
  /**
   * Hint for input format to help determine if streaming input is possible.
   * MPEG-TS format supports true streaming input; other formats require buffering.
   */
  inputFormat?: string;
};

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

  /**
   * Transcodes a video using streaming for memory-efficient processing of large files.
   *
   * This method outputs the transcoded video as a stream, reducing peak memory usage.
   * For input, it accepts either a buffered Uint8Array or a Stream. Streaming input
   * is only supported for MPEG-TS format; other formats will be buffered internally.
   *
   * @param input - The input video as Uint8Array or Stream (MPEG-TS only for streaming)
   * @param options - Transcode parameters including format, codec, and bitrates
   * @param streamOptions - Optional streaming configuration including input format hint
   * @returns An Effect that resolves to a Stream of the transcoded video bytes
   * @throws {UploadistaError} When video transcoding fails
   *
   * @example
   * ```typescript
   * const program = Effect.gen(function* () {
   *   const videoPlugin = yield* VideoPlugin;
   *   const inputStream = yield* dataStore.readStream(fileId);
   *   const outputStream = yield* videoPlugin.transcodeStream(inputStream, {
   *     format: "mp4",
   *     codec: "h264"
   *   }, { inputFormat: "video/mp2t" });
   *   return outputStream;
   * });
   * ```
   */
  transcodeStream?: (
    input: VideoStreamInput,
    options: TranscodeVideoParams,
    streamOptions?: VideoStreamOptions,
  ) => Effect.Effect<Stream.Stream<Uint8Array, UploadistaError>, UploadistaError>;

  /**
   * Resizes a video using streaming for memory-efficient processing of large files.
   *
   * This method outputs the resized video as a stream, reducing peak memory usage.
   * For input, it accepts either a buffered Uint8Array or a Stream. Streaming input
   * is only supported for MPEG-TS format; other formats will be buffered internally.
   *
   * @param input - The input video as Uint8Array or Stream (MPEG-TS only for streaming)
   * @param options - Resize parameters including width, height, and aspect ratio
   * @param streamOptions - Optional streaming configuration including input format hint
   * @returns An Effect that resolves to a Stream of the resized video bytes
   * @throws {UploadistaError} When video resizing fails
   *
   * @example
   * ```typescript
   * const program = Effect.gen(function* () {
   *   const videoPlugin = yield* VideoPlugin;
   *   const inputStream = yield* dataStore.readStream(fileId);
   *   const outputStream = yield* videoPlugin.resizeStream(inputStream, {
   *     width: 1280,
   *     height: 720,
   *     aspectRatio: "keep"
   *   });
   *   return outputStream;
   * });
   * ```
   */
  resizeStream?: (
    input: VideoStreamInput,
    options: ResizeVideoParams,
    streamOptions?: VideoStreamOptions,
  ) => Effect.Effect<Stream.Stream<Uint8Array, UploadistaError>, UploadistaError>;

  /**
   * Trims a video using streaming for memory-efficient processing of large files.
   *
   * This method outputs the trimmed video as a stream, reducing peak memory usage.
   * For input, it accepts either a buffered Uint8Array or a Stream. Streaming input
   * is only supported for MPEG-TS format; other formats will be buffered internally.
   *
   * @param input - The input video as Uint8Array or Stream (MPEG-TS only for streaming)
   * @param options - Trim parameters including start time and end time/duration
   * @param streamOptions - Optional streaming configuration including input format hint
   * @returns An Effect that resolves to a Stream of the trimmed video bytes
   * @throws {UploadistaError} When video trimming fails
   *
   * @example
   * ```typescript
   * const program = Effect.gen(function* () {
   *   const videoPlugin = yield* VideoPlugin;
   *   const inputStream = yield* dataStore.readStream(fileId);
   *   const outputStream = yield* videoPlugin.trimStream(inputStream, {
   *     startTime: 10,
   *     endTime: 30
   *   });
   *   return outputStream;
   * });
   * ```
   */
  trimStream?: (
    input: VideoStreamInput,
    options: TrimVideoParams,
    streamOptions?: VideoStreamOptions,
  ) => Effect.Effect<Stream.Stream<Uint8Array, UploadistaError>, UploadistaError>;

  /**
   * Indicates whether this plugin supports streaming operations.
   * Returns true if streaming methods are available and functional.
   */
  supportsStreaming?: boolean;
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
