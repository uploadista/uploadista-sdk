import type { UploadistaError } from "@uploadista/core/errors";
import { Context, type Effect } from "effect";

export type ImageAiContext = {
  clientId: string | null;
};

export type ImageAiPluginShape = {
  removeBackground: (
    inputUrl: string,
    context: ImageAiContext,
  ) => Effect.Effect<{ outputUrl: string }, UploadistaError>;
  describeImage: (
    inputUrl: string,
    context: ImageAiContext,
  ) => Effect.Effect<{ description: string }, UploadistaError>;
};

export class ImageAiPlugin extends Context.Tag("ImageAiPlugin")<
  ImageAiPlugin,
  ImageAiPluginShape
>() {}
