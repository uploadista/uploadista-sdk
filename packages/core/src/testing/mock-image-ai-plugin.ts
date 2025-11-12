import { Effect, Layer } from "effect";
import { ImageAiPlugin } from "../flow";

/**
 * Mock ImageAiPlugin implementation for testing.
 *
 * Provides simple mock implementations of AI-powered image operations
 * like background removal and image description.
 *
 * @example
 * ```typescript
 * import { TestImageAiPlugin } from "@uploadista/core/testing";
 *
 * const program = Effect.gen(function* () {
 *   const plugin = yield* ImageAiPlugin;
 *   const result = yield* plugin.removeBackground(imageUrl, context);
 *   return result;
 * }).pipe(Effect.provide(TestImageAiPlugin));
 * ```
 */
export const TestImageAiPlugin = Layer.succeed(
  ImageAiPlugin,
  ImageAiPlugin.of({
    removeBackground: (inputUrl: string, _context) =>
      Effect.sync(() => ({
        outputUrl: inputUrl.replace(".jpg", "-no-bg.png"),
      })),
    describeImage: (inputUrl: string, _context) =>
      Effect.sync(() => ({
        description: `A test image from ${inputUrl}`,
      })),
  }),
);
