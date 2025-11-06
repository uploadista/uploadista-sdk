import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UploadistaError } from "@uploadista/core/errors";
import type { VideoMetadata, VideoPluginShape } from "@uploadista/core/flow";
import { Effect } from "effect";
import ffmpeg from "fluent-ffmpeg";
import {
  audioCodecToFFmpegName,
  codecToFFmpegName,
} from "./utils/format-mappings";
import {
  bytesToTempFile,
  cleanup,
  tempFileToBytes,
} from "./utils/temp-file-manager";

/**
 * Creates an FFmpeg-based video processing plugin
 */
export function createFFmpegVideoPlugin(): VideoPluginShape {
  return {
    describe: (input) =>
      Effect.tryPromise({
        try: async () => {
          const inputPath = await bytesToTempFile(input, "input");

          try {
            const metadata = await new Promise<VideoMetadata>(
              (resolve, reject) => {
                ffmpeg.ffprobe(inputPath, (err, data) => {
                  if (err) {
                    reject(err);
                    return;
                  }

                  const videoStream = data.streams.find(
                    (s) => s.codec_type === "video",
                  );
                  const audioStream = data.streams.find(
                    (s) => s.codec_type === "audio",
                  );

                  if (!videoStream) {
                    reject(new Error("No video stream found"));
                    return;
                  }

                  // Parse frame rate (e.g., "30/1" -> 30)
                  let frameRate = 0;
                  if (videoStream.r_frame_rate) {
                    const [num, denom] = videoStream.r_frame_rate
                      .split("/")
                      .map(Number);
                    frameRate = denom ? num / denom : num;
                  }

                  resolve({
                    duration: data.format.duration || 0,
                    width: videoStream.width || 0,
                    height: videoStream.height || 0,
                    codec: videoStream.codec_name || "unknown",
                    format: data.format.format_name || "unknown",
                    bitrate: data.format.bit_rate || 0,
                    frameRate,
                    aspectRatio: videoStream.display_aspect_ratio || "unknown",
                    hasAudio: !!audioStream,
                    audioCodec: audioStream?.codec_name,
                    audioBitrate: audioStream
                      ? Number.parseInt(audioStream.bit_rate || "0", 10)
                      : undefined,
                    size: data.format.size || 0,
                  });
                });
              },
            );

            return metadata;
          } finally {
            await cleanup([inputPath]);
          }
        },
        catch: (error) =>
          UploadistaError.fromCode("VIDEO_METADATA_EXTRACTION_FAILED", {
            body: `Failed to extract video metadata: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      }),

    transcode: (input, options) =>
      Effect.tryPromise({
        try: async () => {
          const inputPath = await bytesToTempFile(input, "input");
          const outputPath = join(
            tmpdir(),
            `uploadista-${randomUUID()}.${options.format}`,
          );

          try {
            await new Promise<void>((resolve, reject) => {
              let command = ffmpeg(inputPath).output(outputPath);

              // Set format
              command = command.format(options.format);

              // Set video codec if specified
              if (options.codec) {
                command = command.videoCodec(codecToFFmpegName[options.codec]);
              }

              // Set bitrates if specified
              if (options.videoBitrate) {
                command = command.videoBitrate(options.videoBitrate);
              }
              if (options.audioBitrate) {
                command = command.audioBitrate(options.audioBitrate);
              }
              if (options.audioCodec) {
                command = command.audioCodec(
                  audioCodecToFFmpegName[options.audioCodec],
                );
              }

              command
                .on("end", () => resolve())
                .on("error", (err) => reject(err))
                .run();
            });

            const output = await tempFileToBytes(outputPath);
            return output;
          } finally {
            await cleanup([inputPath, outputPath]);
          }
        },
        catch: (error) =>
          UploadistaError.fromCode("VIDEO_PROCESSING_FAILED", {
            body: `Transcode failed: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      }),

    resize: (input, options) =>
      Effect.tryPromise({
        try: async () => {
          const inputPath = await bytesToTempFile(input, "input");
          const outputPath = join(tmpdir(), `uploadista-${randomUUID()}.mp4`);

          try {
            await new Promise<void>((resolve, reject) => {
              let scaleFilter: string;

              // Build scale filter based on parameters
              if (options.width && options.height) {
                if (options.aspectRatio === "keep") {
                  // Keep aspect ratio by fitting within bounds
                  scaleFilter = `scale='min(${options.width},iw)':min'(${options.height},ih)':force_original_aspect_ratio=decrease`;
                } else {
                  // Ignore aspect ratio, stretch to exact dimensions
                  scaleFilter = `scale=${options.width}:${options.height}`;
                }
              } else if (options.width) {
                // Width only, calculate height proportionally
                scaleFilter = `scale=${options.width}:-1`;
              } else if (options.height) {
                // Height only, calculate width proportionally
                scaleFilter = `scale=-1:${options.height}`;
              } else {
                reject(new Error("Either width or height must be specified"));
                return;
              }

              // Add scaling algorithm if specified
              const scaling = options.scaling || "bicubic";
              const flags = `flags=${scaling}`;
              scaleFilter = `${scaleFilter}:${flags}`;

              ffmpeg(inputPath)
                .output(outputPath)
                .videoFilters(scaleFilter)
                .on("end", () => resolve())
                .on("error", (err) => reject(err))
                .run();
            });

            const output = await tempFileToBytes(outputPath);
            return output;
          } finally {
            await cleanup([inputPath, outputPath]);
          }
        },
        catch: (error) =>
          UploadistaError.fromCode("VIDEO_PROCESSING_FAILED", {
            body: `Resize failed: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      }),

    trim: (input, options) =>
      Effect.tryPromise({
        try: async () => {
          const inputPath = await bytesToTempFile(input, "input");
          const outputPath = join(tmpdir(), `uploadista-${randomUUID()}.mp4`);

          try {
            await new Promise<void>((resolve, reject) => {
              let command = ffmpeg(inputPath).output(outputPath);

              // Set start time
              command = command.setStartTime(options.startTime);

              // Set duration or end time
              if (options.duration !== undefined) {
                command = command.setDuration(options.duration);
              } else if (options.endTime !== undefined) {
                const duration = options.endTime - options.startTime;
                command = command.setDuration(duration);
              }

              // Use copy codec for fast trimming (no re-encoding)
              command = command.outputOptions(["-c copy"]);

              command
                .on("end", () => resolve())
                .on("error", (err) => reject(err))
                .run();
            });

            const output = await tempFileToBytes(outputPath);
            return output;
          } finally {
            await cleanup([inputPath, outputPath]);
          }
        },
        catch: (error) =>
          UploadistaError.fromCode("VIDEO_PROCESSING_FAILED", {
            body: `Trim failed: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      }),

    extractFrame: (input, options) =>
      Effect.tryPromise({
        try: async () => {
          const inputPath = await bytesToTempFile(input, "input");
          const format = options.format || "jpeg";
          const outputPath = join(
            tmpdir(),
            `uploadista-${randomUUID()}.${format}`,
          );

          try {
            await new Promise<void>((resolve, reject) => {
              let command = ffmpeg(inputPath).output(outputPath);

              // Seek to timestamp
              command = command.seekInput(options.timestamp);

              // Extract single frame
              command = command.outputOptions(["-vframes 1"]);

              // Set quality for JPEG
              if (format === "jpeg" && options.quality) {
                // FFmpeg quality scale: 2 (best) to 31 (worst)
                // Convert from 1-100 to 2-31
                const ffmpegQuality = Math.floor(
                  31 - (options.quality / 100) * 29,
                );
                command = command.outputOptions([`-q:v ${ffmpegQuality}`]);
              }

              command
                .on("end", () => resolve())
                .on("error", (err) => reject(err))
                .run();
            });

            const output = await tempFileToBytes(outputPath);
            return output;
          } finally {
            await cleanup([inputPath, outputPath]);
          }
        },
        catch: (error) =>
          UploadistaError.fromCode("VIDEO_PROCESSING_FAILED", {
            body: `Frame extraction failed: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      }),
  };
}
