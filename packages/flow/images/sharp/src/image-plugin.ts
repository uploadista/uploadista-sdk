import { UploadistaError } from "@uploadista/core/errors";
import { ImagePlugin } from "@uploadista/core/flow";
import { Effect, Layer } from "effect";
import sharp from "sharp";

const mapFitToSharp = (fit: "fill" | "contain" | "cover") => {
  switch (fit) {
    case "fill":
      return "cover";
    case "contain":
      return "contain";
  }
};

/**
 * Calculate position coordinates for overlays based on position string and offsets.
 */
const calculateOverlayPosition = (
  position: string,
  imageWidth: number,
  imageHeight: number,
  overlayWidth: number,
  overlayHeight: number,
  offsetX = 0,
  offsetY = 0,
): { top: number; left: number } => {
  let top = 0;
  let left = 0;

  switch (position) {
    case "top-left":
      top = offsetY;
      left = offsetX;
      break;
    case "top-right":
      top = offsetY;
      left = imageWidth - overlayWidth - offsetX;
      break;
    case "bottom-left":
      top = imageHeight - overlayHeight - offsetY;
      left = offsetX;
      break;
    case "bottom-right":
      top = imageHeight - overlayHeight - offsetY;
      left = imageWidth - overlayWidth - offsetX;
      break;
    case "center":
      top = Math.floor((imageHeight - overlayHeight) / 2) + offsetY;
      left = Math.floor((imageWidth - overlayWidth) / 2) + offsetX;
      break;
  }

  return { top, left };
};

export const imagePlugin = Layer.succeed(
  ImagePlugin,
  ImagePlugin.of({
    optimize: (inputBytes, { quality, format }) => {
      return Effect.gen(function* () {
        const outputBytes = yield* Effect.tryPromise({
          try: async () =>
            await sharp(inputBytes).toFormat(format, { quality }).toBuffer(),
          catch: (error) => {
            return UploadistaError.fromCode("UNKNOWN_ERROR", {
              cause: error,
            });
          },
        });
        return new Uint8Array(outputBytes);
      });
    },
    resize: (inputBytes, { width, height, fit }) => {
      return Effect.gen(function* () {
        if (!width && !height) {
          throw new Error(
            "Either width or height must be specified for resize",
          );
        }

        const sharpFit = mapFitToSharp(fit);
        const outputBytes = yield* Effect.tryPromise({
          try: async () =>
            await sharp(inputBytes)
              .resize(width, height, { fit: sharpFit })
              .toBuffer(),
          catch: (error) => {
            return UploadistaError.fromCode("UNKNOWN_ERROR", {
              cause: error,
            });
          },
        });

        return new Uint8Array(outputBytes);
      });
    },
    transform: (inputBytes, transformation) => {
      return Effect.gen(function* () {
        let pipeline = sharp(inputBytes);

        switch (transformation.type) {
          case "resize": {
            const sharpFit = mapFitToSharp(transformation.fit);
            pipeline = pipeline.resize(
              transformation.width,
              transformation.height,
              {
                fit: sharpFit,
              },
            );
            break;
          }

          case "blur": {
            pipeline = pipeline.blur(transformation.sigma);
            break;
          }

          case "rotate": {
            const options = transformation.background
              ? { background: transformation.background }
              : undefined;
            pipeline = pipeline.rotate(transformation.angle, options);
            break;
          }

          case "flip": {
            if (transformation.direction === "horizontal") {
              pipeline = pipeline.flop();
            } else {
              pipeline = pipeline.flip();
            }
            break;
          }

          case "grayscale": {
            pipeline = pipeline.grayscale();
            break;
          }

          case "sepia": {
            // Apply sepia tone using tint
            pipeline = pipeline.tint({ r: 112, g: 66, b: 20 });
            break;
          }

          case "brightness": {
            // Convert -100 to +100 range to multiplier (0 to 2)
            const multiplier = 1 + transformation.value / 100;
            pipeline = pipeline.modulate({ brightness: multiplier });
            break;
          }

          case "contrast": {
            // Convert -100 to +100 range to linear adjustment
            const a = 1 + transformation.value / 100;
            pipeline = pipeline.linear(a, 0);
            break;
          }

          case "sharpen": {
            if (transformation.sigma !== undefined) {
              pipeline = pipeline.sharpen({ sigma: transformation.sigma });
            } else {
              pipeline = pipeline.sharpen();
            }
            break;
          }

          case "watermark": {
            // Fetch watermark image from URL
            const watermarkBuffer = yield* Effect.tryPromise({
              try: async () => {
                const response = await fetch(transformation.imagePath);
                if (!response.ok) {
                  throw new Error(
                    `Failed to fetch watermark: ${response.statusText}`,
                  );
                }
                const arrayBuffer = await response.arrayBuffer();
                return Buffer.from(arrayBuffer);
              },
              catch: (error) => {
                return UploadistaError.fromCode("FILE_NOT_FOUND", {
                  body: `Watermark image not found or failed to fetch: ${transformation.imagePath}`,
                  cause: error,
                });
              },
            });

            // Get image metadata to calculate positioning
            const metadata = yield* Effect.tryPromise({
              try: async () => await pipeline.metadata(),
              catch: (error) => {
                return UploadistaError.fromCode("UNKNOWN_ERROR", {
                  body: "Failed to read image metadata",
                  cause: error,
                });
              },
            });

            // Get watermark metadata
            const watermarkMetadata = yield* Effect.tryPromise({
              try: async () => await sharp(watermarkBuffer).metadata(),
              catch: (error) => {
                return UploadistaError.fromCode("UNKNOWN_ERROR", {
                  body: "Failed to read watermark metadata",
                  cause: error,
                });
              },
            });

            if (
              !metadata.width ||
              !metadata.height ||
              !watermarkMetadata.width ||
              !watermarkMetadata.height
            ) {
              return yield* Effect.fail(
                UploadistaError.fromCode("UNKNOWN_ERROR", {
                  body: "Could not determine image or watermark dimensions",
                }),
              );
            }

            const { top, left } = calculateOverlayPosition(
              transformation.position,
              metadata.width,
              metadata.height,
              watermarkMetadata.width,
              watermarkMetadata.height,
              transformation.offsetX,
              transformation.offsetY,
            );

            // Apply watermark with opacity
            const watermarkWithOpacity = yield* Effect.tryPromise({
              try: async () =>
                await sharp(watermarkBuffer)
                  .composite([
                    {
                      input: Buffer.from([
                        255,
                        255,
                        255,
                        Math.round(transformation.opacity * 255),
                      ]),
                      raw: {
                        width: 1,
                        height: 1,
                        channels: 4,
                      },
                      tile: true,
                      blend: "dest-in",
                    },
                  ])
                  .toBuffer(),
              catch: (error) => {
                return UploadistaError.fromCode("UNKNOWN_ERROR", {
                  body: "Failed to apply watermark opacity",
                  cause: error,
                });
              },
            });

            pipeline = pipeline.composite([
              {
                input: watermarkWithOpacity,
                top,
                left,
              },
            ]);
            break;
          }

          case "logo": {
            // Fetch logo image from URL
            const logoBuffer = yield* Effect.tryPromise({
              try: async () => {
                const response = await fetch(transformation.imagePath);
                if (!response.ok) {
                  throw new Error(
                    `Failed to fetch logo: ${response.statusText}`,
                  );
                }
                const arrayBuffer = await response.arrayBuffer();
                return Buffer.from(arrayBuffer);
              },
              catch: (error) => {
                return UploadistaError.fromCode("FILE_NOT_FOUND", {
                  body: `Logo image not found or failed to fetch: ${transformation.imagePath}`,
                  cause: error,
                });
              },
            });

            // Get image metadata
            const metadata = yield* Effect.tryPromise({
              try: async () => await pipeline.metadata(),
              catch: (error) => {
                return UploadistaError.fromCode("UNKNOWN_ERROR", {
                  body: "Failed to read image metadata",
                  cause: error,
                });
              },
            });

            // Get logo metadata
            const logoMetadata = yield* Effect.tryPromise({
              try: async () => await sharp(logoBuffer).metadata(),
              catch: (error) => {
                return UploadistaError.fromCode("UNKNOWN_ERROR", {
                  body: "Failed to read logo metadata",
                  cause: error,
                });
              },
            });

            if (
              !metadata.width ||
              !metadata.height ||
              !logoMetadata.width ||
              !logoMetadata.height
            ) {
              return yield* Effect.fail(
                UploadistaError.fromCode("UNKNOWN_ERROR", {
                  body: "Could not determine image or logo dimensions",
                }),
              );
            }

            // Scale logo
            const scaledLogoWidth = Math.round(
              logoMetadata.width * transformation.scale,
            );
            const scaledLogoHeight = Math.round(
              logoMetadata.height * transformation.scale,
            );

            const scaledLogo = yield* Effect.tryPromise({
              try: async () =>
                await sharp(logoBuffer)
                  .resize(scaledLogoWidth, scaledLogoHeight)
                  .toBuffer(),
              catch: (error) => {
                return UploadistaError.fromCode("UNKNOWN_ERROR", {
                  body: "Failed to scale logo",
                  cause: error,
                });
              },
            });

            const { top, left } = calculateOverlayPosition(
              transformation.position,
              metadata.width,
              metadata.height,
              scaledLogoWidth,
              scaledLogoHeight,
              transformation.offsetX,
              transformation.offsetY,
            );

            pipeline = pipeline.composite([
              {
                input: scaledLogo,
                top,
                left,
              },
            ]);
            break;
          }

          case "text": {
            // Get image metadata
            const metadata = yield* Effect.tryPromise({
              try: async () => await pipeline.metadata(),
              catch: (error) => {
                return UploadistaError.fromCode("UNKNOWN_ERROR", {
                  body: "Failed to read image metadata",
                  cause: error,
                });
              },
            });

            if (!metadata.width || !metadata.height) {
              return yield* Effect.fail(
                UploadistaError.fromCode("UNKNOWN_ERROR", {
                  body: "Could not determine image dimensions",
                }),
              );
            }

            // Create SVG text overlay
            const fontFamily = transformation.fontFamily || "sans-serif";

            // Estimate text dimensions (rough approximation)
            const textWidth =
              transformation.text.length * transformation.fontSize * 0.6;
            const textHeight = transformation.fontSize;

            const { top, left } = calculateOverlayPosition(
              transformation.position,
              metadata.width,
              metadata.height,
              textWidth,
              textHeight,
              transformation.offsetX,
              transformation.offsetY,
            );

            // Create positioned SVG
            const positionedSvg = `
              <svg width="${metadata.width}" height="${metadata.height}">
                <text
                  x="${left}"
                  y="${top + transformation.fontSize}"
                  font-family="${fontFamily}"
                  font-size="${transformation.fontSize}"
                  fill="${transformation.color}"
                >${transformation.text}</text>
              </svg>
            `;

            pipeline = pipeline.composite([
              {
                input: Buffer.from(positionedSvg),
                top: 0,
                left: 0,
              },
            ]);
            break;
          }

          default: {
            // TypeScript should ensure this is unreachable
            return yield* Effect.fail(
              UploadistaError.fromCode("UNKNOWN_ERROR", {
                body: `Unsupported transformation type: ${(transformation as { type: string }).type}`,
              }),
            );
          }
        }

        // Convert pipeline to buffer
        const outputBytes = yield* Effect.tryPromise({
          try: async () => await pipeline.toBuffer(),
          catch: (error) => {
            return UploadistaError.fromCode("UNKNOWN_ERROR", {
              body: `Failed to apply transformation: ${transformation.type}`,
              cause: error,
            });
          },
        });

        return new Uint8Array(outputBytes);
      });
    },
  }),
);
