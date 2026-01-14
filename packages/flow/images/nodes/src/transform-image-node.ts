import type { UploadistaError } from "@uploadista/core/errors";
import {
  createTransformNode,
  type FileNamingConfig,
  ImagePlugin,
  STORAGE_OUTPUT_TYPE_ID,
  type StreamingConfig,
  type TransformImageParams,
  type TransformMode,
} from "@uploadista/core/flow";
import { Effect, Stream } from "effect";

/**
 * Apply a chain of transformations to an image by reducing over the transformations array.
 * Each transformation receives the output of the previous transformation as input.
 *
 * @param imageService - The image plugin service to use for transformations
 * @param inputBytes - The input image bytes
 * @param transformations - Array of transformations to apply in sequence
 * @returns Effect that resolves to the final transformed image bytes
 */
function applyTransformationChain(
  imageService: ReturnType<typeof ImagePlugin.of>,
  inputBytes: Uint8Array,
  transformations: TransformImageParams["transformations"],
) {
  return Effect.reduce(transformations, inputBytes, (bytes, transformation) =>
    imageService.transform(bytes, transformation),
  );
}

/**
 * Apply a chain of transformations using streaming where possible.
 * Falls back to buffered processing for transformations that don't support streaming.
 *
 * @param imageService - The image plugin service to use for transformations
 * @param inputStream - The input image as a stream
 * @param transformations - Array of transformations to apply in sequence
 * @returns Effect that resolves to the final transformed image stream
 */
function applyStreamingTransformationChain(
  imageService: ReturnType<typeof ImagePlugin.of>,
  inputStream: Stream.Stream<Uint8Array, UploadistaError>,
  transformations: TransformImageParams["transformations"],
): Effect.Effect<Stream.Stream<Uint8Array, UploadistaError>, UploadistaError> {
  const transformStreamFn = imageService.transformStream;

  if (!transformStreamFn) {
    // If streaming not supported, collect to buffer and use buffered chain
    return Effect.gen(function* () {
      // Collect stream to buffer
      const chunks: Uint8Array[] = [];
      yield* Stream.runForEach(inputStream, (chunk) =>
        Effect.sync(() => {
          chunks.push(chunk);
        }),
      );
      const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
      const inputBuffer = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        inputBuffer.set(chunk, offset);
        offset += chunk.byteLength;
      }

      // Apply transformations
      const result = yield* applyTransformationChain(
        imageService,
        inputBuffer,
        transformations,
      );
      return Stream.make(result);
    });
  }

  // Apply each transformation in sequence using streaming
  return Effect.reduce(
    transformations,
    inputStream,
    (currentStream, transformation) =>
      Effect.flatMap(
        transformStreamFn(currentStream, transformation),
        (outputStream) => Effect.succeed(outputStream),
      ),
  );
}

/**
 * Creates a transform image node that applies multiple transformations sequentially.
 *
 * This node enables complex image processing workflows by chaining multiple transformations
 * together. Each transformation is applied to the output of the previous transformation,
 * allowing for powerful image manipulation pipelines.
 *
 * Supports both buffered and streaming modes for memory-efficient processing
 * of large images. In streaming mode, each transformation is applied in sequence
 * using streaming where supported.
 *
 * Supported transformations include:
 * - Basic: resize, blur, rotate, flip
 * - Filters: grayscale, sepia, brightness, contrast
 * - Effects: sharpen
 * - Advanced: watermark, logo, text (streaming not supported for these)
 *
 * Note: Watermark and logo transformations require imagePath to be a valid URL.
 * Images will be fetched from the provided URL during transformation.
 * Streaming mode is not supported for watermark, logo, and text transformations;
 * these will cause fallback to buffered mode.
 *
 * @param id - Unique identifier for this node
 * @param params - Parameters including the transformations array
 * @param options - Optional configuration
 * @param options.keepOutput - Whether to keep output in flow results
 * @param options.naming - File naming configuration (auto suffix: `transformed`)
 * @param options.mode - Transform mode: "buffered", "streaming", or "auto" (default)
 * @param options.streamingConfig - Streaming configuration (file size threshold, chunk size)
 *
 * @example
 * ```typescript
 * // Auto mode (default) - uses streaming for files > 1MB, otherwise buffered
 * const node = yield* createTransformImageNode("transform-1", {
 *   transformations: [
 *     { type: 'resize', width: 800, height: 600, fit: 'cover' },
 *     { type: 'brightness', value: 20 }
 *   ]
 * }, {
 *   naming: { mode: "auto" }
 * });
 *
 * // Force buffered mode for small files
 * const nodeBuffered = yield* createTransformImageNode("transform-2", {
 *   transformations: [
 *     { type: 'resize', width: 800, height: 600, fit: 'cover' },
 *     { type: 'blur', sigma: 5 }
 *   ]
 * }, {
 *   mode: "buffered",
 *   naming: { mode: "auto" }
 * });
 *
 * // Force streaming mode for memory efficiency
 * const nodeStreaming = yield* createTransformImageNode("transform-3", {
 *   transformations: [{ type: 'grayscale' }]
 * }, {
 *   mode: "streaming",
 *   naming: { mode: "auto" }
 * });
 * ```
 */
export function createTransformImageNode(
  id: string,
  { transformations }: TransformImageParams,
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

    // Check if any transformations don't support streaming
    const hasUnsupportedTransformations = transformations.some(
      (t) => t.type === "watermark" || t.type === "logo" || t.type === "text",
    );

    // If streaming requested but not supported or unsupported transformations, fall back to buffered
    const effectiveMode: TransformMode =
      requestedMode === "buffered"
        ? "buffered"
        : supportsStreaming && !hasUnsupportedTransformations
          ? requestedMode
          : "buffered";

    // Build naming config with auto suffix for transform-image
    const namingConfig: FileNamingConfig | undefined = options?.naming
      ? {
          ...options.naming,
          autoSuffix: options.naming.autoSuffix ?? (() => "transformed"),
        }
      : undefined;

    return yield* createTransformNode({
      id,
      name: "Transform Image",
      description: `Apply ${transformations.length} transformation${transformations.length === 1 ? "" : "s"} to the image`,
      nodeTypeId: "transform-image",
      outputTypeId: STORAGE_OUTPUT_TYPE_ID,
      keepOutput: options?.keepOutput,
      naming: namingConfig,
      nodeType: "transform-image",
      mode: effectiveMode,
      streamingConfig: options?.streamingConfig,
      // Buffered transform (used when mode is "buffered" or "auto" selects buffered)
      transform: (inputBytes) =>
        applyTransformationChain(imageService, inputBytes, transformations),
      // Streaming transform (used when mode is "streaming" or "auto" selects streaming)
      streamingTransform:
        supportsStreaming && !hasUnsupportedTransformations
          ? (inputStream) =>
              Effect.gen(function* () {
                const outputStream = yield* applyStreamingTransformationChain(
                  imageService,
                  inputStream,
                  transformations,
                );
                return { stream: outputStream };
              })
          : undefined,
    });
  });
}
