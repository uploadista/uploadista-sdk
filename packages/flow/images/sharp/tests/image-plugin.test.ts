import { describe, expect, it } from "@effect/vitest";
import { ImagePlugin } from "@uploadista/core/flow";
import { Effect } from "effect";
import sharp from "sharp";
import { imagePlugin } from "../src/image-plugin";

/**
 * Test utilities for creating sample images
 */
const createTestImage = async (
  width: number,
  height: number,
  color: { r: number; g: number; b: number } = { r: 255, g: 0, b: 0 },
): Promise<Uint8Array> => {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toBuffer();

  return new Uint8Array(buffer);
};

const getImageMetadata = async (imageBytes: Uint8Array) => {
  return await sharp(Buffer.from(imageBytes)).metadata();
};

describe("Sharp Image Plugin", () => {
  describe("optimize", () => {
    it.effect("should optimize image with specified quality and format", () =>
      Effect.gen(function* () {
        const plugin = yield* ImagePlugin;
        const inputImage = yield* Effect.promise(() =>
          createTestImage(100, 100),
        );

        const optimized = yield* plugin.optimize(inputImage, {
          quality: 80,
          format: "jpeg",
        });

        expect(optimized).toBeInstanceOf(Uint8Array);
        expect(optimized.length).toBeGreaterThan(0);

        // Verify output is JPEG
        const metadata = yield* Effect.promise(() =>
          getImageMetadata(optimized),
        );
        expect(metadata.format).toBe("jpeg");
      }).pipe(Effect.provide(imagePlugin)),
    );

    it.effect("should optimize to webp format", () =>
      Effect.gen(function* () {
        const plugin = yield* ImagePlugin;
        const inputImage = yield* Effect.promise(() =>
          createTestImage(100, 100),
        );

        const optimized = yield* plugin.optimize(inputImage, {
          quality: 85,
          format: "webp",
        });

        const metadata = yield* Effect.promise(() =>
          getImageMetadata(optimized),
        );
        expect(metadata.format).toBe("webp");
      }).pipe(Effect.provide(imagePlugin)),
    );

    it.effect("should optimize to png format", () =>
      Effect.gen(function* () {
        const plugin = yield* ImagePlugin;
        const inputImage = yield* Effect.promise(() =>
          createTestImage(100, 100),
        );

        const optimized = yield* plugin.optimize(inputImage, {
          quality: 90,
          format: "png",
        });

        const metadata = yield* Effect.promise(() =>
          getImageMetadata(optimized),
        );
        expect(metadata.format).toBe("png");
      }).pipe(Effect.provide(imagePlugin)),
    );

    it.effect("should handle different quality levels", () =>
      Effect.gen(function* () {
        const plugin = yield* ImagePlugin;
        const inputImage = yield* Effect.promise(() =>
          createTestImage(200, 200),
        );

        // High quality
        const highQuality = yield* plugin.optimize(inputImage, {
          quality: 95,
          format: "jpeg",
        });

        // Low quality
        const lowQuality = yield* plugin.optimize(inputImage, {
          quality: 50,
          format: "jpeg",
        });

        // Lower quality should result in smaller file size
        expect(lowQuality.length).toBeLessThan(highQuality.length);
      }).pipe(Effect.provide(imagePlugin)),
    );
  });

  describe("resize", () => {
    it.effect("should resize image with both width and height", () =>
      Effect.gen(function* () {
        const plugin = yield* ImagePlugin;
        const inputImage = yield* Effect.promise(() =>
          createTestImage(400, 300),
        );

        const resized = yield* plugin.resize(inputImage, {
          width: 200,
          height: 150,
          fit: "cover",
        });

        const metadata = yield* Effect.promise(() => getImageMetadata(resized));
        expect(metadata.width).toBe(200);
        expect(metadata.height).toBe(150);
      }).pipe(Effect.provide(imagePlugin)),
    );

    it.effect("should resize with width only", () =>
      Effect.gen(function* () {
        const plugin = yield* ImagePlugin;
        const inputImage = yield* Effect.promise(() =>
          createTestImage(400, 300),
        );

        const resized = yield* plugin.resize(inputImage, {
          width: 200,
          fit: "cover",
        });

        const metadata = yield* Effect.promise(() => getImageMetadata(resized));
        expect(metadata.width).toBe(200);
        // Height should be proportional
        expect(metadata.height).toBeLessThanOrEqual(300);
      }).pipe(Effect.provide(imagePlugin)),
    );

    it.effect("should resize with height only", () =>
      Effect.gen(function* () {
        const plugin = yield* ImagePlugin;
        const inputImage = yield* Effect.promise(() =>
          createTestImage(400, 300),
        );

        const resized = yield* plugin.resize(inputImage, {
          height: 150,
          fit: "cover",
        });

        const metadata = yield* Effect.promise(() => getImageMetadata(resized));
        expect(metadata.height).toBe(150);
        expect(metadata.width).toBeLessThanOrEqual(400);
      }).pipe(Effect.provide(imagePlugin)),
    );

    it.effect("should handle 'cover' fit mode", () =>
      Effect.gen(function* () {
        const plugin = yield* ImagePlugin;
        const inputImage = yield* Effect.promise(() =>
          createTestImage(400, 300),
        );

        const resized = yield* plugin.resize(inputImage, {
          width: 200,
          height: 200,
          fit: "cover",
        });

        const metadata = yield* Effect.promise(() => getImageMetadata(resized));
        expect(metadata.width).toBe(200);
        expect(metadata.height).toBe(200);
      }).pipe(Effect.provide(imagePlugin)),
    );

    it.effect("should handle 'contain' fit mode", () =>
      Effect.gen(function* () {
        const plugin = yield* ImagePlugin;
        const inputImage = yield* Effect.promise(() =>
          createTestImage(400, 300),
        );

        const resized = yield* plugin.resize(inputImage, {
          width: 200,
          height: 200,
          fit: "contain",
        });

        const metadata = yield* Effect.promise(() => getImageMetadata(resized));
        expect(metadata.width).toBeLessThanOrEqual(200);
        expect(metadata.height).toBeLessThanOrEqual(200);
      }).pipe(Effect.provide(imagePlugin)),
    );

    it.effect("should handle 'fill' fit mode (maps to cover)", () =>
      Effect.gen(function* () {
        const plugin = yield* ImagePlugin;
        const inputImage = yield* Effect.promise(() =>
          createTestImage(400, 300),
        );

        const resized = yield* plugin.resize(inputImage, {
          width: 200,
          height: 200,
          fit: "fill",
        });

        const metadata = yield* Effect.promise(() => getImageMetadata(resized));
        expect(metadata.width).toBe(200);
        expect(metadata.height).toBe(200);
      }).pipe(Effect.provide(imagePlugin)),
    );

    it.effect("should handle upscaling", () =>
      Effect.gen(function* () {
        const plugin = yield* ImagePlugin;
        const inputImage = yield* Effect.promise(() =>
          createTestImage(100, 100),
        );

        const resized = yield* plugin.resize(inputImage, {
          width: 200,
          height: 200,
          fit: "cover",
        });

        const metadata = yield* Effect.promise(() => getImageMetadata(resized));
        expect(metadata.width).toBe(200);
        expect(metadata.height).toBe(200);
      }).pipe(Effect.provide(imagePlugin)),
    );
  });

  describe("transform", () => {
    it.effect("should apply rotation transformation", () =>
      Effect.gen(function* () {
        const plugin = yield* ImagePlugin;
        const inputImage = yield* Effect.promise(() =>
          createTestImage(200, 100),
        );

        const transformed = yield* plugin.transform(inputImage, {
          type: "rotate",
          angle: 90,
        });

        const metadata = yield* Effect.promise(() =>
          getImageMetadata(transformed),
        );
        // After 90° rotation, dimensions should swap
        expect(metadata.width).toBe(100);
        expect(metadata.height).toBe(200);
      }).pipe(Effect.provide(imagePlugin)),
    );

    it.effect("should apply flip transformation", () =>
      Effect.gen(function* () {
        const plugin = yield* ImagePlugin;
        const inputImage = yield* Effect.promise(() =>
          createTestImage(200, 100),
        );

        const transformed = yield* plugin.transform(inputImage, {
          type: "flip",
          direction: "horizontal",
        });

        expect(transformed).toBeInstanceOf(Uint8Array);
        const metadata = yield* Effect.promise(() =>
          getImageMetadata(transformed),
        );
        expect(metadata.width).toBe(200);
        expect(metadata.height).toBe(100);
      }).pipe(Effect.provide(imagePlugin)),
    );

    it.effect("should apply flop transformation", () =>
      Effect.gen(function* () {
        const plugin = yield* ImagePlugin;
        const inputImage = yield* Effect.promise(() =>
          createTestImage(200, 100),
        );

        const transformed = yield* plugin.transform(inputImage, {
          type: "flip",
          direction: "vertical",
        });

        expect(transformed).toBeInstanceOf(Uint8Array);
        const metadata = yield* Effect.promise(() =>
          getImageMetadata(transformed),
        );
        expect(metadata.width).toBe(200);
        expect(metadata.height).toBe(100);
      }).pipe(Effect.provide(imagePlugin)),
    );

    it.effect("should apply blur transformation", () =>
      Effect.gen(function* () {
        const plugin = yield* ImagePlugin;
        const inputImage = yield* Effect.promise(() =>
          createTestImage(200, 100),
        );

        const transformed = yield* plugin.transform(inputImage, {
          type: "blur",
          sigma: 5,
        });

        expect(transformed).toBeInstanceOf(Uint8Array);
        expect(transformed.length).toBeGreaterThan(0);
      }).pipe(Effect.provide(imagePlugin)),
    );

    it.effect("should apply grayscale transformation", () =>
      Effect.gen(function* () {
        const plugin = yield* ImagePlugin;
        const inputImage = yield* Effect.promise(() =>
          createTestImage(200, 100),
        );

        const transformed = yield* plugin.transform(inputImage, {
          type: "grayscale",
        });

        expect(transformed).toBeInstanceOf(Uint8Array);
        expect(transformed.length).toBeGreaterThan(0);
      }).pipe(Effect.provide(imagePlugin)),
    );

    it.effect("should apply multiple transformations together", () =>
      Effect.gen(function* () {
        const plugin = yield* ImagePlugin;
        const inputImage = yield* Effect.promise(() =>
          createTestImage(200, 100),
        );

        const transformedRotated = yield* plugin.transform(inputImage, {
          type: "rotate",
          angle: 180,
        });
        const transformedFlipped = yield* plugin.transform(transformedRotated, {
          type: "flip",
          direction: "horizontal",
        });
        const transformedBlurred = yield* plugin.transform(transformedFlipped, {
          type: "blur",
          sigma: 3,
        });
        const transformedGrayscale = yield* plugin.transform(
          transformedBlurred,
          {
            type: "grayscale",
          },
        );

        expect(transformedGrayscale).toBeInstanceOf(Uint8Array);
        const metadata = yield* Effect.promise(() =>
          getImageMetadata(transformedGrayscale),
        );
        // Dimensions should remain same after 180° rotation
        expect(metadata.width).toBe(200);
        expect(metadata.height).toBe(100);
      }).pipe(Effect.provide(imagePlugin)),
    );

    it.effect("should handle sepia transformation", () =>
      Effect.gen(function* () {
        const plugin = yield* ImagePlugin;
        const inputImage = yield* Effect.promise(() =>
          createTestImage(200, 100),
        );

        const transformed = yield* plugin.transform(inputImage, {
          type: "sepia",
        });

        expect(transformed).toBeInstanceOf(Uint8Array);
        expect(transformed.length).toBeGreaterThan(0);
      }).pipe(Effect.provide(imagePlugin)),
    );
  });

  describe("error handling", () => {
    it.effect("should fail with invalid image data", () =>
      Effect.gen(function* () {
        const plugin = yield* ImagePlugin;
        const invalidData = new Uint8Array([1, 2, 3, 4, 5]);

        const result = yield* Effect.either(
          plugin.optimize(invalidData, {
            quality: 80,
            format: "jpeg",
          }),
        );

        expect(result._tag).toBe("Left");
      }).pipe(Effect.provide(imagePlugin)),
    );

    it.effect("should fail resize with invalid dimensions", () =>
      Effect.gen(function* () {
        const plugin = yield* ImagePlugin;
        const inputImage = yield* Effect.promise(() =>
          createTestImage(100, 100),
        );

        // Test with negative width
        const result = yield* Effect.either(
          plugin.resize(inputImage, {
            width: -100,
            fit: "cover",
          }),
        );

        expect(result._tag).toBe("Left");
      }).pipe(Effect.provide(imagePlugin)),
    );
  });

  describe("performance", () => {
    it.effect("should process large images efficiently", () =>
      Effect.gen(function* () {
        const plugin = yield* ImagePlugin;
        const largeImage = yield* Effect.promise(() =>
          createTestImage(2000, 2000),
        );

        const startTime = Date.now();

        const resized = yield* plugin.resize(largeImage, {
          width: 500,
          height: 500,
          fit: "cover",
        });

        const duration = Date.now() - startTime;

        expect(resized).toBeInstanceOf(Uint8Array);
        // Should complete within reasonable time (5 seconds)
        expect(duration).toBeLessThan(5000);

        const metadata = yield* Effect.promise(() => getImageMetadata(resized));
        expect(metadata.width).toBe(500);
        expect(metadata.height).toBe(500);
      }).pipe(Effect.provide(imagePlugin)),
    );
  });
});
