import {
  applyFileNaming,
  buildNamingContext,
  createTransformNode,
  type FileNamingConfig,
  getBaseName,
  STORAGE_OUTPUT_TYPE_ID,
  type StreamingConfig,
  type TranscodeVideoParams,
  type TransformMode,
  VideoPlugin,
} from "@uploadista/core/flow";
import { Effect } from "effect";

// Default streaming config for video processing
const DEFAULT_VIDEO_STREAMING_CONFIG: StreamingConfig = {
  fileSizeThreshold: 10_000_000, // 10MB threshold for video
  chunkSize: 1_048_576, // 1MB chunks
};

// Map video format to MIME type
const formatToMimeType: Record<TranscodeVideoParams["format"], string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
};

// Map video format to file extension
const formatToExtension: Record<TranscodeVideoParams["format"], string> = {
  mp4: "mp4",
  webm: "webm",
  mov: "mov",
  avi: "avi",
};

/**
 * Creates a Transcode video processing node
 *
 * Converts video to specified format and codec, optionally adjusting bitrates.
 *
 * Supports both buffered and streaming modes for memory-efficient processing
 * of large videos. In streaming mode, the output is streamed directly to storage,
 * reducing peak memory usage.
 *
 * @param id - Unique node identifier
 * @param params - Transcode parameters
 * @param options - Optional configuration
 * @param options.keepOutput - Whether to keep output in flow results
 * @param options.naming - File naming configuration (auto suffix: `${format}`)
 * @param options.mode - Transform mode: "buffered", "streaming", or "auto" (default)
 * @param options.streamingConfig - Streaming configuration (file size threshold, chunk size)
 *
 * @example
 * ```typescript
 * // Auto mode (default) - uses streaming for files > 10MB, otherwise buffered
 * const node = yield* createTranscodeVideoNode("transcode-1", {
 *   format: "webm",
 *   codec: "vp9",
 *   videoBitrate: "1000k"
 * }, {
 *   naming: { mode: "auto" }
 * });
 *
 * // Force buffered mode for small files
 * const nodeBuffered = yield* createTranscodeVideoNode("transcode-2", {
 *   format: "mp4",
 *   codec: "h264"
 * }, {
 *   mode: "buffered",
 *   naming: { mode: "auto" }
 * });
 *
 * // Force streaming mode for memory efficiency
 * const nodeStreaming = yield* createTranscodeVideoNode("transcode-3", {
 *   format: "mp4",
 *   codec: "h264"
 * }, {
 *   mode: "streaming",
 *   naming: { mode: "auto" }
 * });
 * ```
 */
export function createTranscodeVideoNode(
  id: string,
  params: TranscodeVideoParams,
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

    // Helper to build output metadata
    const buildOutputMetadata = (file: {
      metadata?: Record<string, unknown>;
      flow?: { flowId?: string; jobId?: string };
    }) => {
      const newType = formatToMimeType[params.format];
      const newExtension = formatToExtension[params.format];

      const fileName = file.metadata?.fileName;
      let newFileName: string | undefined;

      if (fileName && typeof fileName === "string") {
        if (options?.naming) {
          const namingConfig: FileNamingConfig = {
            ...options.naming,
            autoSuffix:
              options.naming.autoSuffix ?? ((ctx) => ctx.format ?? params.format),
          };
          const namingContext = buildNamingContext(
            file as Parameters<typeof buildNamingContext>[0],
            {
              flowId: file.flow?.flowId ?? "",
              jobId: file.flow?.jobId ?? "",
              nodeId: id,
              nodeType: "transcode",
            },
            { format: params.format },
          );
          const namedFile = applyFileNaming(
            file as Parameters<typeof applyFileNaming>[0],
            namingContext,
            namingConfig,
          );
          newFileName = `${getBaseName(namedFile)}.${newExtension}`;
        } else {
          newFileName = fileName.replace(/\.[^.]+$/, `.${newExtension}`);
        }
      }

      return { newType, newFileName };
    };

    return yield* createTransformNode({
      id,
      name: "Transcode",
      description: "Converts video to specified format and codec",
      nodeTypeId: "transcode-video",
      outputTypeId: STORAGE_OUTPUT_TYPE_ID,
      keepOutput: options?.keepOutput,
      nodeType: "transcode",
      namingVars: { format: params.format },
      mode: effectiveMode,
      streamingConfig,
      // Buffered transform
      transform: (inputBytes, file) =>
        Effect.map(
          videoService.transcode(inputBytes, params),
          (transcodedBytes) => {
            const { newType, newFileName } = buildOutputMetadata(file);
            return {
              bytes: transcodedBytes,
              type: newType,
              fileName: newFileName,
            };
          },
        ),
      // Streaming transform
      streamingTransform: videoService.transcodeStream
        ? (inputStream, file) =>
            Effect.gen(function* () {
              const transcodeStreamFn = videoService.transcodeStream;
              if (!transcodeStreamFn) {
                throw new Error("transcodeStream not available");
              }
              const outputStream = yield* transcodeStreamFn(inputStream, params);
              const { newType, newFileName } = buildOutputMetadata(file);
              return {
                stream: outputStream,
                type: newType,
                fileName: newFileName,
              };
            })
        : undefined,
    });
  });
}
