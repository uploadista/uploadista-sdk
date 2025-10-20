export interface UploadSessionMetrics {
  uploadId: string;
  totalSize: number;
  totalDuration: number;
  chunksCompleted: number;
  chunksTotal: number;
  averageSpeed: number;
  peakSpeed: number;
  minSpeed: number;
  totalRetries: number;
  successRate: number;
  adaptiveChunkingEnabled: boolean;
  startTime: number;
  endTime?: number;
}
