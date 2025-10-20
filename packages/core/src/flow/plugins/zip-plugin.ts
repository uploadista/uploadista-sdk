import type { UploadistaError } from "@uploadista/core/errors";
import { Context, type Effect } from "effect";
import type { UploadFile } from "@/types";

export type ZipParams = {
  zipName: string;
  includeMetadata: boolean;
};

export type ZipInput = {
  id: string;
  data: Uint8Array;
  metadata: UploadFile["metadata"];
};

export type ZipPluginShape = {
  zip: (
    inputs: ZipInput[],
    options: ZipParams,
  ) => Effect.Effect<Uint8Array, UploadistaError>;
  // unzip: (input: ZipInput) => Effect.Effect<Uint8Array, UploadistaError>;
};

export class ZipPlugin extends Context.Tag("ZipPlugin")<
  ZipPlugin,
  ZipPluginShape
>() {}
