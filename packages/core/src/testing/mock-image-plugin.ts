import { Effect, Layer } from "effect";
import { ImagePlugin } from "../flow";

/**
 * Mock ImagePlugin implementation for testing.
 *
 * Provides simple mock implementations of image optimization, resizing,
 * and transformation operations that return mock Uint8Array data.
 *
 * @example
 * ```typescript
 * import { TestImagePlugin } from "@uploadista/core/testing";
 *
 * const program = Effect.gen(function* () {
 *   const plugin = yield* ImagePlugin;
 *   const optimized = yield* plugin.optimize(imageBytes, { quality: 80, format: "webp" });
 *   return optimized;
 * }).pipe(Effect.provide(TestImagePlugin));
 * ```
 */
export const TestImagePlugin = Layer.succeed(
  ImagePlugin,
  ImagePlugin.of({
    optimize: (input: Uint8Array, options) =>
      Effect.sync(() => {
        // Mock optimize: return smaller array for lower quality
        const sizeMultiplier = options.quality / 100;
        const newSize = Math.floor(input.byteLength * sizeMultiplier);
        return new Uint8Array(newSize).fill(128);
      }),
    resize: (input: Uint8Array, options) =>
      Effect.sync(() => {
        // Mock resize: return array with size based on dimensions
        const width = options.width || 800;
        const height = options.height || 600;
        const mockSize = Math.floor((width * height) / 10);
        return new Uint8Array(mockSize).fill(100);
      }),
    transform: (input: Uint8Array, transformation) =>
      Effect.sync(() => {
        // Mock transform: modify array based on transformation type
        if (transformation.type === "rotate" && transformation.angle === 90) {
          // For 90° rotation, swap dimensions (mock behavior)
          return new Uint8Array(input.byteLength + 10).fill(150);
        }
        if (transformation.type === "blur") {
          return new Uint8Array(input.byteLength).fill(180);
        }
        if (transformation.type === "grayscale") {
          return new Uint8Array(input.byteLength).fill(128);
        }
        // Default: return modified copy
        return new Uint8Array(input.byteLength).fill(200);
      }),
  }),
);
