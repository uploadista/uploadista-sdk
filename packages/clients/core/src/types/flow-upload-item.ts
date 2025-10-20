import type { UploadFile } from "@uploadista/core";

/**
 * Flow upload item for multi-flow-upload tracking
 */
export interface FlowUploadItem<UploadInput> {
  id: string;
  file: UploadInput;
  status: "pending" | "uploading" | "success" | "error" | "aborted";
  progress: number;
  bytesUploaded: number;
  totalBytes: number;
  error: Error | null;
  result: UploadFile | null;
  jobId: string | null;
}
