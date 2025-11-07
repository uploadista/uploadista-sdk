import { VideoPlugin } from "@uploadista/core/flow";
import { Effect, Layer } from "effect";
import { checkAVAvailable } from "./utils/av-check";
import { createAVNodeVideoPlugin } from "./video-plugin";

/**
 * Effect Layer for the node-av video plugin
 *
 * This layer provides video processing capabilities using node-av (FFmpeg bindings).
 * Note: node-av includes prebuilt FFmpeg binaries, so no system installation is required.
 *
 * @example
 * ```typescript
 * import { AVNodeVideoPlugin } from "@uploadista/flow-videos-av-node";
 * import { Effect } from "effect";
 *
 * const program = Effect.gen(function* () {
 *   const videoPlugin = yield* VideoPlugin;
 *   const metadata = yield* videoPlugin.describe(videoBytes);
 *   return metadata;
 * });
 *
 * // Run with node-av plugin layer
 * const result = await Effect.runPromise(
 *   program.pipe(Effect.provide(AVNodeVideoPluginLive))
 * );
 * ```
 */
export const AVNodeVideoPlugin = Layer.succeed(
  VideoPlugin,
  createAVNodeVideoPlugin(),
);

/**
 * Effect Layer for the node-av video plugin with availability check
 *
 * This layer checks if node-av is properly installed and logs status information.
 * The plugin will still be created, but operations will fail if node-av is not available.
 *
 * @example
 * ```typescript
 * import { AVNodeVideoPluginWithCheck } from "@uploadista/flow-videos-av-node";
 * import { Effect } from "effect";
 *
 * const program = Effect.gen(function* () {
 *   const videoPlugin = yield* VideoPlugin;
 *   const metadata = yield* videoPlugin.describe(videoBytes);
 *   return metadata;
 * });
 *
 * // Run with node-av plugin layer (with check)
 * const result = await Effect.runPromise(
 *   program.pipe(Effect.provide(AVNodeVideoPluginWithCheck))
 * );
 * ```
 */
export const AVNodeVideoPluginWithCheck = Layer.effectDiscard(
  Effect.gen(function* () {
    const result = yield* Effect.promise(() => checkAVAvailable());

    if (!result.available) {
      console.warn(
        "⚠️  node-av is not installed or not available.",
        "\nVideo processing operations will fail.",
        "\nInstall node-av: npm install node-av",
      );
    } else {
      console.log(`✓ node-av ${result.version} detected`);
    }
  }),
).pipe(Layer.provideMerge(AVNodeVideoPlugin));
