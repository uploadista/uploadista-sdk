import type { FlowUploadItem } from "./flow-upload-item";

export interface MultiFlowUploadState<UploadInput> {
  items: FlowUploadItem<UploadInput>[];
  totalProgress: number;
  activeUploads: number;
  completedUploads: number;
  failedUploads: number;
}
