export type Logger = {
  log: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

export type LogFunction = (message: string) => void;

/**
 * Default no-op logger function (platform implementations should provide their own)
 */
const noopLog: LogFunction = () => {
  // No-op by default - platforms will override
};

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
