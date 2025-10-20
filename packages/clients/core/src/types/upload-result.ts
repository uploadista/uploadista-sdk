import type { UploadFile } from "@uploadista/core";

export type UploadResult<TOutput = UploadFile> =
  | {
      type: "success";
      value: TOutput;
    }
  | {
      type: "error";
      error: Error;
    }
  | {
      type: "cancelled";
    };
