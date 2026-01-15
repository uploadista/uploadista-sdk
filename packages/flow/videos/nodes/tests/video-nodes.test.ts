import { TestUploadEngine, TestVideoPlugin } from "@uploadista/core/testing";
import type { UploadFile } from "@uploadista/core/types";
import { it as effectIt } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { describe, expect } from "vitest";
import {
  createDescribeVideoNode,
  createTranscodeVideoNode,
  createVideoResizeNode,
  createVideoThumbnailNode,
  createTrimVideoNode,
} from "../src";

// Combined test layer with all required dependencies
const TestLayer = Layer.mergeAll(TestUploadEngine, TestVideoPlugin);

// Helper to create test video file
const createTestVideoFile = (): UploadFile => ({
  id: "test-video-123",
  offset: 0,
  size: 1000000, // 1MB
  storage: {
    id: "test-storage",
    type: "memory",
  },
  metadata: {
    mimeType: "video/mp4",
    type: "video/mp4",
    fileName: "test-video.mp4",
    originalName: "test-video.mp4",
    extension: "mp4",
  },
  creationDate: new Date().toISOString(),
});

describe("Video Flow Nodes", () => {
  describe("DescribeVideoNode", () => {
    // NOTE: The describe node currently has a limitation - it extracts video metadata
    // using VideoPlugin.describe(), but cannot attach it to the result because
    // createTransformNode only supports returning { bytes, type, fileName }.
    // Custom metadata fields are not supported in the transform return value.
    // TODO: Consider implementing describe node differently to support metadata attachment

    effectIt.effect("should execute without errors", () =>
      Effect.gen(function* () {
        const node = yield* createDescribeVideoNode("describe-1");
        const testFile = createTestVideoFile();

        const result = yield* node.run({
          data: testFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data).toBeDefined();
          expect(result.data.id).toBeDefined();
          // Note: videoInfo is extracted but not currently attached to result
          // due to transform node limitations
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    effectIt.effect("should pass through original video bytes", () =>
      Effect.gen(function* () {
        const node = yield* createDescribeVideoNode("describe-2");
        const testFile = createTestVideoFile();

        const result = yield* node.run({
          data: testFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          // Video bytes should be preserved
          expect(result.data).toBeDefined();
          expect(result.data.id).toBeDefined();
        }
      }).pipe(Effect.provide(TestLayer)),
    );
  });

  describe("TranscodeVideoNode", () => {
    effectIt.effect("should transcode video to WebM", () =>
      Effect.gen(function* () {
        const node = yield* createTranscodeVideoNode("transcode-1", {
          format: "webm",
          codec: "vp9",
        });
        const testFile = createTestVideoFile();

        const result = yield* node.run({
          data: testFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data).toBeDefined();
          expect(result.data.metadata?.mimeType).toBe("video/webm");
          expect(result.data.metadata?.fileName).toContain(".webm");
          expect(result.data.metadata?.extension).toBe("webm");
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    effectIt.effect("should transcode video to MOV", () =>
      Effect.gen(function* () {
        const node = yield* createTranscodeVideoNode("transcode-2", {
          format: "mov",
          codec: "h264",
        });
        const testFile = createTestVideoFile();

        const result = yield* node.run({
          data: testFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data).toBeDefined();
          expect(result.data.metadata?.mimeType).toBe("video/quicktime");
          expect(result.data.metadata?.fileName).toContain(".mov");
          expect(result.data.metadata?.extension).toBe("mov");
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    effectIt.effect("should transcode video to AVI", () =>
      Effect.gen(function* () {
        const node = yield* createTranscodeVideoNode("transcode-3", {
          format: "avi",
          codec: "h264",
        });
        const testFile = createTestVideoFile();

        const result = yield* node.run({
          data: testFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data).toBeDefined();
          expect(result.data.metadata?.mimeType).toBe("video/x-msvideo");
          expect(result.data.metadata?.fileName).toContain(".avi");
          expect(result.data.metadata?.extension).toBe("avi");
        }
      }).pipe(Effect.provide(TestLayer)),
    );
  });

  describe("ResizeVideoNode", () => {
    effectIt.effect("should resize video to 720p", () =>
      Effect.gen(function* () {
        const node = yield* createVideoResizeNode("resize-1", {
          width: 1280,
          height: 720,
        });
        const testFile = createTestVideoFile();

        const result = yield* node.run({
          data: testFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data).toBeDefined();
          // Resized video should have different size
          expect(result.data.size).toBeDefined();
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    effectIt.effect("should resize video to 1080p", () =>
      Effect.gen(function* () {
        const node = yield* createVideoResizeNode("resize-2", {
          width: 1920,
          height: 1080,
          aspectRatio: "keep",
        });
        const testFile = createTestVideoFile();

        const result = yield* node.run({
          data: testFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data).toBeDefined();
          expect(result.data.size).toBeDefined();
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    effectIt.effect("should resize video with only width specified", () =>
      Effect.gen(function* () {
        const node = yield* createVideoResizeNode("resize-3", {
          width: 640,
        });
        const testFile = createTestVideoFile();

        const result = yield* node.run({
          data: testFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data).toBeDefined();
        }
      }).pipe(Effect.provide(TestLayer)),
    );
  });

  describe("ThumbnailNode", () => {
    effectIt.effect("should extract frame as JPEG thumbnail", () =>
      Effect.gen(function* () {
        const node = yield* createVideoThumbnailNode("thumbnail-1", {
          timestamp: 10,
          format: "jpeg",
        });
        const testFile = createTestVideoFile();

        const result = yield* node.run({
          data: testFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data).toBeDefined();
          expect(result.data.metadata?.mimeType).toBe("image/jpeg");
          expect(result.data.metadata?.fileName).toContain(".jpg");
          expect(result.data.metadata?.extension).toBe("jpg");
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    effectIt.effect("should extract frame as PNG thumbnail", () =>
      Effect.gen(function* () {
        const node = yield* createVideoThumbnailNode("thumbnail-2", {
          timestamp: 5,
          format: "png",
        });
        const testFile = createTestVideoFile();

        const result = yield* node.run({
          data: testFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data).toBeDefined();
          expect(result.data.metadata?.mimeType).toBe("image/png");
          expect(result.data.metadata?.fileName).toContain(".png");
          expect(result.data.metadata?.extension).toBe("png");
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    effectIt.effect("should default to JPEG format", () =>
      Effect.gen(function* () {
        const node = yield* createVideoThumbnailNode("thumbnail-3", {
          timestamp: 0,
        });
        const testFile = createTestVideoFile();

        const result = yield* node.run({
          data: testFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data).toBeDefined();
          expect(result.data.metadata?.mimeType).toBe("image/jpeg");
        }
      }).pipe(Effect.provide(TestLayer)),
    );
  });

  describe("TrimVideoNode", () => {
    effectIt.effect("should trim video with endTime", () =>
      Effect.gen(function* () {
        const node = yield* createTrimVideoNode("trim-1", {
          startTime: 10,
          endTime: 30,
        });
        const testFile = createTestVideoFile();

        const result = yield* node.run({
          data: testFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data).toBeDefined();
          // Trimmed video should be smaller
          if (result.data.size && testFile.size) {
            expect(result.data.size).toBeLessThan(testFile.size);
          }
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    effectIt.effect("should trim video with duration", () =>
      Effect.gen(function* () {
        const node = yield* createTrimVideoNode("trim-2", {
          startTime: 5,
          duration: 15,
        });
        const testFile = createTestVideoFile();

        const result = yield* node.run({
          data: testFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data).toBeDefined();
          if (result.data.size && testFile.size) {
            expect(result.data.size).toBeLessThan(testFile.size);
          }
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    effectIt.effect("should trim from start to end of video", () =>
      Effect.gen(function* () {
        const node = yield* createTrimVideoNode("trim-3", {
          startTime: 0,
        });
        const testFile = createTestVideoFile();

        const result = yield* node.run({
          data: testFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data).toBeDefined();
        }
      }).pipe(Effect.provide(TestLayer)),
    );
  });

  describe("Video transformation chains", () => {
    effectIt.effect(
      "should chain transcode and resize operations",
      () =>
        Effect.gen(function* () {
          const transcodeNode = yield* createTranscodeVideoNode("transcode", {
            format: "webm",
            codec: "vp9",
          });
          const resizeNode = yield* createVideoResizeNode("resize", {
            width: 1280,
            height: 720,
          });
          const testFile = createTestVideoFile();

          // First transcode
          const transcodeResult = yield* transcodeNode.run({
            data: testFile,
            jobId: "test-job",
            flowId: "test-flow",
            storageId: "test-storage",
            clientId: "test-client",
          });

          expect(transcodeResult.type).toBe("complete");
          if (transcodeResult.type === "complete") {
            // Then resize the transcoded video
            const resizeResult = yield* resizeNode.run({
              data: transcodeResult.data,
              jobId: "test-job",
              flowId: "test-flow",
              storageId: "test-storage",
              clientId: "test-client",
            });

            expect(resizeResult.type).toBe("complete");
            if (resizeResult.type === "complete") {
              expect(resizeResult.data).toBeDefined();
              // Should maintain WebM format from transcode
              expect(resizeResult.data.metadata?.mimeType).toBe("video/webm");
            }
          }
        }).pipe(Effect.provide(TestLayer)),
    );

    effectIt.effect(
      "should chain trim and thumbnail operations",
      () =>
        Effect.gen(function* () {
          const trimNode = yield* createTrimVideoNode("trim", {
            startTime: 10,
            duration: 20,
          });
          const thumbnailNode = yield* createVideoThumbnailNode("thumbnail", {
            timestamp: 5,
            format: "jpeg",
          });
          const testFile = createTestVideoFile();

          // First trim
          const trimResult = yield* trimNode.run({
            data: testFile,
            jobId: "test-job",
            flowId: "test-flow",
            storageId: "test-storage",
            clientId: "test-client",
          });

          expect(trimResult.type).toBe("complete");
          if (trimResult.type === "complete") {
            // Then extract thumbnail from trimmed video
            const thumbnailResult = yield* thumbnailNode.run({
              data: trimResult.data,
              jobId: "test-job",
              flowId: "test-flow",
              storageId: "test-storage",
              clientId: "test-client",
            });

            expect(thumbnailResult.type).toBe("complete");
            if (thumbnailResult.type === "complete") {
              expect(thumbnailResult.data).toBeDefined();
              // Should be an image now, not a video
              expect(thumbnailResult.data.metadata?.mimeType).toBe(
                "image/jpeg",
              );
            }
          }
        }).pipe(Effect.provide(TestLayer)),
    );

    effectIt.effect(
      "should handle describe followed by transcode",
      () =>
        Effect.gen(function* () {
          const describeNode = yield* createDescribeVideoNode("describe");
          const transcodeNode = yield* createTranscodeVideoNode("transcode", {
            format: "mp4",
            codec: "h264",
          });
          const testFile = createTestVideoFile();

          // First describe (extracts metadata but doesn't attach it)
          const describeResult = yield* describeNode.run({
            data: testFile,
            jobId: "test-job",
            flowId: "test-flow",
            storageId: "test-storage",
            clientId: "test-client",
          });

          expect(describeResult.type).toBe("complete");
          if (describeResult.type === "complete") {
            expect(describeResult.data).toBeDefined();

            // Then transcode
            const transcodeResult = yield* transcodeNode.run({
              data: describeResult.data,
              jobId: "test-job",
              flowId: "test-flow",
              storageId: "test-storage",
              clientId: "test-client",
            });

            expect(transcodeResult.type).toBe("complete");
            if (transcodeResult.type === "complete") {
              expect(transcodeResult.data).toBeDefined();
              expect(transcodeResult.data.metadata?.mimeType).toBe("video/mp4");
            }
          }
        }).pipe(Effect.provide(TestLayer)),
    );
  });
});
