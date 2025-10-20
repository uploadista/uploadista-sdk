import type { UploadistaError } from "@uploadista/core/errors";
import { Context, type Effect } from "effect";
import type { OptimizeParams } from "./types/optimize-node";
import type { ResizeParams } from "./types/resize-node";

export type ImagePluginShape = {
  optimize: (
    input: Uint8Array,
    options: OptimizeParams,
  ) => Effect.Effect<Uint8Array, UploadistaError>;
  resize: (
    input: Uint8Array,
    options: ResizeParams,
  ) => Effect.Effect<Uint8Array, UploadistaError>;
};

export class ImagePlugin extends Context.Tag("ImagePlugin")<
  ImagePlugin,
  ImagePluginShape
>() {}
