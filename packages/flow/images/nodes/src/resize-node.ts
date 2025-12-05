import {
  createTransformNode,
  type FileNamingConfig,
  ImagePlugin,
  type ResizeParams,
  STORAGE_OUTPUT_TYPE_ID,
  type StreamingConfig,
  type TransformMode,
} from "@uploadista/core/flow";
import { Effect } from "effect";

/**
 * Creates a resize node that resizes images to specified dimensions.
 *
 * Supports both buffered and streaming modes for memory-efficient processing
 * of large images. In streaming mode, the image is read and processed
 * incrementally, reducing peak memory usage.
 *
 * @param id - Unique node identifier
 * @param params - Resize parameters (width, height, fit)
 * @param options - Optional configuration
 * @param options.keepOutput - Whether to keep output in flow results
 * @param options.naming - File naming configuration (auto suffix: `${width}x${height}`)
 * @param options.mode - Transform mode: "buffered", "streaming", or "auto" (default)
 * @param options.streamingConfig - Streaming configuration (file size threshold, chunk size)
 *
 * @example
 * ```typescript
 * // Auto mode (default) - uses streaming for files > 1MB, otherwise buffered
 * const resize = yield* createResizeNode("resize-1", { width: 800, height: 600 }, {
 *   naming: { mode: "auto" }
 * });
 *
 * // Force buffered mode for small files
 * const resizeBuffered = yield* createResizeNode("resize-2", { width: 800, height: 600 }, {
 *   mode: "buffered",
 *   naming: { mode: "auto" }
 * });
 *
 * // Force streaming mode for memory efficiency
 * const resizeStreaming = yield* createResizeNode("resize-3", { width: 800, height: 600 }, {
 *   mode: "streaming",
 *   naming: { mode: "auto" }
 * });
 * ```
 */
export function createResizeNode(
  id: string,
  { width, height, fit }: ResizeParams,
  options?: {
    keepOutput?: boolean;
    naming?: FileNamingConfig;
    mode?: TransformMode;
    streamingConfig?: StreamingConfig;
  },
) {
  return Effect.gen(function* () {
    const imageService = yield* ImagePlugin;

    // Determine if streaming is available and requested
    const supportsStreaming = imageService.supportsStreaming ?? false;
    const requestedMode = options?.mode ?? "auto";

    // If streaming requested but not supported, fall back to buffered
    const effectiveMode: TransformMode =
      requestedMode === "buffered"
        ? "buffered"
        : supportsStreaming
          ? requestedMode
          : "buffered";

    // Build naming config with auto suffix for resize
    const namingConfig: FileNamingConfig | undefined = options?.naming
      ? {
          ...options.naming,
          // Provide default auto suffix generator for resize nodes
          autoSuffix:
            options.naming.autoSuffix ??
            ((ctx) => `${ctx.width ?? width}x${ctx.height ?? height}`),
        }
      : undefined;

    return yield* createTransformNode({
      id,
      name: "Resize",
      description: "Resizes an image to the specified dimensions",
      nodeTypeId: "resize-image",
      outputTypeId: STORAGE_OUTPUT_TYPE_ID,
      keepOutput: options?.keepOutput,
      naming: namingConfig,
      nodeType: "resize",
      namingVars: { width, height },
      mode: effectiveMode,
      streamingConfig: options?.streamingConfig,
      // Buffered transform (used when mode is "buffered" or "auto" selects buffered)
      transform: (inputBytes) =>
        imageService.resize(inputBytes, { height, width, fit }),
      // Streaming transform (used when mode is "streaming" or "auto" selects streaming)
      streamingTransform: imageService.resizeStream
        ? (inputStream) =>
            Effect.gen(function* () {
              const resizeStreamFn = imageService.resizeStream;
              if (!resizeStreamFn) {
                throw new Error("resizeStream not available");
              }
              const outputStream = yield* resizeStreamFn(inputStream, {
                width,
                height,
                fit,
              });
              return { stream: outputStream };
            })
        : undefined,
    });
  });
}
