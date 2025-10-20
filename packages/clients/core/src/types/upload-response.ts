import type { UploadFile } from "@uploadista/core";

export type UploadResponse = {
  upload?: UploadFile;
  status: number;
};
