import { Effect, Layer } from "effect";
import { VideoPlugin } from "../flow";
import type { DescribeVideoMetadata } from "../flow/plugins/types/describe-video-node";

/**
 * Mock VideoPlugin implementation for testing.
 *
 * Provides simple mock implementations of video processing operations
 * that return mock Uint8Array data without requiring FFmpeg or node-av.
 *
 * @example
 * ```typescript
 * import { TestVideoPlugin } from "@uploadista/core/testing";
 *
 * const program = Effect.gen(function* () {
 *   const plugin = yield* VideoPlugin;
 *   const transcoded = yield* plugin.transcode(videoBytes, { format: "webm", codec: "vp9" });
 *   return transcoded;
 * }).pipe(Effect.provide(TestVideoPlugin));
 * ```
 */
export const TestVideoPlugin = Layer.succeed(
  VideoPlugin,
  VideoPlugin.of({
    describe: (input: Uint8Array) =>
      Effect.sync(() => {
        // Mock describe: return fake metadata based on input size
        const metadata: DescribeVideoMetadata = {
          duration: 120, // 2 minutes
          width: 1920,
          height: 1080,
          codec: "h264",
          format: "mp4",
          bitrate: 5000000, // 5 Mbps
          frameRate: 30,
          aspectRatio: "16:9",
          hasAudio: true,
          audioCodec: "aac",
          audioBitrate: 128000, // 128 kbps
          size: input.byteLength,
        };
        return metadata;
      }),
    transcode: (_input: Uint8Array, options) =>
      Effect.sync(() => {
        // Mock transcode: return modified array
        // Simulate different file sizes for different codecs
        let sizeMultiplier = 1.0;
        if (options.codec === "vp9") {
          sizeMultiplier = 0.8; // VP9 is more efficient
        } else if (options.codec === "h265") {
          sizeMultiplier = 0.7; // H265 is even more efficient
        }

        const newSize = Math.floor(_input.byteLength * sizeMultiplier);
        return new Uint8Array(newSize).fill(42);
      }),
    resize: (input: Uint8Array, options) =>
      Effect.sync(() => {
        // Mock resize: return array with size based on dimensions
        const width = options.width || 1280;
        const height = options.height || 720;
        // Simulate file size roughly proportional to resolution
        const mockSize = Math.floor((width * height) / 50);
        return new Uint8Array(mockSize).fill(84);
      }),
    trim: (_input: Uint8Array, options) =>
      Effect.sync(() => {
        // Mock trim: return smaller array based on duration
        let duration: number;
        if (options.duration !== undefined) {
          duration = options.duration;
        } else if (options.endTime !== undefined) {
          duration = options.endTime - options.startTime;
        } else {
          // Assume 120s total duration
          duration = 120 - options.startTime;
        }

        // Simulate proportional file size based on duration
        const ratio = duration / 120; // Assuming 120s original
        const newSize = Math.floor(_input.byteLength * ratio);
        return new Uint8Array(newSize).fill(63);
      }),
    extractFrame: (input: Uint8Array, options) =>
      Effect.sync(() => {
        // Mock extractFrame: return image bytes (smaller than video)
        const format = options.format || "jpeg";
        // JPEG typically smaller than PNG
        const mockSize = format === "png" ? 50000 : 30000;
        return new Uint8Array(mockSize).fill(255);
      }),
  }),
);
