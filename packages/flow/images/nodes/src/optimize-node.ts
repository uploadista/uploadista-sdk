import { UploadistaError } from "@uploadista/core";
import {
  applyFileNaming,
  buildNamingContext,
  createTransformNode,
  type FileNamingConfig,
  getBaseName,
  ImagePlugin,
  type OptimizeParams,
  STORAGE_OUTPUT_TYPE_ID,
  type StreamingConfig,
  type TransformMode,
} from "@uploadista/core/flow";
import { Effect } from "effect";

// Map image format to MIME type
const formatToMimeType: Record<OptimizeParams["format"], string> = {
  jpeg: "image/jpeg",
  webp: "image/webp",
  png: "image/png",
  avif: "image/avif",
};

// Map image format to file extension
const formatToExtension: Record<OptimizeParams["format"], string> = {
  jpeg: "jpg",
  webp: "webp",
  png: "png",
  avif: "avif",
};

/**
 * Creates an optimize node that optimizes images for web delivery.
 *
 * Supports both buffered and streaming modes for memory-efficient processing
 * of large images. In streaming mode, the image is read and processed
 * incrementally, reducing peak memory usage.
 *
 * @param id - Unique node identifier
 * @param params - Optimize parameters (quality, format)
 * @param options - Optional configuration
 * @param options.keepOutput - Whether to keep output in flow results
 * @param options.naming - File naming configuration (auto suffix: `${format}`)
 * @param options.mode - Transform mode: "buffered" (default), "streaming", or "auto"
 * @param options.streamingConfig - Streaming configuration (file size threshold, chunk size)
 *
 * @example
 * ```typescript
 * // Buffered mode (default) - "photo.jpg" -> "photo-webp.webp"
 * const optimize = yield* createOptimizeNode("opt-1", { quality: 80, format: "webp" }, {
 *   naming: { mode: "auto" }
 * });
 *
 * // Streaming mode for large files
 * const optimizeStreaming = yield* createOptimizeNode("opt-2", { quality: 80, format: "webp" }, {
 *   mode: "streaming",
 *   naming: { mode: "auto" }
 * });
 *
 * // Auto mode - uses streaming for files > 1MB
 * const optimizeAuto = yield* createOptimizeNode("opt-3", { quality: 80, format: "webp" }, {
 *   mode: "auto",
 *   streamingConfig: { fileSizeThreshold: 1_048_576 },
 *   naming: { mode: "auto" }
 * });
 * ```
 */
export function createOptimizeNode(
  id: string,
  { quality, format }: OptimizeParams,
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
    const requestedMode = options?.mode ?? "buffered";

    // If streaming requested but not supported, fall back to buffered
    const effectiveMode: TransformMode =
      requestedMode === "buffered"
        ? "buffered"
        : supportsStreaming
          ? requestedMode
          : "buffered";

    // Helper to build output metadata from optimized result
    const buildOutputMetadata = (file: {
      metadata?: Record<string, unknown>;
      flow?: { flowId?: string; jobId?: string };
    }) => {
      const newType = formatToMimeType[format];
      const newExtension = formatToExtension[format];

      // Get original fileName
      const fileName = file.metadata?.fileName;
      let newFileName: string | undefined;

      if (fileName && typeof fileName === "string") {
        // Apply naming if configured
        if (options?.naming) {
          const namingConfig: FileNamingConfig = {
            ...options.naming,
            autoSuffix:
              options.naming.autoSuffix ?? ((ctx) => ctx.format ?? format),
          };
          const namingContext = buildNamingContext(
            file as Parameters<typeof buildNamingContext>[0],
            {
              flowId: file.flow?.flowId ?? "",
              jobId: file.flow?.jobId ?? "",
              nodeId: id,
              nodeType: "optimize",
            },
            { format, quality },
          );
          // Apply naming to get base name with suffix
          const namedFile = applyFileNaming(
            file as Parameters<typeof applyFileNaming>[0],
            namingContext,
            namingConfig,
          );
          // Replace extension with new format extension
          newFileName = `${getBaseName(namedFile)}.${newExtension}`;
        } else {
          // No naming config, just update extension
          newFileName = fileName.replace(/\.[^.]+$/, `.${newExtension}`);
        }
      }

      return { newType, newFileName };
    };

    return yield* createTransformNode({
      id,
      name: "Optimize",
      description: "Optimizes an image for web delivery",
      nodeTypeId: "optimize-image",
      outputTypeId: STORAGE_OUTPUT_TYPE_ID,
      keepOutput: options?.keepOutput,
      // Note: naming is handled in transform since format changes extension
      nodeType: "optimize",
      namingVars: { format, quality },
      mode: effectiveMode,
      streamingConfig: options?.streamingConfig,
      // Buffered transform (used when mode is "buffered" or "auto" selects buffered)
      transform: (inputBytes, file) =>
        Effect.map(
          imageService.optimize(inputBytes, { quality, format }),
          (optimizedBytes) => {
            const { newType, newFileName } = buildOutputMetadata(file);
            return {
              bytes: optimizedBytes,
              type: newType,
              fileName: newFileName,
            } as
              | Uint8Array
              | { bytes: Uint8Array; type: string; fileName?: string };
          },
        ),
      // Streaming transform (used when mode is "streaming" or "auto" selects streaming)
      streamingTransform: imageService.optimizeStream
        ? (inputStream, file) => {
            const optimizeStreamFn = imageService.optimizeStream;
            if (!optimizeStreamFn) {
              throw UploadistaError.fromCode("UNKNOWN_ERROR");
            }
            return Effect.gen(function* () {
              // Use the streaming optimization
              const outputStream = yield* optimizeStreamFn(inputStream, {
                quality,
                format,
              });

              const { newType, newFileName } = buildOutputMetadata(file);

              return {
                stream: outputStream,
                type: newType,
                fileName: newFileName,
              };
            });
          }
        : undefined,
    });
  });
}
