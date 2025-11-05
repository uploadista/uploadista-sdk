import type { UploadistaError } from "@uploadista/core/errors";
import { Context, type Effect, type Layer } from "effect";
import type { OptimizeParams } from "./types/optimize-node";
import type { ResizeParams } from "./types/resize-node";

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
