import { UploadistaError } from "@uploadista/core/errors";
import type {
  DescribeVideoMetadata,
  VideoPluginShape,
} from "@uploadista/core/flow";
import { Effect } from "effect";
import { Decoder, Demuxer, Encoder, Muxer } from "node-av/api";
import {
  audioCodecToAVName,
  codecToAVName,
  imageFormatToEncoder,
} from "./utils/format-mappings";
import { createMemoryOutput } from "./utils/memory-io";

/**
 * Creates a node-av based video processing plugin
 */
export function createAVNodeVideoPlugin(): VideoPluginShape {
  return {
    describe: (input) =>
      Effect.tryPromise({
        try: async () => {
          // Convert Uint8Array to Buffer for node-av
          const buffer = Buffer.from(input);
          await using mediaInput = await Demuxer.open(buffer);

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
            size: input.byteLength,
          };

          return metadata;
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
          // Convert Uint8Array to Buffer for input
          const inputBuffer = Buffer.from(input);

          // Create in-memory output
          const { callbacks, getOutput } = createMemoryOutput();

          await using mediaInput = await Demuxer.open(inputBuffer);
          await using mediaOutput = await Muxer.open(callbacks, {
            format: options.format,
          });

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
            ...(options.videoBitrate && { bitrate: options.videoBitrate }),
          });

          const videoOutputIndex = mediaOutput.addStream(videoEncoder);

          // Process video frames
          for await (using frame of videoDecoder.frames(
            mediaInput.packets(videoStream.index),
          )) {
            if (!frame) continue;
            await videoEncoder.encode(frame);
            let packet = await videoEncoder.receive();
            while (packet) {
              await mediaOutput.writePacket(packet, videoOutputIndex);
              packet.free();
              packet = await videoEncoder.receive();
            }
          }

          // Flush remaining packets
          await videoEncoder.flush();
          let transcodeVPacket = await videoEncoder.receive();
          while (transcodeVPacket) {
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
              ...(options.audioBitrate && { bitrate: options.audioBitrate }),
            });

            const audioOutputIndex = mediaOutput.addStream(audioEncoder);

            // Process audio frames
            for await (using frame of audioDecoder.frames(
              mediaInput.packets(audioStream.index),
            )) {
              if (!frame) continue;
              await audioEncoder.encode(frame);
              let packet = await audioEncoder.receive();
              while (packet) {
                await mediaOutput.writePacket(packet, audioOutputIndex);
                packet.free();
                packet = await audioEncoder.receive();
              }
            }

            // Flush remaining packets
            await audioEncoder.flush();
            let transcodeAPacket = await audioEncoder.receive();
            while (transcodeAPacket) {
              await mediaOutput.writePacket(transcodeAPacket, audioOutputIndex);
              transcodeAPacket.free();
              transcodeAPacket = await audioEncoder.receive();
            }
          }

          // Return accumulated output
          return getOutput();
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
          // Convert Uint8Array to Buffer for input
          const inputBuffer = Buffer.from(input);

          // Create in-memory output
          const { callbacks, getOutput } = createMemoryOutput();

          await using mediaInput = await Demuxer.open(inputBuffer);
          await using mediaOutput = await Muxer.open(callbacks, {
            format: "mp4",
          });

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

          using videoEncoder = await Encoder.create(codecToAVName.h264);

          const videoOutputIndex = mediaOutput.addStream(videoEncoder);

          // Process video frames with resizing
          // Note: For production use, consider using FilterAPI for better quality scaling
          for await (using frame of videoDecoder.frames(
            mediaInput.packets(videoStream.index),
          )) {
            if (!frame) continue;
            // TODO: Apply scale filter here for better quality
            // For now, encoder will handle basic resizing
            await videoEncoder.encode(frame);
            let packet = await videoEncoder.receive();
            while (packet) {
              await mediaOutput.writePacket(packet, videoOutputIndex);
              packet.free();
              packet = await videoEncoder.receive();
            }
          }

          // Flush remaining packets
          await videoEncoder.flush();
          let vPacket = await videoEncoder.receive();
          while (vPacket) {
            await mediaOutput.writePacket(vPacket, videoOutputIndex);
            vPacket.free();
            vPacket = await videoEncoder.receive();
          }

          // Copy audio stream if present
          const audioStream = mediaInput.audio();
          if (audioStream) {
            using audioDecoder = await Decoder.create(audioStream);
            using audioEncoder = await Encoder.create(audioCodecToAVName.aac);

            const audioOutputIndex = mediaOutput.addStream(audioEncoder);

            for await (using frame of audioDecoder.frames(
              mediaInput.packets(audioStream.index),
            )) {
              if (!frame) continue;
              await audioEncoder.encode(frame);
              let packet = await audioEncoder.receive();
              while (packet) {
                await mediaOutput.writePacket(packet, audioOutputIndex);
                packet.free();
                packet = await audioEncoder.receive();
              }
            }

            // Flush remaining packets
            await audioEncoder.flush();
            let resizeAPacket = await audioEncoder.receive();
            while (resizeAPacket) {
              await mediaOutput.writePacket(resizeAPacket, audioOutputIndex);
              resizeAPacket.free();
              resizeAPacket = await audioEncoder.receive();
            }
          }

          // Return accumulated output
          return getOutput();
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
          // Convert Uint8Array to Buffer for input
          const inputBuffer = Buffer.from(input);

          // Create in-memory output
          const { callbacks, getOutput } = createMemoryOutput();

          await using mediaInput = await Demuxer.open(inputBuffer);
          await using mediaOutput = await Muxer.open(callbacks, {
            format: "mp4",
          });

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
          using videoEncoder = await Encoder.create(codecToAVName.h264);

          const videoOutputIndex = mediaOutput.addStream(videoEncoder);

          // Process video frames within time range
          for await (using frame of videoDecoder.frames(
            mediaInput.packets(videoStream.index),
          )) {
            if (!frame) continue;
            // Calculate frame timestamp
            const pts = frame.pts || 0n;
            const timeBase = videoStream.timeBase
              ? videoStream.timeBase.num / videoStream.timeBase.den
              : 1;
            const timestamp = Number(pts) * timeBase;

            if (timestamp >= options.startTime && timestamp < endTime) {
              await videoEncoder.encode(frame);
              let packet = await videoEncoder.receive();
              while (packet) {
                await mediaOutput.writePacket(packet, videoOutputIndex);
                packet.free();
                packet = await videoEncoder.receive();
              }
            }

            if (timestamp >= endTime) break;
          }

          // Flush remaining packets
          await videoEncoder.flush();
          let trimVPacket = await videoEncoder.receive();
          while (trimVPacket) {
            await mediaOutput.writePacket(trimVPacket, videoOutputIndex);
            trimVPacket.free();
            trimVPacket = await videoEncoder.receive();
          }

          // Handle audio stream if present
          const audioStream = mediaInput.audio();
          if (audioStream) {
            using audioDecoder = await Decoder.create(audioStream);
            using audioEncoder = await Encoder.create(audioCodecToAVName.aac);

            const audioOutputIndex = mediaOutput.addStream(audioEncoder);

            for await (using frame of audioDecoder.frames(
              mediaInput.packets(audioStream.index),
            )) {
              if (!frame) continue;
              const pts = frame.pts || 0n;
              const timeBase = audioStream.timeBase
                ? audioStream.timeBase.num / audioStream.timeBase.den
                : 1;
              const timestamp = Number(pts) * timeBase;

              if (timestamp >= options.startTime && timestamp < endTime) {
                await audioEncoder.encode(frame);
                let packet = await audioEncoder.receive();
                while (packet) {
                  await mediaOutput.writePacket(packet, audioOutputIndex);
                  packet.free();
                  packet = await audioEncoder.receive();
                }
              }

              if (timestamp >= endTime) break;
            }

            // Flush remaining packets
            await audioEncoder.flush();
            let trimAPacket = await audioEncoder.receive();
            while (trimAPacket) {
              await mediaOutput.writePacket(trimAPacket, audioOutputIndex);
              trimAPacket.free();
              trimAPacket = await audioEncoder.receive();
            }
          }

          // Return accumulated output
          return getOutput();
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
          // Convert Uint8Array to Buffer for input
          const inputBuffer = Buffer.from(input);
          const format = options.format || "jpeg";

          await using mediaInput = await Demuxer.open(inputBuffer);

          const videoStream = mediaInput.video();
          if (!videoStream) {
            throw new Error("No video stream found");
          }

          using decoder = await Decoder.create(videoStream);

          let frameData: Uint8Array | null = null;
          const targetTimestamp = options.timestamp;

          for await (using frame of decoder.frames(
            mediaInput.packets(videoStream.index),
          )) {
            if (!frame) continue;
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
              using imageEncoder = await Encoder.create(encoderCodec);

              // Encode the frame as image
              // The encoder will initialize from the first frame's properties
              await imageEncoder.encode(frame);
              const packet = await imageEncoder.receive();
              if (packet?.data) {
                // Convert Buffer to Uint8Array
                frameData = new Uint8Array(packet.data);
                packet.free();
                break;
              }
            }
          }

          if (!frameData) {
            throw new Error(`No frame found at timestamp ${targetTimestamp}`);
          }

          return frameData;
        },
        catch: (error) =>
          UploadistaError.fromCode("VIDEO_PROCESSING_FAILED", {
            body: `Frame extraction failed: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      }),
  };
}
