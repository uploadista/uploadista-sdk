import {
  createTransformNode,
  type FileNamingConfig,
  type ResizeVideoParams,
  STORAGE_OUTPUT_TYPE_ID,
  type StreamingConfig,
  type TransformMode,
  VideoPlugin,
} from "@uploadista/core/flow";
import { Effect } from "effect";

// Default streaming config for video processing
const DEFAULT_VIDEO_STREAMING_CONFIG: StreamingConfig = {
  fileSizeThreshold: 10_000_000, // 10MB threshold for video
  chunkSize: 1_048_576, // 1MB chunks
};

/**
 * Creates a Resize video processing node
 *
 * Changes video resolution while optionally maintaining aspect ratio.
 *
 * Supports both buffered and streaming modes for memory-efficient processing
 * of large videos. In streaming mode, the output is streamed directly to storage,
 * reducing peak memory usage.
 *
 * @param id - Unique node identifier
 * @param params - Resize parameters
 * @param options - Optional configuration
 * @param options.keepOutput - Whether to keep output in flow results
 * @param options.naming - File naming configuration (auto suffix: `${width}x${height}`)
 * @param options.mode - Transform mode: "buffered", "streaming", or "auto" (default)
 * @param options.streamingConfig - Streaming configuration (file size threshold, chunk size)
 *
 * @example
 * ```typescript
 * // Auto mode (default) - uses streaming for files > 10MB, otherwise buffered
 * const node = yield* createVideoResizeNode("resize-1", {
 *   width: 1280,
 *   height: 720,
 *   aspectRatio: "keep",
 *   scaling: "bicubic"
 * }, {
 *   naming: { mode: "auto" }
 * });
 *
 * // Force buffered mode for small files
 * const nodeBuffered = yield* createVideoResizeNode("resize-2", {
 *   width: 1920,
 *   height: 1080
 * }, {
 *   mode: "buffered",
 *   naming: { mode: "auto" }
 * });
 *
 * // Force streaming mode for memory efficiency
 * const nodeStreaming = yield* createVideoResizeNode("resize-3", {
 *   width: 1280,
 *   height: 720
 * }, {
 *   mode: "streaming",
 *   naming: { mode: "auto" }
 * });
 * ```
 */
export function createVideoResizeNode(
  id: string,
  params: ResizeVideoParams,
  options?: {
    keepOutput?: boolean;
    naming?: FileNamingConfig;
    mode?: TransformMode;
    streamingConfig?: StreamingConfig;
  },
) {
  return Effect.gen(function* () {
    const videoService = yield* VideoPlugin;

    // Determine if streaming is available and requested
    const supportsStreaming = videoService.supportsStreaming ?? false;
    const requestedMode = options?.mode ?? "auto";

    // If streaming requested but not supported, fall back to buffered
    const effectiveMode: TransformMode =
      requestedMode === "buffered"
        ? "buffered"
        : supportsStreaming
          ? requestedMode
          : "buffered";

    // Use video-specific streaming config as default
    const streamingConfig: StreamingConfig = {
      ...DEFAULT_VIDEO_STREAMING_CONFIG,
      ...options?.streamingConfig,
    };

    // Build naming config with auto suffix for video resize
    const namingConfig: FileNamingConfig | undefined = options?.naming
      ? {
          ...options.naming,
          autoSuffix:
            options.naming.autoSuffix ??
            ((ctx) => `${ctx.width ?? params.width}x${ctx.height ?? params.height}`),
        }
      : undefined;

    return yield* createTransformNode({
      id,
      name: "Resize Video",
      description: "Changes video resolution",
      nodeTypeId: "resize-video",
      outputTypeId: STORAGE_OUTPUT_TYPE_ID,
      keepOutput: options?.keepOutput,
      naming: namingConfig,
      nodeType: "resize-video",
      namingVars: { width: params.width, height: params.height },
      mode: effectiveMode,
      streamingConfig,
      // Buffered transform
      transform: (inputBytes) =>
        Effect.map(videoService.resize(inputBytes, params), (resizedBytes) => ({
          bytes: resizedBytes,
        })),
      // Streaming transform
      streamingTransform: videoService.resizeStream
        ? (inputStream) =>
            Effect.gen(function* () {
              const resizeStreamFn = videoService.resizeStream;
              if (!resizeStreamFn) {
                throw new Error("resizeStream not available");
              }
              const outputStream = yield* resizeStreamFn(inputStream, params);
              return { stream: outputStream };
            })
        : undefined,
    });
  });
}
