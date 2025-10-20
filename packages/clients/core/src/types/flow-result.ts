import type { UploadFile } from "@uploadista/core/types";

export type FlowResult<TOutput = UploadFile> =
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
