export type Logger = {
  log: (message: string) => void;
};

export function createLogger(enabled: boolean): Logger {
  return {
    log: (message: string) => {
      if (enabled) {
        // eslint-disable-next-line no-console
        console.log(message);
      }
    },
  };
}
