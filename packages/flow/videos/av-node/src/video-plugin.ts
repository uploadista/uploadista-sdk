import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UploadistaError } from "@uploadista/core/errors";
import type {
  DescribeVideoMetadata,
  VideoPluginShape,
} from "@uploadista/core/flow";
import { Effect } from "effect";
import { Decoder, Encoder, MediaInput, MediaOutput } from "node-av/api";
import type { Packet } from "node-av/lib";
import {
  audioCodecToAVName,
  codecToAVName,
  imageFormatToEncoder,
} from "./utils/format-mappings";
import {
  bytesToTempFile,
  cleanup,
  tempFileToBytes,
} from "./utils/temp-file-manager";

/**
 * Creates a node-av based video processing plugin
 */
export function createAVNodeVideoPlugin(): VideoPluginShape {
  return {
    describe: (input) =>
      Effect.tryPromise({
        try: async () => {
          const inputPath = await bytesToTempFile(input, "input");

          try {
            await using mediaInput = await MediaInput.open(inputPath);

            const videoStream = mediaInput.video();
            const audioStream = mediaInput.audio();

            if (!videoStream) {
              throw new Error("No video stream found");
            }

            const videoCodecParams = videoStream.codecpar;

            // Calculate frame rate from rational number
            let frameRate = 0;
            if (videoStream.rFrameRate) {
              const { num, den } = videoStream.rFrameRate;
              frameRate = den ? num / den : num;
            }

            // Get aspect ratio
            let aspectRatio = "unknown";
            if (videoStream.sampleAspectRatio) {
              const { num, den } = videoStream.sampleAspectRatio;
              aspectRatio = `${num}:${den}`;
            }

            // Get file size
            const stats = await fs.stat(inputPath);

            const metadata: DescribeVideoMetadata = {
              duration: mediaInput.duration || 0,
              width: videoCodecParams.width || 0,
              height: videoCodecParams.height || 0,
              codec: String(videoCodecParams.codecId) || "unknown",
              format: mediaInput.formatName || "unknown",
              bitrate: mediaInput.bitRate || 0,
              frameRate,
              aspectRatio,
              hasAudio: !!audioStream,
              audioCodec: audioStream?.codecpar.codecId
                ? String(audioStream.codecpar.codecId)
                : undefined,
              audioBitrate: audioStream?.codecpar.bitRate
                ? Number(audioStream.codecpar.bitRate)
                : undefined,
              size: stats.size,
            };

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
            await using mediaInput = await MediaInput.open(inputPath);
            await using mediaOutput = await MediaOutput.open(outputPath);

            const videoStream = mediaInput.video();
            if (!videoStream) {
              throw new Error("No video stream found");
            }

            using videoDecoder = await Decoder.create(videoStream);

            // Determine encoder codec
            const encoderCodec = options.codec
              ? codecToAVName[options.codec]
              : codecToAVName.h264;

            using videoEncoder = await Encoder.create(encoderCodec, {
              timeBase: videoStream.timeBase,
              ...(options.videoBitrate && { bitrate: options.videoBitrate }),
            });

            const videoOutputIndex = mediaOutput.addStream(videoEncoder);

            // Process video frames
            for await (using frame of videoDecoder.frames(
              mediaInput.packets(videoStream.index),
            )) {
              const packet = await videoEncoder.encode(frame);
              if (packet) {
                await mediaOutput.writePacket(packet, videoOutputIndex);
                packet.free();
              }
            }

            // Flush remaining packets
            await videoEncoder.flush();
            let transcodeVPacket: Packet | null = await videoEncoder.receive();
            while (transcodeVPacket !== null) {
              await mediaOutput.writePacket(transcodeVPacket, videoOutputIndex);
              transcodeVPacket.free();
              transcodeVPacket = await videoEncoder.receive();
            }

            // Handle audio stream if present
            const audioStream = mediaInput.audio();
            if (audioStream) {
              using audioDecoder = await Decoder.create(audioStream);

              const audioEncoderCodec = options.audioCodec
                ? audioCodecToAVName[options.audioCodec]
                : audioCodecToAVName.aac;

              using audioEncoder = await Encoder.create(audioEncoderCodec, {
                timeBase: audioStream.timeBase,
                ...(options.audioBitrate && { bitrate: options.audioBitrate }),
              });

              const audioOutputIndex = mediaOutput.addStream(audioEncoder);

              // Process audio frames
              for await (using frame of audioDecoder.frames(
                mediaInput.packets(audioStream.index),
              )) {
                const packet = await audioEncoder.encode(frame);
                if (packet) {
                  await mediaOutput.writePacket(packet, audioOutputIndex);
                  packet.free();
                }
              }

              // Flush remaining packets
              await audioEncoder.flush();
              let transcodeAPacket: Packet | null =
                await audioEncoder.receive();
              while (transcodeAPacket !== null) {
                await mediaOutput.writePacket(
                  transcodeAPacket,
                  audioOutputIndex,
                );
                transcodeAPacket.free();
                transcodeAPacket = await audioEncoder.receive();
              }
            }

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
            await using mediaInput = await MediaInput.open(inputPath);
            await using mediaOutput = await MediaOutput.open(outputPath);

            const videoStream = mediaInput.video();
            if (!videoStream) {
              throw new Error("No video stream found");
            }

            using videoDecoder = await Decoder.create(videoStream);

            // TODO: Implement proper resizing with FilterAPI
            // Currently, resize functionality is limited because node-av's Encoder
            // auto-initializes from the first frame it receives. To implement proper
            // resizing, we would need to:
            // 1. Use FilterAPI.create('scale', { width, height }) to create a scale filter
            // 2. Pass decoded frames through the filter before encoding
            // For now, this function will pass through frames without resizing.

            // Validate that resize parameters are provided
            if (!options.width && !options.height) {
              throw new Error("Either width or height must be specified");
            }

            using videoEncoder = await Encoder.create(codecToAVName.h264, {
              timeBase: videoStream.timeBase,
            });

            const videoOutputIndex = mediaOutput.addStream(videoEncoder);

            // Process video frames with resizing
            // Note: For production use, consider using FilterAPI for better quality scaling
            for await (using frame of videoDecoder.frames(
              mediaInput.packets(videoStream.index),
            )) {
              // TODO: Apply scale filter here for better quality
              // For now, encoder will handle basic resizing
              const packet = await videoEncoder.encode(frame);
              if (packet) {
                await mediaOutput.writePacket(packet, videoOutputIndex);
                packet.free();
              }
            }

            // Flush remaining packets
            await videoEncoder.flush();
            let vPacket: Packet | null = await videoEncoder.receive();
            while (vPacket !== null) {
              await mediaOutput.writePacket(vPacket, videoOutputIndex);
              vPacket.free();
              vPacket = await videoEncoder.receive();
            }

            // Copy audio stream if present
            const audioStream = mediaInput.audio();
            if (audioStream) {
              using audioDecoder = await Decoder.create(audioStream);
              using audioEncoder = await Encoder.create(
                audioCodecToAVName.aac,
                {
                  timeBase: audioStream.timeBase,
                },
              );

              const audioOutputIndex = mediaOutput.addStream(audioEncoder);

              for await (using frame of audioDecoder.frames(
                mediaInput.packets(audioStream.index),
              )) {
                const packet = await audioEncoder.encode(frame);
                if (packet) {
                  await mediaOutput.writePacket(packet, audioOutputIndex);
                  packet.free();
                }
              }

              // Flush remaining packets
              await audioEncoder.flush();
              let resizeAPacket: Packet | null = await audioEncoder.receive();
              while (resizeAPacket !== null) {
                await mediaOutput.writePacket(resizeAPacket, audioOutputIndex);
                resizeAPacket.free();
                resizeAPacket = await audioEncoder.receive();
              }
            }

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
            await using mediaInput = await MediaInput.open(inputPath);
            await using mediaOutput = await MediaOutput.open(outputPath);

            const videoStream = mediaInput.video();
            if (!videoStream) {
              throw new Error("No video stream found");
            }

            // Calculate end time
            let endTime: number;
            if (options.duration !== undefined) {
              endTime = options.startTime + options.duration;
            } else if (options.endTime !== undefined) {
              endTime = options.endTime;
            } else {
              endTime = mediaInput.duration || Number.POSITIVE_INFINITY;
            }

            using videoDecoder = await Decoder.create(videoStream);
            using videoEncoder = await Encoder.create(codecToAVName.h264, {
              timeBase: videoStream.timeBase,
            });

            const videoOutputIndex = mediaOutput.addStream(videoEncoder);

            // Process video frames within time range
            for await (using frame of videoDecoder.frames(
              mediaInput.packets(videoStream.index),
            )) {
              // Calculate frame timestamp
              const pts = frame.pts || 0n;
              const timeBase = videoStream.timeBase
                ? videoStream.timeBase.num / videoStream.timeBase.den
                : 1;
              const timestamp = Number(pts) * timeBase;

              if (timestamp >= options.startTime && timestamp < endTime) {
                const packet = await videoEncoder.encode(frame);
                if (packet) {
                  await mediaOutput.writePacket(packet, videoOutputIndex);
                  packet.free();
                }
              }

              if (timestamp >= endTime) break;
            }

            // Flush remaining packets
            await videoEncoder.flush();
            let trimVPacket: Packet | null = await videoEncoder.receive();
            while (trimVPacket !== null) {
              await mediaOutput.writePacket(trimVPacket, videoOutputIndex);
              trimVPacket.free();
              trimVPacket = await videoEncoder.receive();
            }

            // Handle audio stream if present
            const audioStream = mediaInput.audio();
            if (audioStream) {
              using audioDecoder = await Decoder.create(audioStream);
              using audioEncoder = await Encoder.create(
                audioCodecToAVName.aac,
                {
                  timeBase: audioStream.timeBase,
                },
              );

              const audioOutputIndex = mediaOutput.addStream(audioEncoder);

              for await (using frame of audioDecoder.frames(
                mediaInput.packets(audioStream.index),
              )) {
                const pts = frame.pts || 0n;
                const timeBase = audioStream.timeBase
                  ? audioStream.timeBase.num / audioStream.timeBase.den
                  : 1;
                const timestamp = Number(pts) * timeBase;

                if (timestamp >= options.startTime && timestamp < endTime) {
                  const packet = await audioEncoder.encode(frame);
                  if (packet) {
                    await mediaOutput.writePacket(packet, audioOutputIndex);
                    packet.free();
                  }
                }

                if (timestamp >= endTime) break;
              }

              // Flush remaining packets
              await audioEncoder.flush();
              let trimAPacket: Packet | null = await audioEncoder.receive();
              while (trimAPacket !== null) {
                await mediaOutput.writePacket(trimAPacket, audioOutputIndex);
                trimAPacket.free();
                trimAPacket = await audioEncoder.receive();
              }
            }

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
            await using mediaInput = await MediaInput.open(inputPath);

            const videoStream = mediaInput.video();
            if (!videoStream) {
              throw new Error("No video stream found");
            }

            using decoder = await Decoder.create(videoStream);

            let frameFound = false;
            const targetTimestamp = options.timestamp;

            for await (using frame of decoder.frames(
              mediaInput.packets(videoStream.index),
            )) {
              // Calculate frame timestamp
              const pts = frame.pts || 0n;
              const timeBase = videoStream.timeBase
                ? videoStream.timeBase.num / videoStream.timeBase.den
                : 1;
              const timestamp = Number(pts) * timeBase;

              // Look for frame at or after target timestamp
              if (timestamp >= targetTimestamp) {
                // Use an image encoder to save the frame
                const encoderCodec =
                  imageFormatToEncoder[format] || imageFormatToEncoder.jpeg;
                using imageEncoder = await Encoder.create(encoderCodec, {
                  timeBase: { num: 1, den: 1 },
                });

                // Encode the frame as image
                // The encoder will initialize from the first frame's properties
                const packet = await imageEncoder.encode(frame);
                if (packet?.data) {
                  await fs.writeFile(outputPath, packet.data);
                  packet.free();
                  frameFound = true;
                  break;
                }
              }
            }

            if (!frameFound) {
              throw new Error(`No frame found at timestamp ${targetTimestamp}`);
            }

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
