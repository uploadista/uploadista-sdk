export interface ChunkMetrics {
  chunkIndex: number;
  size: number;
  duration: number;
  speed: number; // bytes per second
  success: boolean;
  retryCount: number;
  timestamp: number;
  networkCondition?: string;
  chunkingStrategy?: string;
}
