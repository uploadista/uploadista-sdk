import { PassThrough } from "node:stream";
import { UploadistaError } from "@uploadista/core/errors";
import {
  ImagePlugin,
  type OptimizeParams,
  type ResizeParams,
  type Transformation,
} from "@uploadista/core/flow";
import { withOperationSpan } from "@uploadista/observability";
import { Effect, Layer, Stream } from "effect";
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
      }).pipe(
        withOperationSpan("image", "optimize", {
          "image.format": format,
          "image.quality": quality,
          "image.input_size": inputBytes.byteLength,
        }),
      );
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
      }).pipe(
        withOperationSpan("image", "resize", {
          "image.width": width,
          "image.height": height,
          "image.fit": fit,
          "image.input_size": inputBytes.byteLength,
        }),
      );
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
            }).pipe(
              withOperationSpan("image", "fetch-watermark", {
                "image.watermark_url": transformation.imagePath,
              }),
            );

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
            }).pipe(
              withOperationSpan("image", "fetch-logo", {
                "image.logo_url": transformation.imagePath,
              }),
            );

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
      }).pipe(
        withOperationSpan("image", "transform", {
          "image.transformation_type": transformation.type,
          "image.input_size": inputBytes.byteLength,
        }),
      );
    },

    /**
     * Indicates that this plugin supports streaming operations.
     */
    supportsStreaming: true,

    /**
     * Streaming optimization using Sharp's pipeline.
     *
     * Collects input stream chunks, processes through Sharp, and returns
     * the result as a stream. This avoids double-buffering when combined
     * with streaming DataStore reads.
     */
    optimizeStream: (
      inputStream: Stream.Stream<Uint8Array, UploadistaError>,
      { quality, format }: OptimizeParams,
    ): Effect.Effect<
      Stream.Stream<Uint8Array, UploadistaError>,
      UploadistaError
    > => {
      return Effect.gen(function* () {
        // Collect input stream to buffer (Sharp needs full image to decode)
        const chunks: Uint8Array[] = [];
        yield* Stream.runForEach(inputStream, (chunk) =>
          Effect.sync(() => {
            chunks.push(chunk);
          }),
        );

        // Combine chunks
        const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
        const inputBuffer = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          inputBuffer.set(chunk, offset);
          offset += chunk.byteLength;
        }

        // Process through Sharp and output as stream
        return Stream.async<Uint8Array, UploadistaError>((emit) => {
          const sharpInstance = sharp(inputBuffer).toFormat(format, {
            quality,
          });

          // Use Sharp's streaming output
          const outputStream = new PassThrough();
          const outputChunks: Buffer[] = [];

          sharpInstance
            .pipe(outputStream)
            .on("data", (chunk: Buffer) => {
              outputChunks.push(chunk);
            })
            .on("end", () => {
              // Emit all collected chunks as a single Uint8Array
              const outputBuffer = Buffer.concat(outputChunks);
              emit.single(new Uint8Array(outputBuffer));
              emit.end();
            })
            .on("error", (error: Error) => {
              emit.fail(
                UploadistaError.fromCode("UNKNOWN_ERROR", {
                  body: `Sharp streaming optimization failed: ${error.message}`,
                  cause: error,
                }),
              );
            });

          // Cleanup
          return Effect.sync(() => {
            outputStream.destroy();
          });
        });
      }).pipe(
        withOperationSpan("image", "optimize-stream", {
          "image.format": format,
          "image.quality": quality,
        }),
      );
    },

    /**
     * Streaming resize using Sharp's pipeline.
     *
     * Collects input stream chunks, processes through Sharp's resize,
     * and returns the result as a stream.
     */
    resizeStream: (
      inputStream: Stream.Stream<Uint8Array, UploadistaError>,
      { width, height, fit }: ResizeParams,
    ): Effect.Effect<
      Stream.Stream<Uint8Array, UploadistaError>,
      UploadistaError
    > => {
      return Effect.gen(function* () {
        if (!width && !height) {
          return yield* Effect.fail(
            UploadistaError.fromCode("VALIDATION_ERROR", {
              body: "Either width or height must be specified for resize",
            }),
          );
        }

        // Collect input stream to buffer (Sharp needs full image to decode)
        const chunks: Uint8Array[] = [];
        yield* Stream.runForEach(inputStream, (chunk) =>
          Effect.sync(() => {
            chunks.push(chunk);
          }),
        );

        // Combine chunks
        const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
        const inputBuffer = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          inputBuffer.set(chunk, offset);
          offset += chunk.byteLength;
        }

        const sharpFit = mapFitToSharp(fit);

        // Process through Sharp and output as stream
        return Stream.async<Uint8Array, UploadistaError>((emit) => {
          const sharpInstance = sharp(inputBuffer).resize(width, height, {
            fit: sharpFit,
          });

          // Use Sharp's streaming output
          const outputStream = new PassThrough();
          const outputChunks: Buffer[] = [];

          sharpInstance
            .pipe(outputStream)
            .on("data", (chunk: Buffer) => {
              outputChunks.push(chunk);
            })
            .on("end", () => {
              // Emit all collected chunks as a single Uint8Array
              const outputBuffer = Buffer.concat(outputChunks);
              emit.single(new Uint8Array(outputBuffer));
              emit.end();
            })
            .on("error", (error: Error) => {
              emit.fail(
                UploadistaError.fromCode("UNKNOWN_ERROR", {
                  body: `Sharp streaming resize failed: ${error.message}`,
                  cause: error,
                }),
              );
            });

          // Cleanup
          return Effect.sync(() => {
            outputStream.destroy();
          });
        });
      }).pipe(
        withOperationSpan("image", "resize-stream", {
          "image.width": width,
          "image.height": height,
          "image.fit": fit,
        }),
      );
    },

    /**
     * Streaming transformation using Sharp's pipeline.
     *
     * Collects input stream chunks, applies the transformation,
     * and returns the result as a stream.
     */
    transformStream: (
      inputStream: Stream.Stream<Uint8Array, UploadistaError>,
      transformation: Transformation,
    ): Effect.Effect<
      Stream.Stream<Uint8Array, UploadistaError>,
      UploadistaError
    > => {
      return Effect.gen(function* () {
        // Collect input stream to buffer (Sharp needs full image to decode)
        const chunks: Uint8Array[] = [];
        yield* Stream.runForEach(inputStream, (chunk) =>
          Effect.sync(() => {
            chunks.push(chunk);
          }),
        );

        // Combine chunks
        const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
        const inputBuffer = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          inputBuffer.set(chunk, offset);
          offset += chunk.byteLength;
        }

        // Apply transformation (reuse buffered transform logic)
        let pipeline = sharp(inputBuffer);

        switch (transformation.type) {
          case "resize": {
            const sharpFit = mapFitToSharp(transformation.fit);
            pipeline = pipeline.resize(
              transformation.width,
              transformation.height,
              { fit: sharpFit },
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
            pipeline = pipeline.tint({ r: 112, g: 66, b: 20 });
            break;
          }

          case "brightness": {
            const multiplier = 1 + transformation.value / 100;
            pipeline = pipeline.modulate({ brightness: multiplier });
            break;
          }

          case "contrast": {
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

          case "watermark":
          case "logo":
          case "text": {
            // These transformations require async operations and metadata lookups
            // Fall back to the buffered transform for these complex cases
            return yield* Effect.fail(
              UploadistaError.fromCode("UNKNOWN_ERROR", {
                body: `Streaming not supported for ${transformation.type} transformation. Use buffered mode.`,
              }),
            );
          }

          default: {
            return yield* Effect.fail(
              UploadistaError.fromCode("UNKNOWN_ERROR", {
                body: `Unsupported transformation type: ${(transformation as { type: string }).type}`,
              }),
            );
          }
        }

        // Process through Sharp and output as stream
        return Stream.async<Uint8Array, UploadistaError>((emit) => {
          // Use Sharp's streaming output
          const outputStream = new PassThrough();
          const outputChunks: Buffer[] = [];

          pipeline
            .pipe(outputStream)
            .on("data", (chunk: Buffer) => {
              outputChunks.push(chunk);
            })
            .on("end", () => {
              // Emit all collected chunks as a single Uint8Array
              const outputBuffer = Buffer.concat(outputChunks);
              emit.single(new Uint8Array(outputBuffer));
              emit.end();
            })
            .on("error", (error: Error) => {
              emit.fail(
                UploadistaError.fromCode("UNKNOWN_ERROR", {
                  body: `Sharp streaming transform failed: ${error.message}`,
                  cause: error,
                }),
              );
            });

          // Cleanup
          return Effect.sync(() => {
            outputStream.destroy();
          });
        });
      }).pipe(
        withOperationSpan("image", "transform-stream", {
          "image.transformation_type": transformation.type,
        }),
      );
    },
  }),
);
