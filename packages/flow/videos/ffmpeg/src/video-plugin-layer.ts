import { VideoPlugin } from "@uploadista/core/flow";
import { Layer } from "effect";
import { checkFFmpegAvailable } from "./utils/ffmpeg-check";
import { createFFmpegVideoPlugin } from "./video-plugin";

/**
 * Effect Layer for the FFmpeg video plugin
 *
 * This layer provides video processing capabilities using FFmpeg.
 * Note: FFmpeg must be installed on the system for this plugin to work.
 *
 * @example
 * ```typescript
 * import { FFmpegVideoPluginLive } from "@uploadista/flow-videos-ffmpeg";
 * import { Effect } from "effect";
 *
 * const program = Effect.gen(function* () {
 *   const videoPlugin = yield* VideoPlugin;
 *   const metadata = yield* videoPlugin.describe(videoBytes);
 *   return metadata;
 * });
 *
 * // Run with FFmpeg plugin layer
 * const result = await Effect.runPromise(
 *   program.pipe(Effect.provide(FFmpegVideoPluginLive))
 * );
 * ```
 */
export const FFmpegVideoPluginLive = Layer.succeed(
  VideoPlugin,
  createFFmpegVideoPlugin(),
);

/**
 * Effect Layer for the FFmpeg video plugin with availability check
 *
 * This layer checks if FFmpeg is installed and logs a warning if not available.
 * The plugin will still be created, but operations will fail with FFMPEG_NOT_INSTALLED errors.
 *
 * @example
 * ```typescript
 * import { FFmpegVideoPluginLiveWithCheck } from "@uploadista/flow-videos-ffmpeg";
 * import { Effect } from "effect";
 *
 * const program = Effect.gen(function* () {
 *   const videoPlugin = yield* VideoPlugin;
 *   const metadata = yield* videoPlugin.describe(videoBytes);
 *   return metadata;
 * });
 *
 * // Run with FFmpeg plugin layer (with check)
 * const result = await Effect.runPromise(
 *   program.pipe(Effect.provide(FFmpegVideoPluginLiveWithCheck))
 * );
 * ```
 */
export const FFmpegVideoPluginLiveWithCheck = Layer.effectDiscard(
  Effect.gen(function* () {
    const result = yield* Effect.promise(() => checkFFmpegAvailable());

    if (!result.available) {
      console.warn(
        "⚠️  FFmpeg is not installed or not available in PATH.",
        "\nVideo processing operations will fail.",
        "\nInstall FFmpeg: https://ffmpeg.org/download.html",
      );
    } else {
      console.log(`✓ FFmpeg ${result.version} detected`);
    }
  }),
).pipe(Layer.provideMerge(FFmpegVideoPluginLive));
