import { Effect, Layer } from "effect";
import { ZipPlugin } from "../flow";

/**
 * Mock ZipPlugin implementation for testing.
 *
 * Provides a simple in-memory implementation that creates mock zip data
 * by serializing file metadata as JSON.
 *
 * @example
 * ```typescript
 * import { TestZipPlugin } from "@uploadista/core/testing";
 *
 * const program = Effect.gen(function* () {
 *   const zipPlugin = yield* ZipPlugin;
 *   const zipData = yield* zipPlugin.zip(inputs, options);
 *   return zipData;
 * }).pipe(Effect.provide(TestZipPlugin));
 * ```
 */
export const TestZipPlugin = Layer.succeed(
  ZipPlugin,
  ZipPlugin.of({
    zip: (inputs, options) =>
      Effect.gen(function* () {
        // Create mock zip data
        const files = inputs.map((input) => ({
          id: input.id,
          size: input.data.byteLength,
        }));

        const zipContent = JSON.stringify({
          zipName: options.zipName,
          includeMetadata: options.includeMetadata,
          files,
        });

        return new TextEncoder().encode(zipContent);
      }),
  }),
);
