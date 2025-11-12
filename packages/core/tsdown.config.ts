import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "errors/index": "src/errors/index.ts",
    "types/index": "src/types/index.ts",
    "flow/index": "src/flow/index.ts",
    "upload/index": "src/upload/index.ts",
    "streams/index": "src/streams/index.ts",
    "utils/index": "src/utils/index.ts",
    "testing/index": "src/testing/index.ts",
  },
  minify: true,
  format: ["esm", "cjs"],
  dts: true,
  outDir: "dist",
});
