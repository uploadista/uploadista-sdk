/**
 * Logger interface for Uploadista client operations.
 *
 * Provides structured logging capabilities for debugging upload progress,
 * flow execution, and client operations. Platform implementations should
 * provide their own logging functions (e.g., console.log, custom loggers).
 *
 * @example Using with console
 * ```typescript
 * const logger = createLogger(true, console.log);
 * logger.log('Upload started');
 * logger.warn('Retrying failed chunk');
 * logger.error('Upload failed');
 * ```
 */
export type Logger = {
  /**
   * Log informational messages (e.g., upload progress, state changes)
   */
  log: (message: string) => void;

  /**
   * Log warning messages (e.g., retry attempts, degraded performance)
   */
  warn: (message: string) => void;

  /**
   * Log error messages (e.g., upload failures, network errors)
   */
  error: (message: string) => void;
};

/**
 * Platform-specific logging function type.
 *
 * Accepts a message string and outputs it to the appropriate logging destination.
 * This abstraction allows the client to work across different platforms
 * (browser, Node.js, React Native) with their own logging mechanisms.
 */
export type LogFunction = (message: string) => void;

/**
 * Default no-op logger function.
 *
 * Used when no custom logging function is provided.
 * Platform implementations should provide their own (e.g., console.log).
 */
const noopLog: LogFunction = () => {
  // No-op by default - platforms will override
};

/**
 * Creates a Logger instance with configurable output.
 *
 * This factory function creates a logger that can be enabled/disabled
 * and customized with a platform-specific logging function.
 *
 * @param enabled - Whether logging is enabled. When false, all log calls are no-ops
 * @param logFn - Optional custom logging function. Defaults to no-op. Pass console.log for browser/Node.js
 * @returns A Logger instance with log, warn, and error methods
 *
 * @example Basic usage with console
 * ```typescript
 * const logger = createLogger(true, console.log);
 * logger.log('Upload started');
 * ```
 *
 * @example Disabled logger (no output)
 * ```typescript
 * const logger = createLogger(false);
 * logger.log('This will not be logged');
 * ```
 *
 * @example Custom logging function
 * ```typescript
 * const customLog = (msg: string) => {
 *   // Send to analytics service
 *   analytics.track('upload_log', { message: msg });
 * };
 * const logger = createLogger(true, customLog);
 * ```
 */
export function createLogger(
  enabled: boolean,
  logFn: LogFunction = noopLog,
): Logger {
  return {
    log: (message: string) => {
      if (enabled) {
        logFn(message);
      }
    },
    warn: (message: string) => {
      if (enabled) {
        logFn(message);
      }
    },
    error: (message: string) => {
      if (enabled) {
        logFn(message);
      }
    },
  };
}
