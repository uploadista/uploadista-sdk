import { UploadistaError } from "@uploadista/core/errors";
import {
  createTransformNode,
  type FileNamingConfig,
  STORAGE_OUTPUT_TYPE_ID,
  type StreamingConfig,
  type TransformMode,
  type TrimVideoParams,
  VideoPlugin,
} from "@uploadista/core/flow";
import { Effect } from "effect";

// Default streaming config for video processing
const DEFAULT_VIDEO_STREAMING_CONFIG: StreamingConfig = {
  fileSizeThreshold: 10_000_000, // 10MB threshold for video
  chunkSize: 1_048_576, // 1MB chunks
};

/**
 * Creates a Trim video processing node
 *
 * Extracts a segment from the video by time range.
 *
 * Supports both buffered and streaming modes for memory-efficient processing
 * of large videos. In streaming mode, the output is streamed directly to storage,
 * reducing peak memory usage.
 *
 * @param id - Unique node identifier
 * @param params - Trim parameters
 * @param options - Optional configuration
 * @param options.keepOutput - Whether to keep output in flow results
 * @param options.naming - File naming configuration (auto suffix: `trimmed`)
 * @param options.mode - Transform mode: "buffered", "streaming", or "auto" (default)
 * @param options.streamingConfig - Streaming configuration (file size threshold, chunk size)
 *
 * @example
 * ```typescript
 * // Auto mode (default) - uses streaming for files > 10MB, otherwise buffered
 * const node = yield* createTrimVideoNode("trim-1", {
 *   startTime: 10,
 *   endTime: 30
 * }, {
 *   naming: { mode: "auto" }
 * });
 *
 * // Force buffered mode for small files
 * const nodeBuffered = yield* createTrimVideoNode("trim-2", {
 *   startTime: 0,
 *   duration: 60
 * }, {
 *   mode: "buffered",
 *   naming: { mode: "auto" }
 * });
 *
 * // Force streaming mode for memory efficiency
 * const nodeStreaming = yield* createTrimVideoNode("trim-3", {
 *   startTime: 5,
 *   endTime: 25
 * }, {
 *   mode: "streaming",
 *   naming: { mode: "auto" }
 * });
 * ```
 */
export function createTrimVideoNode(
  id: string,
  params: TrimVideoParams,
  options?: {
    keepOutput?: boolean;
    naming?: FileNamingConfig;
    mode?: TransformMode;
    streamingConfig?: StreamingConfig;
  },
) {
  return Effect.gen(function* () {
    const videoService = yield* VideoPlugin;

    // Validate params
    if (params.endTime !== undefined && params.endTime <= params.startTime) {
      return yield* UploadistaError.fromCode("VALIDATION_ERROR", {
        body: "endTime must be greater than startTime",
        details: { params },
      }).toEffect();
    }

    if (
      params.duration !== undefined &&
      params.endTime !== undefined &&
      params.duration !== params.endTime - params.startTime
    ) {
      return yield* UploadistaError.fromCode("VALIDATION_ERROR", {
        body: "Cannot specify both endTime and duration with conflicting values",
        details: { params },
      }).toEffect();
    }

    if (params.duration !== undefined && params.duration <= 0) {
      return yield* UploadistaError.fromCode("VALIDATION_ERROR", {
        body: "duration must be greater than 0",
        details: { params },
      }).toEffect();
    }

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

    // Build naming config with auto suffix for trim
    const namingConfig: FileNamingConfig | undefined = options?.naming
      ? {
          ...options.naming,
          autoSuffix: options.naming.autoSuffix ?? (() => "trimmed"),
        }
      : undefined;

    return yield* createTransformNode({
      id,
      name: "Trim Video",
      description: "Extracts a segment from the video",
      nodeTypeId: "trim-video",
      outputTypeId: STORAGE_OUTPUT_TYPE_ID,
      keepOutput: options?.keepOutput,
      naming: namingConfig,
      nodeType: "trim",
      mode: effectiveMode,
      streamingConfig,
      // Buffered transform
      transform: (inputBytes) =>
        Effect.map(videoService.trim(inputBytes, params), (trimmedBytes) => ({
          bytes: trimmedBytes,
        })),
      // Streaming transform
      streamingTransform: videoService.trimStream
        ? (inputStream) =>
            Effect.gen(function* () {
              const trimStreamFn = videoService.trimStream;
              if (!trimStreamFn) {
                throw new Error("trimStream not available");
              }
              const outputStream = yield* trimStreamFn(inputStream, params);
              return { stream: outputStream };
            })
        : undefined,
    });
  });
}
