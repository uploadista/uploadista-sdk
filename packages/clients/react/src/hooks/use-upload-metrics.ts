import type {
  ChunkMetrics,
  PerformanceInsights,
  UploadSessionMetrics,
} from "@uploadista/client-core";
import React, { useCallback, useRef, useState } from "react";
import { useUploadistaContext } from "../components/uploadista-provider";

export type Timeout = ReturnType<typeof setInterval>;

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

export interface UseUploadMetricsReturn {
  /**
   * Current overall metrics
   */
  metrics: UploadMetrics;

  /**
   * Individual file metrics
   */
  fileMetrics: FileUploadMetrics[];

  /**
   * Start tracking a new file upload
   */
  startFileUpload: (id: string, filename: string, size: number) => void;

  /**
   * Update progress for a file upload
   */
  updateFileProgress: (id: string, bytesUploaded: number) => void;

  /**
   * Mark a file upload as complete
   */
  completeFileUpload: (id: string) => void;

  /**
   * Remove a file from tracking
   */
  removeFile: (id: string) => void;

  /**
   * Reset all metrics
   */
  reset: () => void;

  /**
   * Get metrics for a specific file
   */
  getFileMetrics: (id: string) => FileUploadMetrics | undefined;

  /**
   * Export metrics as JSON
   */
  exportMetrics: () => {
    overall: UploadMetrics;
    files: FileUploadMetrics[];
    exportTime: number;
  };
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
 * React hook for tracking detailed upload metrics and performance statistics.
 * Provides comprehensive monitoring of upload progress, speed, and timing data.
 *
 * @param options - Configuration and event handlers
 * @returns Upload metrics state and control methods
 *
 * @example
 * ```tsx
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
 *
 * // Display metrics
 * return (
 *   <div>
 *     <div>Overall Progress: {uploadMetrics.metrics.progress}%</div>
 *     <div>Speed: {(uploadMetrics.metrics.currentSpeed / 1024).toFixed(1)} KB/s</div>
 *     <div>Files: {uploadMetrics.metrics.completedFiles}/{uploadMetrics.metrics.totalFiles}</div>
 *
 *     {uploadMetrics.metrics.estimatedTimeRemaining && (
 *       <div>ETA: {Math.round(uploadMetrics.metrics.estimatedTimeRemaining / 1000)}s</div>
 *     )}
 *
 *     {uploadMetrics.fileMetrics.map((file) => (
 *       <div key={file.id}>
 *         {file.filename}: {file.progress}% ({(file.speed / 1024).toFixed(1)} KB/s)
 *       </div>
 *     ))}
 *   </div>
 * );
 * ```
 */
export function useUploadMetrics(
  options: UseUploadMetricsOptions = {},
): UseUploadMetricsReturn {
  const {
    speedCalculationInterval = 1000,
    speedSampleSize = 10,
    onMetricsUpdate,
    onFileStart,
    onFileProgress,
    onFileComplete,
  } = options;

  const uploadClient = useUploadistaContext();

  const [metrics, setMetrics] = useState<UploadMetrics>(initialMetrics);
  const [fileMetrics, setFileMetrics] = useState<FileUploadMetrics[]>([]);

  const speedSamplesRef = useRef<Array<{ time: number; bytes: number }>>([]);
  const lastUpdateRef = useRef<number>(0);
  const intervalRef = useRef<Timeout | null>(null);

  const calculateSpeed = useCallback(
    (currentTime: number, totalBytesUploaded: number) => {
      const sample = { time: currentTime, bytes: totalBytesUploaded };
      speedSamplesRef.current.push(sample);

      // Keep only recent samples
      if (speedSamplesRef.current.length > speedSampleSize) {
        speedSamplesRef.current = speedSamplesRef.current.slice(
          -speedSampleSize,
        );
      }

      // Calculate current speed (bytes per second)
      let currentSpeed = 0;
      if (speedSamplesRef.current.length >= 2) {
        const recent =
          speedSamplesRef.current[speedSamplesRef.current.length - 1];
        const previous =
          speedSamplesRef.current[speedSamplesRef.current.length - 2];
        if (recent && previous) {
          const timeDiff = (recent.time - previous.time) / 1000; // Convert to seconds
          const bytesDiff = recent.bytes - previous.bytes;
          currentSpeed = timeDiff > 0 ? bytesDiff / timeDiff : 0;
        }
      }

      // Calculate average speed
      let averageSpeed = 0;
      if (speedSamplesRef.current.length >= 2) {
        const first = speedSamplesRef.current[0];
        const last =
          speedSamplesRef.current[speedSamplesRef.current.length - 1];
        if (first && last) {
          const totalTime = (last.time - first.time) / 1000; // Convert to seconds
          const totalBytes = last.bytes - first.bytes;
          averageSpeed = totalTime > 0 ? totalBytes / totalTime : 0;
        }
      }

      return { currentSpeed, averageSpeed };
    },
    [speedSampleSize],
  );

  const updateMetrics = useCallback(() => {
    const now = Date.now();

    // Calculate totals from file metrics
    const totalBytes = fileMetrics.reduce((sum, file) => sum + file.size, 0);
    const totalBytesUploaded = fileMetrics.reduce(
      (sum, file) => sum + file.bytesUploaded,
      0,
    );
    const completedFiles = fileMetrics.filter((file) => file.isComplete).length;
    const activeUploads = fileMetrics.filter(
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
    const activeTimes = fileMetrics.filter((file) => file.startTime > 0);
    const startTime =
      activeTimes.length > 0
        ? Math.min(...activeTimes.map((file) => file.startTime))
        : null;

    const completedTimes = fileMetrics.filter((file) => file.endTime !== null);
    const endTime =
      completedTimes.length > 0 && completedFiles === fileMetrics.length
        ? Math.max(
            ...completedTimes
              .map((file) => file.endTime)
              .filter((time) => time !== null),
          )
        : null;

    const totalDuration = startTime && endTime ? endTime - startTime : null;

    const newMetrics: UploadMetrics = {
      totalBytesUploaded,
      totalBytes,
      averageSpeed,
      currentSpeed,
      estimatedTimeRemaining,
      totalFiles: fileMetrics.length,
      completedFiles,
      activeUploads,
      progress,
      peakSpeed: Math.max(metrics.peakSpeed, currentSpeed),
      startTime,
      endTime,
      totalDuration,
      insights: uploadClient.client.getChunkingInsights(),
      sessionMetrics: [uploadClient.client.exportMetrics().session],
      chunkMetrics: uploadClient.client.exportMetrics().chunks,
    };

    setMetrics(newMetrics);
    onMetricsUpdate?.(newMetrics);
  }, [
    fileMetrics,
    metrics.peakSpeed,
    calculateSpeed,
    onMetricsUpdate,
    uploadClient.client,
  ]);

  // Set up periodic speed calculations
  const setupSpeedCalculation = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      if (
        fileMetrics.some((file) => !file.isComplete && file.bytesUploaded > 0)
      ) {
        updateMetrics();
      }
    }, speedCalculationInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [speedCalculationInterval, updateMetrics, fileMetrics]);

  const startFileUpload = useCallback(
    (id: string, filename: string, size: number) => {
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

      setFileMetrics((prev) => {
        const existing = prev.find((file) => file.id === id);
        if (existing) {
          return prev.map((file) => (file.id === id ? fileMetric : file));
        }
        return [...prev, fileMetric];
      });

      onFileStart?.(fileMetric);

      // Start speed calculation if this is the first active upload
      if (fileMetrics.filter((file) => !file.isComplete).length === 0) {
        setupSpeedCalculation();
      }
    },
    [fileMetrics, onFileStart, setupSpeedCalculation],
  );

  const updateFileProgress = useCallback(
    (id: string, bytesUploaded: number) => {
      const now = Date.now();

      setFileMetrics((prev) =>
        prev.map((file) => {
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
        }),
      );

      // Trigger metrics update
      setTimeout(updateMetrics, 0);
    },
    [onFileProgress, updateMetrics],
  );

  const completeFileUpload = useCallback(
    (id: string) => {
      const now = Date.now();

      setFileMetrics((prev) =>
        prev.map((file) => {
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
        }),
      );

      // Trigger metrics update
      setTimeout(updateMetrics, 0);
    },
    [onFileComplete, updateMetrics],
  );

  const removeFile = useCallback(
    (id: string) => {
      setFileMetrics((prev) => prev.filter((file) => file.id !== id));
      setTimeout(updateMetrics, 0);
    },
    [updateMetrics],
  );

  const reset = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setMetrics(initialMetrics);
    setFileMetrics([]);
    speedSamplesRef.current = [];
    lastUpdateRef.current = 0;
  }, []);

  const getFileMetrics = useCallback(
    (id: string) => {
      return fileMetrics.find((file) => file.id === id);
    },
    [fileMetrics],
  );

  const exportMetrics = useCallback(() => {
    return {
      overall: metrics,
      files: fileMetrics,
      exportTime: Date.now(),
    };
  }, [metrics, fileMetrics]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    metrics,
    fileMetrics,
    startFileUpload,
    updateFileProgress,
    completeFileUpload,
    removeFile,
    reset,
    getFileMetrics,
    exportMetrics,
  };
}
