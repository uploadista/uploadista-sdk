import { useCallback, useRef, useState } from "react";
import type { UploadMetrics } from "../types";

/**
 * Hook for tracking upload performance metrics
 * @returns Metrics object and methods to track uploads
 */
export function useUploadMetrics() {
  const startTimeRef = useRef<number | null>(null);
  const startBytesRef = useRef<number>(0);
  const peakSpeedRef = useRef<number>(0);

  const [metrics, setMetrics] = useState<UploadMetrics>({
    totalBytes: 0,
    durationMs: 0,
    avgSpeed: 0,
    peakSpeed: 0,
    retries: 0,
  });

  // Start tracking
  const start = useCallback(() => {
    startTimeRef.current = Date.now();
    startBytesRef.current = 0;
    peakSpeedRef.current = 0;
  }, []);

  // Update metrics based on current progress
  const update = useCallback(
    (uploadedBytes: number, _totalBytes: number, currentRetries = 0) => {
      if (!startTimeRef.current) {
        return;
      }

      const now = Date.now();
      const durationMs = now - startTimeRef.current;
      const speed = durationMs > 0 ? (uploadedBytes / durationMs) * 1000 : 0;

      if (speed > peakSpeedRef.current) {
        peakSpeedRef.current = speed;
      }

      setMetrics({
        totalBytes: uploadedBytes,
        durationMs,
        avgSpeed: durationMs > 0 ? (uploadedBytes / durationMs) * 1000 : 0,
        peakSpeed: peakSpeedRef.current,
        retries: currentRetries,
      });
    },
    [],
  );

  // End tracking and return final metrics
  const end = useCallback(() => {
    const finalMetrics = metrics;
    startTimeRef.current = null;
    return finalMetrics;
  }, [metrics]);

  // Reset metrics
  const reset = useCallback(() => {
    startTimeRef.current = null;
    startBytesRef.current = 0;
    peakSpeedRef.current = 0;
    setMetrics({
      totalBytes: 0,
      durationMs: 0,
      avgSpeed: 0,
      peakSpeed: 0,
      retries: 0,
    });
  }, []);

  return {
    metrics,
    start,
    update,
    end,
    reset,
  };
}
