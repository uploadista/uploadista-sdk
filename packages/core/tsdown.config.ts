import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "errors/index": "src/errors/index.ts",
    "types/index": "src/types/index.ts",
    "flow/index": "src/flow/index.ts",
    "upload/index": "src/upload/index.ts",
    "logger/logger": "src/logger/logger.ts",
    "streams/multi-stream": "src/streams/multi-stream.ts",
    "streams/stream-limiter": "src/streams/stream-limiter.ts",
    "streams/stream-splitter": "src/streams/stream-splitter.ts",
    "utils/debounce": "src/utils/debounce.ts",
    "utils/generate-id": "src/utils/generate-id.ts",
    "utils/md5": "src/utils/md5.ts",
    "utils/once": "src/utils/once.ts",
    "utils/semaphore": "src/utils/semaphore.ts",
    "utils/throttle": "src/utils/throttle.ts",
  },
  minify: true,
  format: ["esm", "cjs"],
  dts: true,
  outDir: "dist",
});
