import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    "nodes/index": "src/nodes/index.ts",
    "types/index": "src/types/index.ts",
  },
  minify: true,
  format: ["esm", "cjs"],
  dts: true,
  outDir: "dist",
});
