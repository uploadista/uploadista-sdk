import {
  adjust_brightness,
  adjust_contrast,
  crop,
  fliph,
  flipv,
  gaussian_blur,
  grayscale,
  PhotonImage,
  padding_bottom,
  padding_left,
  padding_right,
  padding_top,
  Rgba,
  resize,
  sepia,
  sharpen,
} from "@cf-wasm/photon/node";
import { UploadistaError } from "@uploadista/core/errors";
import { ImagePlugin } from "@uploadista/core/flow";
import { withOperationSpan } from "@uploadista/observability";
import { Effect, Layer } from "effect";
import type tinycolor from "tinycolor2";
import { calculateImageSize } from "./common";

export const tinyColorToPhotonRGBA = (color: tinycolor.Instance) => {
  const rgba = color.toRgb();
  return new Rgba(rgba.r, rgba.g, rgba.b, rgba.a);
};

export const autoResize = (
  image: PhotonImage,
  newWidth?: number,
  newHeight?: number,
  options?: {
    fit?: "contain" | "cover" | "fill";
    fit_cover_letterbox_color?: tinycolor.Instance;
  },
) => {
  const currentWidth = image.get_width();
  const currentHeight = image.get_height();

  if (!newWidth && !newHeight) {
    throw new Error("At least one of width or height is required");
  }

  if (newWidth && !newHeight) {
    newHeight = Math.floor((newWidth / currentWidth) * currentHeight);
  } else if (newHeight && !newWidth) {
    newWidth = Math.floor((newHeight / currentHeight) * currentWidth);
  }

  if (!newWidth || !newHeight) {
    throw new Error("Invalid width or height");
  }

  if (newWidth === currentWidth && newHeight === currentHeight) {
    return image;
  }

  const fit = options?.fit || "cover";

  const dem = calculateImageSize(
    fit,
    currentWidth,
    currentHeight,
    newWidth,
    newHeight,
  );

  image = resize(image, dem.width, dem.height, 1);

  const [updatedWidth, updatedHeight] = [image.get_width(), image.get_height()];

  if (fit === "contain" && options?.fit_cover_letterbox_color) {
    const paddingX = Math.floor((newWidth - updatedWidth) / 2);
    const paddingY = Math.floor((newHeight - updatedHeight) / 2);

    if (paddingY > 0) {
      image = padding_top(
        image,
        paddingY,
        tinyColorToPhotonRGBA(options.fit_cover_letterbox_color),
      );
      image = padding_bottom(
        image,
        paddingY,
        tinyColorToPhotonRGBA(options.fit_cover_letterbox_color),
      );
    }

    if (paddingX > 0) {
      image = padding_left(
        image,
        paddingX,
        tinyColorToPhotonRGBA(options.fit_cover_letterbox_color),
      );
      image = padding_right(
        image,
        paddingX,
        tinyColorToPhotonRGBA(options.fit_cover_letterbox_color),
      );
    }
  } else if (fit === "cover") {
    //crop to center
    const cropX = Math.floor(updatedWidth - newWidth) / 2;
    const cropY = Math.floor(updatedHeight - newHeight) / 2;

    //top left to down right
    image = crop(image, cropX, cropY, newWidth + cropX, newHeight + cropY);
  }

  return image;
};

export const imageToFormat = (
  image: PhotonImage,
  format: "webp" | "jpeg" | "png",
  options?: {
    jpeg_quality?: number;
  },
) => {
  let outputBytes: Uint8Array;

  switch (format) {
    case "webp":
      outputBytes = image.get_bytes_webp();
      break;
    case "jpeg":
      outputBytes = image.get_bytes_jpeg(options?.jpeg_quality || 100);
      break;
    case "png":
      outputBytes = image.get_bytes();
      break;
    default:
      outputBytes = image.get_bytes_jpeg(options?.jpeg_quality || 100);
  }

  return outputBytes;
};

export const imagePluginNode = Layer.succeed(
  ImagePlugin,
  ImagePlugin.of({
    optimize: (inputBytes, { quality }) => {
      // create a PhotonImage instance
      const inputImage = PhotonImage.new_from_byteslice(inputBytes);

      // get jpeg bytes
      const outputBytes = inputImage.get_bytes_jpeg(quality);

      // call free() method to free memory
      inputImage.free();

      return Effect.succeed(outputBytes).pipe(
        withOperationSpan("image", "optimize", {
          "image.quality": quality,
          "image.input_size": inputBytes.byteLength,
        }),
      );
    },
    resize: (inputBytes, { width, height, fit }) => {
      if (!width && !height) {
        throw new Error("Either width or height must be specified for resize");
      }
      // create a PhotonImage instance
      const inputImage = PhotonImage.new_from_byteslice(inputBytes);

      // resize image using photon
      const outputImage = autoResize(
        inputImage,
        width ?? inputImage.get_width(),
        height ?? inputImage.get_height(),
        { fit },
      );

      // get webp bytes
      const outputBytes = outputImage.get_bytes_webp();

      // for other formats
      // png  : outputImage.get_bytes();
      // jpeg : outputImage.get_bytes_jpeg(quality);

      // call free() method to free memory
      inputImage.free();
      outputImage.free();

      return Effect.succeed(outputBytes).pipe(
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
        // List of unsupported transformations in photon
        const unsupportedTransformations: string[] = [
          "watermark",
          "logo",
          "text",
        ];

        if (unsupportedTransformations.includes(transformation.type)) {
          return yield* Effect.fail(
            UploadistaError.fromCode("UNKNOWN_ERROR", {
              body: `Photon plugin does not support '${transformation.type}'. Use sharp plugin or remove this transformation.`,
            }),
          );
        }

        // Create a PhotonImage instance
        let image = PhotonImage.new_from_byteslice(inputBytes);

        try {
          switch (transformation.type) {
            case "resize": {
              image = autoResize(
                image,
                transformation.width,
                transformation.height,
                { fit: transformation.fit },
              );
              break;
            }

            case "blur": {
              // Photon uses a radius parameter for gaussian blur
              // Convert sigma to a rough radius approximation
              const radius = Math.round(transformation.sigma);
              gaussian_blur(image, radius);
              break;
            }

            case "rotate": {
              // Photon doesn't have a straightforward rotate with angle function
              // We'll need to implement this using available functions or mark as unsupported
              return yield* Effect.fail(
                UploadistaError.fromCode("UNKNOWN_ERROR", {
                  body: "Rotate transformation is not fully supported in photon plugin. Use sharp plugin instead.",
                }),
              );
            }

            case "flip": {
              // Photon has fliph() and flipv() functions
              if (transformation.direction === "horizontal") {
                fliph(image);
              } else {
                flipv(image);
              }
              break;
            }

            case "grayscale": {
              grayscale(image);
              break;
            }

            case "sepia": {
              sepia(image);
              break;
            }

            case "brightness": {
              // Photon's adjust_brightness function takes a value to add to each pixel
              // Convert our -100 to +100 range to photon's expected range
              const adjustValue = Math.round(transformation.value * 2.55);
              adjust_brightness(image, adjustValue);
              break;
            }

            case "contrast": {
              // Photon's adjust_contrast takes a contrast value
              // Convert our -100 to +100 range to a suitable value
              const contrastValue = transformation.value;
              adjust_contrast(image, contrastValue);
              break;
            }

            case "sharpen": {
              sharpen(image);
              break;
            }

            default: {
              // TypeScript exhaustiveness check
              return yield* Effect.fail(
                UploadistaError.fromCode("UNKNOWN_ERROR", {
                  body: `Unknown transformation type: ${(transformation as { type: string }).type}`,
                }),
              );
            }
          }

          // Get output bytes (using webp format)
          const outputBytes = image.get_bytes_webp();

          return outputBytes;
        } finally {
          // Always free the image to prevent memory leaks
          image.free();
        }
      }).pipe(
        withOperationSpan("image", "transform", {
          "image.transformation_type": transformation.type,
          "image.input_size": inputBytes.byteLength,
        }),
      );
    },
  }),
);
