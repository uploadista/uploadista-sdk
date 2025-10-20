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
  }),
);
