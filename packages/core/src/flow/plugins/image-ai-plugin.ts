import { Context, type Effect, type Layer } from "effect";
import type { UploadistaError } from "../../errors";

/**
 * Context information for AI image processing operations.
 * Contains client identification for tracking and billing purposes.
 */
export type ImageAiContext = {
  /** Unique identifier for the client making the request, or null if not available */
  clientId: string | null;
};

/**
 * Shape definition for the Image AI Plugin interface.
 * Defines the contract that all image AI implementations must follow.
 */
export type ImageAiPluginShape = {
  /**
   * Removes the background from an image using AI processing.
   *
   * @param inputUrl - The URL of the input image to process
   * @param context - Context information including client ID for tracking
   * @returns An Effect that resolves to an object containing the output image URL
   * @throws {UploadistaError} When the background removal fails
   */
  removeBackground: (
    inputUrl: string,
    context: ImageAiContext,
  ) => Effect.Effect<{ outputUrl: string }, UploadistaError>;

  /**
   * Generates a textual description of an image using AI analysis.
   *
   * @param inputUrl - The URL of the input image to analyze
   * @param context - Context information including client ID for tracking
   * @returns An Effect that resolves to an object containing the image description
   * @throws {UploadistaError} When the image analysis fails
   */
  describeImage: (
    inputUrl: string,
    context: ImageAiContext,
  ) => Effect.Effect<{ description: string }, UploadistaError>;
};

/**
 * Context tag for the Image AI Plugin.
 *
 * This tag provides a type-safe way to access image AI functionality
 * throughout the application using Effect's dependency injection system.
 *
 * @example
 * ```typescript
 * import { ImageAiPlugin } from "@uploadista/core/flow/plugins";
 *
 * // In your flow node
 * const program = Effect.gen(function* () {
 *   const imageAi = yield* ImageAiPlugin;
 *   const result = yield* imageAi.removeBackground(imageUrl, { clientId: "user123" });
 *   return result.outputUrl;
 * });
 * ```
 */
export class ImageAiPlugin extends Context.Tag("ImageAiPlugin")<
  ImageAiPlugin,
  ImageAiPluginShape
>() {}

export type ImageAiPluginLayer = Layer.Layer<ImageAiPlugin, never, never>;
