import { Context, type Effect, type Layer, type Stream } from "effect";
import type { UploadistaError } from "../../errors";
import type { OptimizeParams } from "./types/optimize-node";
import type { ResizeParams } from "./types/resize-node";
import type { Transformation } from "./types/transform-image-node";

/**
 * Shape definition for the Image Plugin interface.
 * Defines the contract that all image processing implementations must follow.
 */
export type ImagePluginShape = {
  /**
   * Optimizes an image by adjusting quality and format.
   *
   * @param input - The input image as a Uint8Array
   * @param options - Optimization parameters including quality and format
   * @returns An Effect that resolves to the optimized image as a Uint8Array
   * @throws {UploadistaError} When image optimization fails
   */
  optimize: (
    input: Uint8Array,
    options: OptimizeParams,
  ) => Effect.Effect<Uint8Array, UploadistaError>;

  /**
   * Resizes an image to specified dimensions.
   *
   * @param input - The input image as a Uint8Array
   * @param options - Resize parameters including width, height, and fit mode
   * @returns An Effect that resolves to the resized image as a Uint8Array
   * @throws {UploadistaError} When image resizing fails
   */
  resize: (
    input: Uint8Array,
    options: ResizeParams,
  ) => Effect.Effect<Uint8Array, UploadistaError>;

  /**
   * Applies a single transformation to an image.
   *
   * This method is used by the transform image node to apply individual transformations
   * in a chain. Each transformation receives the output of the previous transformation.
   *
   * @param input - The input image as a Uint8Array
   * @param transformation - The transformation to apply (discriminated union)
   * @returns An Effect that resolves to the transformed image as a Uint8Array
   * @throws {UploadistaError} When transformation fails or is unsupported by the plugin
   *
   * @example
   * ```typescript
   * const program = Effect.gen(function* () {
   *   const imagePlugin = yield* ImagePlugin;
   *
   *   // Apply a single transformation
   *   const blurred = yield* imagePlugin.transform(imageData, {
   *     type: 'blur',
   *     sigma: 5.0
   *   });
   *
   *   // Chain multiple transformations
   *   const resized = yield* imagePlugin.transform(blurred, {
   *     type: 'resize',
   *     width: 800,
   *     height: 600,
   *     fit: 'cover'
   *   });
   *
   *   return resized;
   * });
   * ```
   */
  transform: (
    input: Uint8Array,
    transformation: Transformation,
  ) => Effect.Effect<Uint8Array, UploadistaError>;

  /**
   * Optimizes an image using streaming for memory-efficient processing of large files.
   *
   * This method processes image data as a stream, which is beneficial for large images
   * where loading the entire file into memory would be problematic.
   *
   * Note: Image processing inherently requires decoding the full image, so memory
   * savings are primarily from avoiding double-buffering. The streaming interface
   * allows better pipeline integration with DataStore streaming reads.
   *
   * @param input - The input image as an Effect Stream of Uint8Array chunks
   * @param options - Optimization parameters including quality and format
   * @returns An Effect that resolves to a Stream of the optimized image bytes
   * @throws {UploadistaError} When image optimization fails
   *
   * @example
   * ```typescript
   * const program = Effect.gen(function* () {
   *   const imagePlugin = yield* ImagePlugin;
   *   const inputStream = yield* dataStore.readStream(fileId);
   *   const outputStream = yield* imagePlugin.optimizeStream(inputStream, {
   *     quality: 80,
   *     format: "webp"
   *   });
   *   return outputStream;
   * });
   * ```
   */
  optimizeStream?: (
    input: Stream.Stream<Uint8Array, UploadistaError>,
    options: OptimizeParams,
  ) => Effect.Effect<Stream.Stream<Uint8Array, UploadistaError>, UploadistaError>;

  /**
   * Resizes an image using streaming for memory-efficient processing of large files.
   *
   * This method processes image data as a stream. Like other image operations,
   * the full image must be decoded before processing, but the streaming interface
   * avoids double-buffering when combined with streaming DataStore reads and writes.
   *
   * @param input - The input image as an Effect Stream of Uint8Array chunks
   * @param options - Resize parameters including width, height, and fit mode
   * @returns An Effect that resolves to a Stream of the resized image bytes
   * @throws {UploadistaError} When image resizing fails
   *
   * @example
   * ```typescript
   * const program = Effect.gen(function* () {
   *   const imagePlugin = yield* ImagePlugin;
   *   const inputStream = yield* dataStore.readStream(fileId);
   *   const outputStream = yield* imagePlugin.resizeStream(inputStream, {
   *     width: 800,
   *     height: 600,
   *     fit: "cover"
   *   });
   *   return outputStream;
   * });
   * ```
   */
  resizeStream?: (
    input: Stream.Stream<Uint8Array, UploadistaError>,
    options: ResizeParams,
  ) => Effect.Effect<Stream.Stream<Uint8Array, UploadistaError>, UploadistaError>;

  /**
   * Applies a single transformation using streaming for memory-efficient processing.
   *
   * This method processes image data as a stream. The streaming interface
   * allows better pipeline integration with DataStore streaming reads and writes,
   * reducing peak memory usage for large files.
   *
   * @param input - The input image as an Effect Stream of Uint8Array chunks
   * @param transformation - The transformation to apply
   * @returns An Effect that resolves to a Stream of the transformed image bytes
   * @throws {UploadistaError} When transformation fails
   *
   * @example
   * ```typescript
   * const program = Effect.gen(function* () {
   *   const imagePlugin = yield* ImagePlugin;
   *   const inputStream = yield* dataStore.readStream(fileId);
   *   const outputStream = yield* imagePlugin.transformStream(inputStream, {
   *     type: 'blur',
   *     sigma: 5.0
   *   });
   *   return outputStream;
   * });
   * ```
   */
  transformStream?: (
    input: Stream.Stream<Uint8Array, UploadistaError>,
    transformation: Transformation,
  ) => Effect.Effect<Stream.Stream<Uint8Array, UploadistaError>, UploadistaError>;

  /**
   * Indicates whether this plugin supports streaming operations.
   * Returns true if streaming methods (optimizeStream, resizeStream, transformStream) are available.
   */
  supportsStreaming?: boolean;
};

/**
 * Context tag for the Image Plugin.
 *
 * This tag provides a type-safe way to access image processing functionality
 * throughout the application using Effect's dependency injection system.
 *
 * @example
 * ```typescript
 * import { ImagePlugin } from "@uploadista/core/flow/plugins";
 *
 * // In your flow node
 * const program = Effect.gen(function* () {
 *   const imagePlugin = yield* ImagePlugin;
 *   const optimized = yield* imagePlugin.optimize(imageData, { quality: 80, format: "webp" });
 *   const resized = yield* imagePlugin.resize(optimized, { width: 800, height: 600, fit: "cover" });
 *   return resized;
 * });
 * ```
 */
export class ImagePlugin extends Context.Tag("ImagePlugin")<
  ImagePlugin,
  ImagePluginShape
>() {}

export type ImagePluginLayer = Layer.Layer<ImagePlugin, never, never>;
