import { onUnmounted, readonly, ref } from "vue";
import { useUploadistaClient } from "./useUploadistaClient";

// Types
// biome-ignore lint/suspicious/noExplicitAny: Placeholder for detailed metrics types
type ChunkMetrics = any;
// biome-ignore lint/suspicious/noExplicitAny: Placeholder for detailed metrics types
type PerformanceInsights = any;
// biome-ignore lint/suspicious/noExplicitAny: Placeholder for detailed metrics types
type UploadSessionMetrics = any;

export interface UploadMetrics {
  /**
   * Total bytes uploaded across all files
   */
  totalBytesUploaded: number;

  /**
   * Total bytes to upload across all files
   */
  totalBytes: number;

  /**
   * Overall upload speed in bytes per second
   */
  averageSpeed: number;

  /**
   * Current upload speed in bytes per second
   */
  currentSpeed: number;

  /**
   * Estimated time remaining in milliseconds
   */
  estimatedTimeRemaining: number | null;

  /**
   * Total number of files being tracked
   */
  totalFiles: number;

  /**
   * Number of files completed
   */
  completedFiles: number;

  /**
   * Number of files currently uploading
   */
  activeUploads: number;

  /**
   * Overall progress as percentage (0-100)
   */
  progress: number;

  /**
   * Peak upload speed achieved
   */
  peakSpeed: number;

  /**
   * Start time of the first upload
   */
  startTime: number | null;

  /**
   * End time of the last completed upload
   */
  endTime: number | null;

  /**
   * Total duration of all uploads
   */
  totalDuration: number | null;

  /**
   * Detailed performance insights from the upload client
   */
  insights: PerformanceInsights;

  /**
   * Session metrics for completed uploads
   */
  sessionMetrics: Partial<UploadSessionMetrics>[];

  /**
   * Detailed chunk metrics from recent uploads
   */
  chunkMetrics: ChunkMetrics[];
}

export interface FileUploadMetrics {
  id: string;
  filename: string;
  size: number;
  bytesUploaded: number;
  progress: number;
  speed: number;
  startTime: number;
  endTime: number | null;
  duration: number | null;
  isComplete: boolean;
}

export interface UseUploadMetricsOptions {
  /**
   * Interval for calculating current speed (in milliseconds)
   */
  speedCalculationInterval?: number;

  /**
   * Number of speed samples to keep for average calculation
   */
  speedSampleSize?: number;

  /**
   * Called when metrics are updated
   */
  onMetricsUpdate?: (metrics: UploadMetrics) => void;

  /**
   * Called when a file upload starts
   */
  onFileStart?: (fileMetrics: FileUploadMetrics) => void;

  /**
   * Called when a file upload progresses
   */
  onFileProgress?: (fileMetrics: FileUploadMetrics) => void;

  /**
   * Called when a file upload completes
   */
  onFileComplete?: (fileMetrics: FileUploadMetrics) => void;
}

const initialMetrics: UploadMetrics = {
  totalBytesUploaded: 0,
  totalBytes: 0,
  averageSpeed: 0,
  currentSpeed: 0,
  estimatedTimeRemaining: null,
  totalFiles: 0,
  completedFiles: 0,
  activeUploads: 0,
  progress: 0,
  peakSpeed: 0,
  startTime: null,
  endTime: null,
  totalDuration: null,
  insights: {
    overallEfficiency: 0,
    chunkingEffectiveness: 0,
    networkStability: 0,
    recommendations: [],
    optimalChunkSizeRange: { min: 256 * 1024, max: 2 * 1024 * 1024 },
  },
  sessionMetrics: [],
  chunkMetrics: [],
};

/**
 * Vue composable for tracking detailed upload metrics and performance statistics.
 * Provides comprehensive monitoring of upload progress, speed, and timing data.
 *
 * @param options - Configuration and event handlers
 * @returns Upload metrics state and control methods
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useUploadMetrics } from '@uploadista/vue';
 *
 * const uploadMetrics = useUploadMetrics({
 *   speedCalculationInterval: 1000, // Update speed every second
 *   speedSampleSize: 10, // Keep last 10 speed samples for average
 *   onMetricsUpdate: (metrics) => {
 *     console.log(`Overall progress: ${metrics.progress}%`);
 *     console.log(`Speed: ${(metrics.currentSpeed / 1024).toFixed(1)} KB/s`);
 *     console.log(`ETA: ${metrics.estimatedTimeRemaining}ms`);
 *   },
 *   onFileComplete: (fileMetrics) => {
 *     console.log(`${fileMetrics.filename} completed in ${fileMetrics.duration}ms`);
 *   },
 * });
 *
 * // Start tracking a file
 * const handleFileStart = (file: File) => {
 *   uploadMetrics.startFileUpload(file.name, file.name, file.size);
 * };
 *
 * // Update progress during upload
 * const handleProgress = (fileId: string, bytesUploaded: number) => {
 *   uploadMetrics.updateFileProgress(fileId, bytesUploaded);
 * };
 * </script>
 *
 * <template>
 *   <div>
 *     <div>Overall Progress: {{ uploadMetrics.metrics.progress }}%</div>
 *     <div>Speed: {{ (uploadMetrics.metrics.currentSpeed / 1024).toFixed(1) }} KB/s</div>
 *     <div>Files: {{ uploadMetrics.metrics.completedFiles }}/{{ uploadMetrics.metrics.totalFiles }}</div>
 *
 *     <div v-if="uploadMetrics.metrics.estimatedTimeRemaining">
 *       ETA: {{ Math.round(uploadMetrics.metrics.estimatedTimeRemaining / 1000) }}s
 *     </div>
 *
 *     <div v-for="file in uploadMetrics.fileMetrics" :key="file.id">
 *       {{ file.filename }}: {{ file.progress }}% ({{ (file.speed / 1024).toFixed(1) }} KB/s)
 *     </div>
 *   </div>
 * </template>
 * ```
 */
export function useUploadMetrics(options: UseUploadMetricsOptions = {}) {
  const {
    speedCalculationInterval = 1000,
    speedSampleSize = 10,
    onMetricsUpdate,
    onFileStart,
    onFileProgress,
    onFileComplete,
  } = options;

  const uploadClient = useUploadistaClient();

  const metrics = ref<UploadMetrics>({ ...initialMetrics });
  const fileMetrics = ref<FileUploadMetrics[]>([]);

  const speedSamples = ref<Array<{ time: number; bytes: number }>>([]);
  const lastUpdate = ref<number>(0);
  const interval = ref<ReturnType<typeof setInterval> | null>(null);

  const calculateSpeed = (currentTime: number, totalBytesUploaded: number) => {
    const sample = { time: currentTime, bytes: totalBytesUploaded };
    speedSamples.value.push(sample);

    // Keep only recent samples
    if (speedSamples.value.length > speedSampleSize) {
      speedSamples.value = speedSamples.value.slice(-speedSampleSize);
    }

    // Calculate current speed (bytes per second)
    let currentSpeed = 0;
    if (speedSamples.value.length >= 2) {
      const recent = speedSamples.value[speedSamples.value.length - 1];
      const previous = speedSamples.value[speedSamples.value.length - 2];
      if (recent && previous) {
        const timeDiff = (recent.time - previous.time) / 1000; // Convert to seconds
        const bytesDiff = recent.bytes - previous.bytes;
        currentSpeed = timeDiff > 0 ? bytesDiff / timeDiff : 0;
      }
    }

    // Calculate average speed
    let averageSpeed = 0;
    if (speedSamples.value.length >= 2) {
      const first = speedSamples.value[0];
      const last = speedSamples.value[speedSamples.value.length - 1];
      if (first && last) {
        const totalTime = (last.time - first.time) / 1000; // Convert to seconds
        const totalBytes = last.bytes - first.bytes;
        averageSpeed = totalTime > 0 ? totalBytes / totalTime : 0;
      }
    }

    return { currentSpeed, averageSpeed };
  };

  const updateMetrics = () => {
    const now = Date.now();

    // Calculate totals from file metrics
    const totalBytes = fileMetrics.value.reduce(
      (sum, file) => sum + file.size,
      0,
    );
    const totalBytesUploaded = fileMetrics.value.reduce(
      (sum, file) => sum + file.bytesUploaded,
      0,
    );
    const completedFiles = fileMetrics.value.filter(
      (file) => file.isComplete,
    ).length;
    const activeUploads = fileMetrics.value.filter(
      (file) => !file.isComplete && file.bytesUploaded > 0,
    ).length;

    // Calculate speeds
    const { currentSpeed, averageSpeed } = calculateSpeed(
      now,
      totalBytesUploaded,
    );

    // Calculate progress
    const progress =
      totalBytes > 0 ? Math.round((totalBytesUploaded / totalBytes) * 100) : 0;

    // Calculate estimated time remaining
    let estimatedTimeRemaining: number | null = null;
    if (currentSpeed > 0) {
      const remainingBytes = totalBytes - totalBytesUploaded;
      estimatedTimeRemaining = (remainingBytes / currentSpeed) * 1000; // Convert to milliseconds
    }

    // Find start and end times
    const activeTimes = fileMetrics.value.filter((file) => file.startTime > 0);
    const startTime =
      activeTimes.length > 0
        ? Math.min(...activeTimes.map((file) => file.startTime))
        : null;

    const completedTimes = fileMetrics.value.filter(
      (file) => file.endTime !== null,
    );
    const endTime =
      completedTimes.length > 0 && completedFiles === fileMetrics.value.length
        ? Math.max(
            ...(completedTimes
              .map((file) => file.endTime)
              .filter((time) => time !== null) as number[]),
          )
        : null;

    const totalDuration = startTime && endTime ? endTime - startTime : null;

    const newMetrics: UploadMetrics = {
      totalBytesUploaded,
      totalBytes,
      averageSpeed,
      currentSpeed,
      estimatedTimeRemaining,
      totalFiles: fileMetrics.value.length,
      completedFiles,
      activeUploads,
      progress,
      peakSpeed: Math.max(metrics.value.peakSpeed, currentSpeed),
      startTime,
      endTime,
      totalDuration,
      insights: uploadClient.client.getChunkingInsights(),
      sessionMetrics: [uploadClient.client.exportMetrics().session],
      chunkMetrics: uploadClient.client.exportMetrics().chunks,
    };

    metrics.value = newMetrics;
    onMetricsUpdate?.(newMetrics);
  };

  // Set up periodic speed calculations
  const setupSpeedCalculation = () => {
    if (interval.value) {
      clearInterval(interval.value);
    }

    interval.value = setInterval(() => {
      if (
        fileMetrics.value.some(
          (file) => !file.isComplete && file.bytesUploaded > 0,
        )
      ) {
        updateMetrics();
      }
    }, speedCalculationInterval);
  };

  const startFileUpload = (id: string, filename: string, size: number) => {
    const now = Date.now();

    const fileMetric: FileUploadMetrics = {
      id,
      filename,
      size,
      bytesUploaded: 0,
      progress: 0,
      speed: 0,
      startTime: now,
      endTime: null,
      duration: null,
      isComplete: false,
    };

    const existing = fileMetrics.value.find((file) => file.id === id);
    if (existing) {
      fileMetrics.value = fileMetrics.value.map((file) =>
        file.id === id ? fileMetric : file,
      );
    } else {
      fileMetrics.value = [...fileMetrics.value, fileMetric];
    }

    onFileStart?.(fileMetric);

    // Start speed calculation if this is the first active upload
    if (fileMetrics.value.filter((file) => !file.isComplete).length === 1) {
      setupSpeedCalculation();
    }
  };

  const updateFileProgress = (id: string, bytesUploaded: number) => {
    const now = Date.now();

    fileMetrics.value = fileMetrics.value.map((file) => {
      if (file.id !== id) return file;

      const timeDiff = (now - file.startTime) / 1000; // seconds
      const speed = timeDiff > 0 ? bytesUploaded / timeDiff : 0;
      const progress =
        file.size > 0 ? Math.round((bytesUploaded / file.size) * 100) : 0;

      const updatedFile = {
        ...file,
        bytesUploaded,
        progress,
        speed,
      };

      onFileProgress?.(updatedFile);
      return updatedFile;
    });

    // Trigger metrics update
    setTimeout(updateMetrics, 0);
  };

  const completeFileUpload = (id: string) => {
    const now = Date.now();

    fileMetrics.value = fileMetrics.value.map((file) => {
      if (file.id !== id) return file;

      const duration = now - file.startTime;
      const speed = duration > 0 ? (file.size / duration) * 1000 : 0; // bytes per second

      const completedFile = {
        ...file,
        bytesUploaded: file.size,
        progress: 100,
        speed,
        endTime: now,
        duration,
        isComplete: true,
      };

      onFileComplete?.(completedFile);
      return completedFile;
    });

    // Trigger metrics update
    setTimeout(updateMetrics, 0);
  };

  const removeFile = (id: string) => {
    fileMetrics.value = fileMetrics.value.filter((file) => file.id !== id);
    setTimeout(updateMetrics, 0);
  };

  const reset = () => {
    if (interval.value) {
      clearInterval(interval.value);
      interval.value = null;
    }

    metrics.value = { ...initialMetrics };
    fileMetrics.value = [];
    speedSamples.value = [];
    lastUpdate.value = 0;
  };

  const getFileMetrics = (id: string) => {
    return fileMetrics.value.find((file) => file.id === id);
  };

  const exportMetrics = () => {
    return {
      overall: metrics.value,
      files: fileMetrics.value,
      exportTime: Date.now(),
    };
  };

  // Cleanup on unmount
  onUnmounted(() => {
    if (interval.value) {
      clearInterval(interval.value);
    }
  });

  return {
    metrics: readonly(metrics),
    fileMetrics: readonly(fileMetrics),
    startFileUpload,
    updateFileProgress,
    completeFileUpload,
    removeFile,
    reset,
    getFileMetrics,
    exportMetrics,
  };
}
